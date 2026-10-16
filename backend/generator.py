"""
generator.py — генерация учебных работ через Claude API.
Модель: claude-sonnet-4-5
"""

import contextvars
import os
import json
import random
import re
import time
from dotenv import load_dotenv
import anthropic
from github_proxy import ask_via_github
from applog import get_logger
import jobstore

load_dotenv()

log = get_logger()

client = anthropic.Anthropic(
    api_key=os.getenv("ANTHROPIC_API_KEY"),
    base_url=os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com"),
)
MODEL  = "claude-sonnet-4-5"

# GitHub Actions прокси используется в prod для обхода блокировки Claude API из РФ.
# Локально (или там, где api.anthropic.com доступен напрямую) достаточно ANTHROPIC_API_KEY —
# в этом случае GITHUB_TOKEN/GITHUB_REPO/PROXY_SECRET можно не задавать.
USE_GITHUB_PROXY = bool(os.getenv("GITHUB_TOKEN")) and bool(os.getenv("GITHUB_REPO")) and bool(os.getenv("PROXY_SECRET"))

# Потокобезопасный счётчик стоимости генерации (изолирован для каждого потока/задачи)
_session_cost_var: contextvars.ContextVar[float] = contextvars.ContextVar("session_cost", default=0.0)

def get_session_cost() -> float:
    return _session_cost_var.get()

def reset_session_cost() -> None:
    _session_cost_var.set(0.0)

def add_session_cost(amount: float) -> float:
    new_val = _session_cost_var.get() + amount
    _session_cost_var.set(new_val)
    return new_val


from utils.language import (
    LANG_LABELS,
    detect_language_from_topic,
    get_lang_labels as _lang_labels,
    canonical_service_key as _canonical_service_key,
)


# ── Ретраи: транзиентные сбои не должны убивать генерацию ────────────────────

# Максимальное число попыток одного вызова Claude (1 основная + 4 ретрая).
ASK_MAX_ATTEMPTS = 5
# Базовая задержка backoff (сек). Растёт экспоненциально: 2, 4, 8, 16 + jitter.
ASK_BACKOFF_BASE_SEC = 2.0
ASK_BACKOFF_MAX_SEC = 60.0


def _is_retryable_error(exc: Exception) -> bool:
    """Транзиентные ошибки → ретрай. Фатальные (ключи/модель) → сразу наверх."""
    # Сетевые/таймауты SDK
    if isinstance(exc, (anthropic.APIConnectionError, anthropic.APITimeoutError)):
        return True
    # 429 rate limit, 5xx, 529 overloaded — ретраим
    if isinstance(exc, anthropic.RateLimitError):
        return True
    if isinstance(exc, anthropic.InternalServerError):
        return True
    # GitHub-прокси: любые его RuntimeError — по сути сетевые (dispatch, timeout, callback)
    if isinstance(exc, RuntimeError):
        return True
    # Прочее (AuthenticationError, BadRequest, PermissionDenied, NotFound) — не ретраим
    return False


def _backoff_delay(attempt: int) -> float:
    """Экспоненциальный backoff с jitter: 2s, 4s, 8s, 16s (±25%)."""
    delay = min(ASK_BACKOFF_BASE_SEC * (2 ** (attempt - 1)), ASK_BACKOFF_MAX_SEC)
    return delay * random.uniform(0.75, 1.25)


def ask(prompt: str, max_tokens: int = 8000) -> str:
    """
    Запрос к Claude API с ретраями и exponential backoff.
    Через GitHub Actions прокси (prod/RU) или напрямую (локальная разработка).
    Один транзиентный сбой (429/5xx/таймаут/сеть) больше не убивает генерацию.
    """
    label = "Proxy" if USE_GITHUB_PROXY else "Direct"
    last_exc: Exception | None = None

    for attempt in range(1, ASK_MAX_ATTEMPTS + 1):
        try:
            if USE_GITHUB_PROXY:
                text, usage = ask_via_github(MODEL, max_tokens, [{"role": "user", "content": prompt}])
            else:
                response = client.messages.create(
                    model=MODEL,
                    max_tokens=max_tokens,
                    messages=[{"role": "user", "content": prompt}],
                )
                text = response.content[0].text.strip()
                usage = {"input_tokens": response.usage.input_tokens, "output_tokens": response.usage.output_tokens}
        except Exception as exc:
            last_exc = exc
            if attempt >= ASK_MAX_ATTEMPTS or not _is_retryable_error(exc):
                log.error(
                    "ask() попытка %d/%d не удалась (%s: %s) — ретраев больше нет",
                    attempt, ASK_MAX_ATTEMPTS, type(exc).__name__, str(exc)[:300],
                )
                raise
            delay = _backoff_delay(attempt)
            log.warning(
                "ask() попытка %d/%d не удалась (%s: %s) → пауза %.1fs и повтор",
                attempt, ASK_MAX_ATTEMPTS, type(exc).__name__, str(exc)[:300], delay,
            )
            time.sleep(delay)
            continue

        # Успех: учёт стоимости
        input_tokens  = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)
        curr_cost = add_session_cost(input_tokens * 3e-6 + output_tokens * 15e-6)
        if attempt > 1:
            log.info("[%s] Ответ получен с попытки %d, длина: %d, токены: %d+%d, стоимость сессии: $%.4f",
                     label, attempt, len(text), input_tokens, output_tokens, curr_cost)
        else:
            log.info("[%s] Ответ получен, длина: %d, токены: %d+%d, стоимость сессии: $%.4f",
                     label, len(text), input_tokens, output_tokens, curr_cost)
        return text

    # Недостижимо (цикл либо вернёт текст, либо raise), но для надёжности:
    raise last_exc or RuntimeError("ask(): исчерпаны попытки")


def _extract_json_block(raw: str) -> str:
    """Вытаскивает JSON-объект из ответа (в т.ч. из ```json ... ```)."""
    if "```" in raw:
        for part in raw.split("```"):
            if "{" in part:
                raw = part.lstrip("json").strip()
                break
    return raw


def ask_json(prompt: str) -> dict:
    """
    Запрос к Claude, возвращает JSON.
    При невалидном JSON — до 2 дополнительных попыток с усиленным требованием.
    """
    json_prompt = prompt + "\n\nВерни ТОЛЬКО валидный JSON без markdown и пояснений."
    last_exc: Exception | None = None
    for json_attempt in range(1, 3):
        raw = ask(json_prompt)
        try:
            return json.loads(_extract_json_block(raw))
        except json.JSONDecodeError as exc:
            last_exc = exc
            log.warning("ask_json(): невалидный JSON (попытка %d/2): %s", json_attempt, str(exc)[:200])
            json_prompt = (
                prompt
                + "\n\nПРЕДЫДУЩИЙ ОТВЕТ БЫЛ НЕВАЛИДНЫМ JSON. Верни ИСПРАВЛЕННЫЙ, СТРОГО валидный JSON-объект: без markdown, без ```json, без пояснений до или после. Начни ответ с символа { и закончи }."
            )
    raise last_exc or RuntimeError("ask_json(): невалидный JSON")


def ask_json_limited(prompt: str, max_tokens: int = 1200) -> dict:
    """
    Claude → JSON с ограничением max_tokens (предпросмотр перед оплатой).
    При невалидном JSON — одна дополнительная попытка.
    """
    json_prompt = prompt + "\n\nВерни ТОЛЬКО валидный JSON без markdown и пояснений."
    for json_attempt in range(1, 3):
        raw = ask(json_prompt, max_tokens=max_tokens)
        try:
            return json.loads(_extract_json_block(raw))
        except json.JSONDecodeError as exc:
            log.warning("ask_json_limited(): невалидный JSON (попытка %d/2): %s", json_attempt, str(exc)[:200])
            json_prompt = (
                prompt
                + "\n\nПРЕДЫДУЩИЙ ОТВЕТ БЫЛ НЕВАЛИДНЫМ JSON. Верни ИСПРАВЛЕННЫЙ, СТРОГО валидный JSON-объект: без markdown, без ```json, без пояснений. Начни ответ с { и закончи }."
            )
    raise RuntimeError("ask_json_limited(): невалидный JSON после повторной попытки")


def ask_text(prompt: str) -> str:
    """Запрос к Claude, возвращает текст."""
    return clean_text(ask(prompt))


def clean_text(text: str) -> str:
    """Убирает markdown-артефакты из текста."""
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'\*{1,3}([^*]+)\*{1,3}', r'\1', text)
    text = re.sub(r'```[^`]*```', '', text, flags=re.DOTALL)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    text = re.sub(r'^[-*_]{3,}\s*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


from prompts.rules import (
    SERVICE_PAGES,
    PREVIEW_WORK_TYPES,
    WORK_RULES,
)


# ── Генерация источников через Claude ───────────────────────────────────────

def _looks_kz_source(src: str) -> bool:
    low = src.lower()
    markers = (
        ".kz",
        "gov.kz",
        "egov.kz",
        "stat.gov.kz",
        "қазақстан",
        "казахстан",
        "республика казахстан",
    )
    return any(m in low for m in markers)


def _normalize_kz_source_line(src: str) -> str:
    """Нормализует стиль библиографической строки для KZ-режима."""
    s = re.sub(r'^\d+\.\s*', '', (src or "").strip())
    if not s:
        return s
    # Единые пробелы и тире
    s = re.sub(r'\s+', ' ', s)
    s = s.replace(" – ", " — ").replace(" - ", " — ")
    # Нормализуем URL-блок
    s = re.sub(r'\b(?:URL|Url|url)\s*[:：]\s*', 'URL: ', s)
    if re.search(r'https?://', s) and "URL:" not in s:
        s = re.sub(r'\s*(https?://\S+)\s*$', r' URL: \1', s)
    # Единое окончание пунктом (кроме строк, оканчивающихся URL)
    if not re.search(r'https?://\S+\s*$', s) and not s.endswith("."):
        s += "."
    return s


def generate_sources(topic: str, count: int = 10, doc_lang: str = "ru") -> list[str]:
    """Генерирует реальные источники для списка литературы."""
    log.info("Генерирую %d источников для темы: %s | язык: %s", count, topic, doc_lang)
    if doc_lang == "kz":
        prompt = f"""Составь {count} реальных источников по теме «{topic}» для списка литературы.

Требования:
- Годы публикации строго 2021-2026
- НЕ включай отозванные статьи (WITHDRAWN, Retracted)
- Смешанный набор:
  1) 2-4 источника Казахстана (законы РК, eGov, gov.kz, stat.gov.kz, локальные журналы/вузы)
  2) 2-4 научных источника RU/EN
- Источники должны быть реалистичными и проверяемыми

Формат:
- Для книг и статей допускается ГОСТ-подобный формат
- Для нормативных/веб-источников: Название документа/страницы, год (или дата), URL

Верни ТОЛЬКО нумерованный список без пояснений и без markdown."""
    elif doc_lang == "en":
        prompt = f"""Create {count} real references on the topic "{topic}".

Requirements:
- Real, citable sources only
- Publication years: 2021-2026
- Mix books, journal papers, and institutional reports
- Exclude withdrawn/retracted papers

Format:
Book: Author. Title. City: Publisher, Year.
Article: Author. Title. Journal, Year, Issue, Pages.
Web: Organization. Title. Year. URL.

Return ONLY a numbered list without markdown."""
    else:
        prompt = f"""Составь {count} реальных русскоязычных источников по теме «{topic}» для списка литературы.

Требования:
- ТОЛЬКО реально существующие российские источники
- Годы публикации строго 2022-2026
- НЕ включай отозванные статьи (WITHDRAWN, Retracted)
- Минимум 4 книги/монографии и минимум 4 статьи из журналов
- Журналы должны быть реальными российскими изданиями

Формат строго по ГОСТ Р 7.0.5-2008:
Книга: Фамилия И.О. Название. — Город: Издательство, Год. — XXX с.
Статья: Фамилия И.О. Название статьи // Название журнала. — Год. — №N. — С. X–Y.

Верни ТОЛЬКО нумерованный список без пояснений и без markdown."""

    result = ask_text(prompt)
    lines = [l.strip() for l in result.split("\n") if l.strip() and l.strip()[0].isdigit()]
    if doc_lang == "kz":
        kz_count = sum(1 for l in lines if _looks_kz_source(l))
        if kz_count < 2:
            refill = ask_text(
                f"""Дай дополнительно 3-4 реальных источника Казахстана по теме «{topic}».
Обязательно используй источники уровня gov.kz / eGov / stat.gov.kz / вузы РК / журналы РК.
Верни только нумерованный список без пояснений."""
            )
            refill_lines = [l.strip() for l in refill.split("\n") if l.strip() and l.strip()[0].isdigit()]
            lines.extend(refill_lines)
            uniq = []
            seen = set()
            for line in lines:
                key = re.sub(r'^\d+\.\s*', '', line).strip().lower()
                if key in seen:
                    continue
                seen.add(key)
                uniq.append(line)
            lines = uniq[:count]
        # Нормализация стиля источников только для KZ.
        normalized_lines = []
        for line in lines:
            normalized = _normalize_kz_source_line(line)
            if normalized:
                normalized_lines.append(normalized)
        lines = [f"{i + 1}. {line}" for i, line in enumerate(normalized_lines)]
    log.info("Получено %d источников", len(lines))
    return lines


from prompts.structure import get_structure_prompt
from prompts.sections import (
    get_intro_prompt,
    get_section_prompt,
    get_conclusion_prompt,
)


# ── Специальная генерация для Сочинения и Эссе ─────────────────────────────

def generate_essay_or_composition(topic: str, pages: int, work_type: str, progress_cb=None) -> dict:
    """Генерация сочинения или эссе — единым текстом без глав."""

    rules = WORK_RULES[work_type]
    pages = max(rules["pages_min"], min(pages, rules["pages_max"]))
    total_words = pages * rules["words_per_page"]
    log.info("Пишу %s (~%d слов)...", work_type.lower(), total_words)

    if progress_cb:
        progress_cb(1, 3, "Подготавливаем структуру текста")

    if work_type == "Сочинение":
        prompt = f"""Напиши сочинение на тему «{topic}».
Объём: строго {total_words} слов — считай слова точно.

ОПРЕДЕЛИ ТИП СОЧИНЕНИЯ по теме «{topic}»:

— Если тема про личный опыт, природу, лето, каникулы, животных, семью, друзей — пиши как школьник 5-7 класса:
  - Простой разговорный язык, короткие предложения
  - Личные наблюдения из жизни: друзья, семья, природа, игры
  - Простые сравнения: "небо было синее-синее", "солнце припекало"
  - Эмоции: "Мне очень понравилось!", "Это было здорово!"
  - Никаких отсылок к писателям и литературным произведениям
  - Никакого академического языка

— Если тема про литературное произведение, анализ книги, образ героя, смысл романа — пиши как школьник 8-11 класса:
  - Более зрелый язык, но всё равно живой, не сухой
  - Уместны отсылки к произведению и автору
  - Личное мнение о прочитанном, эмоциональная оценка
  - Цитаты только если очень известные и короткие
  - Без наукообразных терминов

— Если тема философская, о жизни, о ценностях, о будущем — пиши как думающий подросток:
  - Рассуждения от первого лица
  - Примеры из жизни и из книг/фильмов, которые знает любой школьник
  - Живые формулировки, не канцелярит

Структура (не выделять заголовками!):
1. Вступление — введение в тему, основная мысль автора ({total_words // 6} слов)
2. Основная часть — рассуждения, примеры, личный опыт ({total_words * 2 // 3} слов)
3. Заключение — вывод, личная позиция ({total_words // 6} слов)

В любом случае:
- Текст должен звучать как написанный живым человеком, не нейросетью
- Никакого markdown форматирования: никаких #, **, *, ---
- Никаких заголовков и разделов внутри текста
- Плавные переходы между абзацами
- ТОЛЬКО русский язык

КРИТИЧЕСКИ ВАЖНО ПО ОБЪЁМУ:
- Целевой объём: {total_words} слов — это обязательное минимальное требование
- Считай слова по ходу написания
- Если текст получается короче — расширяй рассуждения, добавляй примеры и детали
- Лучше написать на 10-15% больше чем меньше целевого объёма
- НЕ обрезай текст искусственно

Верни ТОЛЬКО текст сочинения — без заголовка, без пояснений."""

    else:  # Эссе
        prompt = f"""Напиши эссе на тему «{topic}».
Объём: строго {total_words} слов — считай слова точно.

Структура (не выделять заголовками!):
1. Введение — постановка проблемы, тезис автора ({total_words // 6} слов)
2. Основная часть — аргументы, доказательства, контраргументы ({total_words * 2 // 3} слов)
3. Заключение — подтверждение тезиса, финальная мысль ({total_words // 6} слов)

Стиль:
- Разговорный, непринуждённый, но грамотный
- Авторская позиция — что ты думаешь по этому вопросу
- Аргументы + примеры для каждого
- Короткие и средние предложения, без громоздких конструкций
- НИКАКИХ заголовков, нумерации, разделов
- ТОЛЬКО русский язык

КРИТИЧЕСКИ ВАЖНО ПО ОБЪЁМУ:
- Целевой объём: {total_words} слов — это обязательное минимальное требование
- Считай слова по ходу написания
- Если текст получается короче — расширяй рассуждения, добавляй примеры и детали
- Лучше написать на 10-15% больше чем меньше целевого объёма
- НЕ обрезай текст искусственно

Верни ТОЛЬКО текст эссе — без заголовка, без пояснений."""

    if progress_cb:
        progress_cb(2, 3, "Генерируем основной текст")
    text = ask_text(prompt)
    _check_volume(work_type, text, total_words)
    if progress_cb:
        progress_cb(3, 3, "Финализируем результат")

    meta = {
        "Тип работы": work_type,
        "ГОСТ":       "7.32-2017",
        "Шрифт":      "Times New Roman, 14pt",
        "Интервал":   "1.5",
        "Объём":      f"~{pages} страниц",
    }

    return {
        "title":     f"{work_type} на тему: «{topic}»",
        "structure": ["Основная часть"],
        "content":   {"Основная часть": text},
        "sources":   [],
        "meta":      meta,
        "profile":   {},
    }


# ── Проверка объёма раздела ─────────────────────────────────────────────────

def _check_volume(label: str, text: str, expected_words: int) -> None:
    """Логирует предупреждение если раздел получился короче ожидаемого."""
    actual_chars = len(text)
    actual_words = len(text.split())
    min_chars    = expected_words * 5  # 5 символов на слово — минимум
    if actual_chars < min_chars:
        log.warning("  «%s» — %d симв. (~%d слов), ожидалось минимум %d слов (%d симв.)",
                    label, actual_chars, actual_words, expected_words, min_chars)
    else:
        log.info("  [OK] «%s» — %d симв. (~%d слов)", label, actual_chars, actual_words)


def _normalize_custom_structure(raw: list | None, work_type: str) -> list[str] | None:
    """Структура из превью: только для типов с главами; иначе None → AI-генерация."""
    if work_type in ("Сочинение", "Эссе", "Тест"):
        return None
    if not raw or not isinstance(raw, list):
        return None
    structure: list[str] = []
    for item in raw:
        s = str(item).strip()
        if s:
            structure.append(s[:300])
    if len(structure) < 3:
        return None
    body = [
        s for s in structure
        if _canonical_service_key(s) not in {"intro", "conclusion", "sources", "appendix"}
    ]
    if not body:
        return None
    return structure


# ── Главная функция генерации ───────────────────────────────────────────────

def generate_work(topic: str, pages: int, work_type: str = "Реферат",
                  profile: dict | None = None, progress_cb=None,
                  custom_structure: list[str] | None = None) -> dict:
    """
    Генерирует работу нужного типа через Claude API.
    Checkpoint/resume: промежуточные результаты пишутся на диск; при повторном
    запуске той же работы (та же тема/тип/объём) генерация продолжается с места сбоя.
    """
    reset_session_cost()

    log.info("=" * 60)
    log.info("Начало генерации: %s | Тема: %s | Страниц: %s", work_type, topic, pages)
    doc_lang = detect_language_from_topic(topic)
    labels = _lang_labels(doc_lang)
    log.info("Язык документа: %s", doc_lang)
    log.info("=" * 60)

    # Checkpoint: если эта же работа уже генерировалась и упала — продолжаем.
    ck_key = jobstore.checkpoint_key(topic, work_type, pages)
    ck = jobstore.load_checkpoint(ck_key)
    if ck:
        log.info("Найден checkpoint от %s — возобновляем генерацию (готово разделов: %d)",
                 time.strftime("%H:%M:%S", time.localtime(ck.get("saved_at") or 0)),
                 len(ck.get("content") or {}))

    rules = WORK_RULES.get(work_type, WORK_RULES["Реферат"])

    # Ограничиваем pages диапазоном типа
    pages = max(rules["pages_min"], min(pages, rules["pages_max"]))

    # Тест — минимальная генерация для проверки pipeline
    if work_type == "Тест":
        if progress_cb:
            progress_cb(1, 1, "Тестовая генерация")
        log.info("Тестовая генерация: минимальный промпт...")
        text = clean_text(ask(f"Напиши ровно 2-3 предложения на тему: {topic}. Только сам текст, без заголовков.", max_tokens=200))
        result = {
            "title":     f"[ТЕСТ] {topic}",
            "structure": ["Результат"],
            "content":   {"Результат": text},
            "sources":   [],
            "meta":      {"Тип работы": "Тест", "Объём": "1 стр."},
            "profile":   profile or {},
            "_cost_usd": round(get_session_cost(), 4),
        }
        print(f"[TOTAL] Тип: Тест | Тема: {topic[:40]}")
        return result

    # Сочинение и Эссе — отдельная логика
    if work_type in ("Сочинение", "Эссе"):
        result = generate_essay_or_composition(topic, pages, work_type, progress_cb=progress_cb)
        result["profile"] = profile or {}
        result["_cost_usd"] = round(get_session_cost(), 4)
        log.info("[TOTAL] Тип: %s | Тема: %s | Стоимость: $%.4f", work_type, topic[:40], get_session_cost())
        return result

    # Расчёт объёма с учётом служебных страниц
    service_pages = SERVICE_PAGES.get(work_type, 0)
    text_pages    = max(pages - service_pages, 1)
    total_words   = text_pages * rules["words_per_page"]
    log.info("Страниц: %s (служебных %d, текстовых %d) | Целевой объём: %d слов",
             pages, service_pages, text_pages, total_words)
    intro_words      = rules["intro_words"]
    conclusion_words = rules["conclusion_words"]
    body_words       = total_words - intro_words - conclusion_words

    sources_min = rules.get("sources_min", 8)

    # Взвешенные "юниты" прогресса: тяжёлые этапы дают больше вклада.
    SOURCES_UNITS = 8
    STRUCTURE_UNITS = 8
    INTRO_UNITS = 12
    BODY_TOTAL_UNITS = 60
    CONCLUSION_UNITS = 8

    # Шаг 0: Источники через Claude
    progress_done = 0
    sources = (ck or {}).get("sources")
    if sources:
        log.info("Шаг 0: источники восстановлены из checkpoint (%d шт.)", len(sources))
    else:
        log.info("Шаг 0: Генерирую источники...")
        if progress_cb:
            progress_cb(progress_done + SOURCES_UNITS, 100, "Подбираем источники")
        sources = generate_sources(topic, count=sources_min, doc_lang=doc_lang)
    progress_done += SOURCES_UNITS

    if sources:
        sources_instruction = f"""ИСПОЛЬЗУЙ ЭТИ ИСТОЧНИКИ для ссылок [1]-[{len(sources)}]:
{chr(10).join(sources[:5])}
...
Ссылки ставь в конце предложения в квадратных скобках: [1], [2].
Используй ссылки ЭКОНОМНО — 1-2 раза на подраздел, только для ключевых утверждений со статистикой или важными фактами."""
    else:
        sources = [f"{i}. Автор И.О. Название работы. — М.: Издательство, 2023."
                   for i in range(1, sources_min + 1)]
        sources_instruction = """Используй ссылки [1], [2] в тексте экономно — в конце предложения в квадратных скобках.
Только для ключевых утверждений со статистикой или важными фактами, максимум 1-2 на подраздел."""

    # Шаг 1: Структура
    preset_structure = _normalize_custom_structure(custom_structure, work_type)
    ck_structure = (ck or {}).get("structure") if not preset_structure else None
    if ck_structure:
        log.info("Шаг 1: структура восстановлена из checkpoint (%d разделов)", len(ck_structure))
        structure = ck_structure
        progress_done += STRUCTURE_UNITS
    elif preset_structure:
        log.info("Шаг 1: Используем структуру из предпросмотра...")
        if progress_cb:
            progress_cb(progress_done + STRUCTURE_UNITS, 100, "Собираем структуру работы")
        structure = preset_structure
        progress_done += STRUCTURE_UNITS
    else:
        log.info("Шаг 1: Генерирую структуру...")
        if progress_cb:
            progress_cb(progress_done + STRUCTURE_UNITS, 100, "Собираем структуру работы")
        data1     = ask_json(get_structure_prompt(topic, work_type, rules, doc_lang))
        structure = data1["structure"]
        progress_done += STRUCTURE_UNITS

    section_names = [
        s for s in structure
        if _canonical_service_key(s) not in {"intro", "conclusion", "sources", "appendix"}
    ]

    # Подглавы — только секции вида "X.Y. Название"
    sub_sections = [
        s for s in section_names
        if "." in s and len(s.split(".")) >= 3 and s.split(".")[1].strip()[:1].isdigit()
    ]
    sub_words = max(200, body_words // max(len(sub_sections), 1))

    content = {}
    ck_content = (ck or {}).get("content") or {}
    # Накопительный checkpoint: content мутируется по ходу генерации,
    # save_checkpoint сериализует его текущее состояние.
    ck_state = {"sources": sources, "structure": structure, "content": content}

    sections_count = max(len(section_names), 1)
    per_section_units = max(1, BODY_TOTAL_UNITS // sections_count)
    body_units = per_section_units * sections_count
    # Шаг 2: Введение
    if labels["intro"] in ck_content:
        content[labels["intro"]] = ck_content[labels["intro"]]
        log.info("Шаг 2: введение восстановлено из checkpoint")
    else:
        log.info("Шаг 2: Пишу введение...")
        if progress_cb:
            intro_start = progress_done + max(1, INTRO_UNITS // 3)
            progress_cb(intro_start, 100, "Пишем введение")
        content[labels["intro"]] = ask_text(
            get_intro_prompt(topic, work_type, intro_words, sources_instruction, doc_lang)
        )
        _check_volume(labels["intro"], content[labels["intro"]], intro_words)
        jobstore.save_checkpoint(ck_key, ck_state)
    progress_done += INTRO_UNITS
    if progress_cb:
        progress_cb(progress_done, 100, "Введение готово")

    # Шаг 3: Разделы
    for i, section in enumerate(section_names):
        if section in ck_content:
            content[section] = ck_content[section]
            log.info("Шаг %d: раздел «%s» восстановлен из checkpoint", i + 3, section[:60])
        else:
            log.info("Шаг %d: Пишу «%s»...", i + 3, section[:60])
            if progress_cb:
                section_start = min(99, progress_done + 1)
                progress_cb(section_start, 100, f"Пишем раздел {i + 1} из {len(section_names)}")

            parts  = section.split(".")
            is_sub = len(parts) >= 3 and parts[1].strip()[:1].isdigit()

            # Ищем родительскую главу для подглав
            parent = ""
            if is_sub:
                ch_num = parts[0].strip()
                parent = next(
                    (s for s in section_names
                     if s.split(".")[0].strip() == ch_num
                     and not (len(s.split(".")) >= 3 and s.split(".")[1].strip()[:1].isdigit())),
                    ""
                )

            words = sub_words if is_sub else 80
            content[section] = ask_text(
                get_section_prompt(topic, section, parent,
                                   words, work_type, sources_instruction, doc_lang)
            )
            _check_volume(section, content[section], words)
            jobstore.save_checkpoint(ck_key, ck_state)
        progress_done += per_section_units
        if progress_cb:
            progress_cb(progress_done, 100, f"Раздел {i + 1} из {len(section_names)} готов")
        time.sleep(0.5)

    # Шаг 4: Заключение
    if labels["conclusion"] in ck_content:
        content[labels["conclusion"]] = ck_content[labels["conclusion"]]
        log.info("Заключение восстановлено из checkpoint")
    else:
        log.info("Пишу заключение...")
        if progress_cb:
            progress_cb(progress_done + CONCLUSION_UNITS, 100, "Пишем заключение")
        content[labels["conclusion"]] = ask_text(
            get_conclusion_prompt(topic, work_type, conclusion_words, doc_lang)
        )
        _check_volume(labels["conclusion"], content[labels["conclusion"]], conclusion_words)
        jobstore.save_checkpoint(ck_key, ck_state)

    total_chars     = sum(len(v) for v in content.values())
    estimated_pages = round(total_chars / 1800)
    log.info("Готово! Примерный объём: %d страниц", estimated_pages)
    log.info("[TOTAL] Тип: %s | Тема: %s | Стоимость генерации: $%.4f",
             work_type, topic[:40], get_session_cost())

    # Работа завершена успешно — checkpoint больше не нужен.
    jobstore.clear_checkpoint(ck_key)

    meta = {
        "Тип работы":  work_type,
        "ГОСТ":        "7.32-2017",
        "Шрифт":       "Times New Roman, 14pt",
        "Интервал":    "1.5",
        "Поля":        "Л 30мм / П 10мм / В 20мм / Н 20мм",
        "Объём":       f"~{estimated_pages} страниц",
        "Разделов":    str(len(structure)),
        "Источников":  str(len(sources)),
        "doc_lang":    doc_lang,
    }

    return {
        "title":     f"{work_type} на тему: «{topic}»",
        "structure": structure,
        "content":   content,
        "sources":   sources,
        "meta":      meta,
        "profile":   profile or {},
        "_cost_usd": round(get_session_cost(), 4),
    }


PREVIEW_WORK_TYPES = frozenset(
    {"Сочинение", "Эссе", "Доклад", "Реферат", "Курсовая", "ВКР", "Тест"}
)


def _normalize_work_type(wt_in: str) -> str:
    s = (wt_in or "").strip()
    sl = s.lower()
    for allowed in PREVIEW_WORK_TYPES:
        if allowed.lower() == sl:
            return allowed
    if "курсов" in sl:
        return "Курсовая"
    if "диплом" in sl or "вкр" in sl:
        return "ВКР"
    return "Реферат"


def _first_chapter_heading_from_toc(toc_rows: list[dict]) -> str:
    for row in toc_rows:
        n = str(row.get("num", "") or "").strip()
        if n == "1":
            return str(row.get("title", "") or "").strip()[:300]
    return ""


def _split_legacy_excerpt(leg: str, intro_label: str, doc_lang: str) -> list[dict[str, str]]:
    leg = (leg or "").strip()
    if not leg:
        return []
    paras = [p.strip() for p in leg.split("\n\n") if p.strip()]
    if len(paras) < 2:
        return [{"title": intro_label, "text": leg}]
    mid = max(1, len(paras) // 2)
    a = "\n\n".join(paras[:mid])
    b = "\n\n".join(paras[mid:])
    ch = {"ru": "Глава 1", "kz": "1-бөлім", "en": "Chapter 1"}.get(doc_lang, "Глава 1")
    return [{"title": intro_label, "text": a}, {"title": ch, "text": b}]


def _rebuild_preview_toc_chapters(
    ai_rows: list[dict],
    chapters_count: int,
    subchapters_count: int,
    intro_w: str,
    concl_w: str,
    src_w: str,
    doc_lang: str,
) -> list[dict]:
    """
    Оглавление предпросмотра строго по WORK_RULES: N глав × M подглав + заключение + источники.
    Заголовки подтягиваем из ответа модели по num, иначе — нейтральные заглушки.
    """
    by_num: dict[str, str] = {}
    intro_title = intro_w
    concl_title = concl_w
    src_title = src_w
    for r in ai_rows:
        k = str(r.get("num", "")).strip()
        t = str(r.get("title", "")).strip()
        if not t:
            continue
        ttl = t.lower()
        is_intro = any(x in ttl for x in ("введени", "кіріспе", "kirispe", "introduction"))
        is_concl = any(x in ttl for x in ("заключ", "қорыт", "conclusion", "tynystau"))
        is_src = any(x in ttl for x in ("источн", "литератур", "references", "дереккөз", "bibliography"))
        if is_intro and not is_concl and not is_src:
            intro_title = t[:200]
            continue
        if is_concl:
            concl_title = t[:200]
            continue
        if is_src:
            src_title = t[:200]
            continue
        if k not in by_num or len(t) > len(by_num[k]):
            by_num[k] = t[:200]

    ch_def = {
        "ru": ("Теоретические аспекты темы", "Анализ ключевых положений", "Практическая значимость"),
        "kz": ("Тақырыптың теориялық аспектілері", "Негізгі тұжырымдамалар", "Практикалық маңызы"),
        "en": ("Theoretical aspects", "Analysis of key points", "Practical significance"),
    }.get(doc_lang, ("Chapter I", "Chapter II", "Chapter III"))

    sub_def = {
        "ru": ("Положения раздела", "Развитие темы", "Обобщение и выводы"),
        "kz": ("Бөлім сипаттамасы", "Тақырыпты дамыту", "Жинақтау"),
        "en": ("Section outline", "Topic development", "Summary"),
    }.get(doc_lang, ("Subsection A", "Subsection B", "Subsection C"))

    rows: list[dict] = []
    p = 3
    rows.append({"num": "", "title": intro_title[:200], "page": str(p)})
    p += 2
    for ch in range(1, chapters_count + 1):
        nk = str(ch)
        title = by_num.get(nk) or (ch_def[ch - 1] if ch <= len(ch_def) else ch_def[-1])
        rows.append({"num": nk, "title": title[:200], "page": str(p)})
        p += 2
        for sub in range(1, subchapters_count + 1):
            sk = f"{ch}.{sub}"
            st = by_num.get(sk) or sub_def[(ch + sub - 1) % len(sub_def)]
            rows.append({"num": sk, "title": st[:200], "page": str(p)})
            p += 2

    rows.append({"num": "", "title": concl_title[:200], "page": str(p)})
    p += 2
    rows.append({"num": "", "title": src_title[:200], "page": str(p)})
    return rows


def _rebuild_preview_toc_essay(ai_rows: list[dict], _intro_w: str, _concl_w: str, doc_lang: str) -> list[dict]:
    """Сочинение/эссе: в содержании только смысловые части без номеров глав."""
    by_num: dict[str, str] = {}
    titles: list[str] = []
    for r in ai_rows:
        k = str(r.get("num", "")).strip()
        t = str(r.get("title", "")).strip()
        # Убираем любые лидирующие цифры: «1. », «1 », «1: »
        t = re.sub(r"^\d+(?:\.\d+)*[.:]?\s*", "", t).strip()
        if not t:
            continue
        titles.append(t[:200])
        if k not in by_num or len(t) > len(by_num[k]):
            by_num[k] = t[:200]

    b = {
        "ru": ("Основная часть", "Аргументы и примеры", "Развитие мысли"),
        "kz": ("Негізгі бөлім", "Дәлелдер мен мысалдар", "Ойды дамыту"),
        "en": ("Main body", "Arguments and examples", "Developing the idea"),
    }.get(doc_lang, ("Main body", "Arguments", "Development"))

    t1 = titles[0] if len(titles) > 0 else (by_num.get("1") or by_num.get("") or b[0])
    t2 = titles[1] if len(titles) > 1 else (by_num.get("1.1") or b[1])
    t3 = titles[2] if len(titles) > 2 else (by_num.get("1.2") or b[2])

    return [
        {"num": "", "title": t1[:200], "page": "1"},
        {"num": "", "title": t2[:200], "page": "2"},
        {"num": "", "title": t3[:200], "page": "3"},
    ]


def generate_payment_preview(topic: str, work_type: str) -> dict:
    """
    Дешёвый предпросмотр: оглавление + начало первого раздела + названия остальных.
    Без источников и без полного текста.
    """
    reset_session_cost()

    topic = (topic or "").strip()
    if not topic:
        raise ValueError("Пустая тема")

    wt = _normalize_work_type(work_type)

    doc_lang = detect_language_from_topic(topic)
    lab = _lang_labels(doc_lang)
    intro_w = lab["intro"]
    concl_w = lab["conclusion"]
    src_w = lab["sources"]

    rules = WORK_RULES.get(wt, WORK_RULES["Реферат"])
    has_chapters = bool(rules.get("has_chapters", True))
    split_preview = has_chapters and wt not in ("Сочинение", "Эссе")

    if wt in ("Сочинение", "Эссе"):
        structure_hint = (
            f"Тип: {wt} — в сочинении и эссе НЕТ глав и номеров (num строго пустой: ''). "
            f"В toc дай 2–3 смысловые части (например, основная мысль, аргументы, развитие темы) без цифр в title и с пустым num. Заголовки на языке темы."
        )
    elif wt == "Тест":
        structure_hint = f"Тип: {wt} — минимальное оглавление из 1–2 строк или одна строка с пустым num."
    else:
        cc = int(rules.get("chapters_count") or 3)
        sc = int(rules.get("subchapters_count") or 2)
        total_rows = 1 + cc + cc * sc + 2
        structure_hint = (
            f"Тип: {wt} — оглавление СТРОГО по стандарту: ровно {cc} главы с num «1»…«{cc}» (не больше), "
            f"у каждой главы ровно {sc} подпунктов «N.1»…«N.{sc}». Затем «{concl_w}» (num «{cc + 1}») и «{src_w}» (num пустой, как у введения). "
            f"Сначала строка «{intro_w}» с пустым num. Всего ровно {total_rows} строк в toc; не добавляй четвёртую основную главу."
        )

    if split_preview:
        json_spec = """{
  "toc": [{"num": "строка — пусто для введения, иначе 1 / 1.1 / 1.2 / 2 / 2.1", "title": "только название без номера", "page": "строка"}, ...],
  "introduction_excerpt": "строка — только ПЕРВАЯ ПОЛОВИНА полного введения (~600 токенов выхода): 2–3 законченных абзаца, всего до ~2400 знаков. Без markdown и без «ёлочек»; абзацы через \\n\\n",
  "first_chapter_title": "строка — заголовок первой главы (тот же смысл, что у строки toc с num \\"1\\")",
  "first_chapter_excerpt": "строка — только НАЧАЛО первой главы: примерно первая половина текста главы 1 (~600 токенов выхода), 2–4 абзаца, до ~2400 знаков, законченные мысли. Без markdown; абзацы через \\n\\n",
  "locked_section_titles": ["строка", "строка", ...]
}"""
        cc = int(rules.get("chapters_count") or 3)
        sc = int(rules.get("subchapters_count") or 2)
        req_tail = f"""Требования:
- toc: title БЕЗ дублирования номера (номер только в num). page — условная страница строкой.
- Ровно {cc} нумерованных глав (num «1»…«{cc}»), у каждой ровно {sc} подглав; затем заключение (num «{cc + 1}») и список литературы (num пустой). Не вставляй лишнюю главу «{cc + 1}» в основную часть.
- introduction_excerpt и first_chapter_excerpt — разный текст: во втором уже основная часть главы 1, не дублируй введение.
- locked_section_titles: минимум 4 раздела, логично идущие после показанного текста первой главы.

Не включай ключи кроме перечисленных. Не пиши пояснений вне JSON."""
        max_preview_tokens = 3800
    else:
        json_spec = """{
  "toc": [{"num": "", "title": "название смысловой части без номера", "page": "строка"}, {"num": "", "title": "...", "page": "строка"}],
  "continuous_excerpt": "строка — цельный связный отрывок начала работы без внутренних подзаголовков (~600 токенов выхода, до ~2600 знаков). Без markdown и без «ёлочек»; абзацы через \\n\\n",
  "locked_section_titles": []
}"""
        req_tail = """Требования:
- toc: 2–3 строки с пустым num («») — только смысловые части без номеров глав.
- continuous_excerpt: законченные абзацы, цельный связный текст без глав.
- locked_section_titles: пустой массив [] (в сочинении нет отдельных глав).

Не включай ключи кроме перечисленных. Не пиши пояснений вне JSON."""
        max_preview_tokens = 2200

    prompt = f"""Ты готовишь КОРОТКИЙ предпросмотр учебной работы перед оплатой (пользователь ещё не платил).
{structure_hint}
Тема: «{topic}»
Язык всего текста в JSON — как у темы ({lab["name"]}); заголовки и отрывки на этом языке.

Верни строго один JSON-объект:
{json_spec}

{req_tail}"""

    data = ask_json_limited(prompt, max_tokens=max_preview_tokens)

    toc = data.get("toc") or []
    if not isinstance(toc, list):
        toc = []
    clean_toc = []
    for item in toc[:22]:
        if not isinstance(item, dict):
            continue
        t = str(item.get("title", "")).strip()
        if not t:
            continue
        p = item.get("page")
        raw_num = item.get("num")
        if raw_num is None or (isinstance(raw_num, str) and raw_num.strip() == ""):
            num_s = ""
        else:
            num_s = str(raw_num).strip()[:16]
            if num_s.endswith("."):
                num_s = num_s[:-1].strip()
        clean_toc.append(
            {
                "num": num_s,
                "title": t[:200],
                "page": str(p).strip()[:8] if p is not None else "…",
            }
        )

    if has_chapters:
        cc_n = int(rules.get("chapters_count") or 3)
        sc_n = int(rules.get("subchapters_count") or 2)
        clean_toc = _rebuild_preview_toc_chapters(clean_toc, cc_n, sc_n, intro_w, concl_w, src_w, doc_lang)
    elif wt in ("Сочинение", "Эссе"):
        clean_toc = _rebuild_preview_toc_essay(clean_toc, intro_w, concl_w, doc_lang)
    elif wt == "Тест":
        rsp = {"ru": "Ответ", "kz": "Жауап", "en": "Response"}.get(doc_lang, "Ответ")
        clean_toc = [
            {"num": "", "title": intro_w, "page": "1"},
            {"num": "1", "title": rsp, "page": "2"},
        ]

    locked = data.get("locked_section_titles") or []
    if not isinstance(locked, list) or wt in ("Сочинение", "Эссе"):
        locked = []
    else:
        locked = [str(x).strip()[:200] for x in locked if str(x).strip()][:12]

    if len(clean_toc) < 3:
        mid_labels = {"ru": "Основная часть", "kz": "Негізгі бөлім", "en": "Main body"}
        sub_labels = {"ru": "Развитие темы", "kz": "Тақырыпты дамыту", "en": "Developing the topic"}
        mid = mid_labels.get(doc_lang, mid_labels["ru"])
        sub = sub_labels.get(doc_lang, sub_labels["ru"])
        if wt in ("Сочинение", "Эссе"):
            clean_toc = [
                {"num": "", "title": mid, "page": "1"},
                {"num": "", "title": sub, "page": "2"},
                {"num": "", "title": "Примеры и рассуждения", "page": "3"},
            ]
        else:
            clean_toc = [
                {"num": "", "title": intro_w, "page": "3"},
                {"num": "1", "title": mid, "page": "5"},
                {"num": "1.1", "title": sub, "page": "6"},
                {"num": "", "title": concl_w, "page": "…"},
            ]

    ph = {
        "ru": "Здесь появится начало работы после генерации.",
        "kz": "Жұмыстың басы осында пайда болады.",
        "en": "The beginning of your work will appear here.",
    }.get(doc_lang, "Здесь появится начало работы после генерации.")

    excerpt_sections: list[dict[str, str]] = []
    if split_preview:
        intro_t = clean_text(str(data.get("introduction_excerpt", "") or ""))[:2800]
        ch1_title = str(data.get("first_chapter_title", "") or "").strip()[:300]
        if not ch1_title:
            ch1_title = _first_chapter_heading_from_toc(clean_toc)
        if clean_toc and ch1_title:
            import re
            ch1_clean = re.sub(r"^\d+(\.\d+)*\.?\s*", "", ch1_title).strip()
            ch1_row = next(
                (r for r in clean_toc if re.sub(r"^\d+(\.\d+)*\.?\s*", "", str(r.get("title", ""))).strip().lower() == ch1_clean.lower()),
                None
            )
            if not ch1_row:
                ch1_row = next((r for r in clean_toc if str(r.get("num", "")).strip() == "1"), None)
            if ch1_row and ch1_row.get("num"):
                c_num = str(ch1_row.get("num", "")).strip()
                c_clean = re.sub(r"^\d+(\.\d+)*\.?\s*", "", str(ch1_row.get("title", ""))).strip()
                ch1_title = f"{c_num}. {c_clean}"

        ch1_txt = clean_text(str(data.get("first_chapter_excerpt", "") or ""))[:2800]
        if intro_t:
            excerpt_sections.append({"title": intro_w, "text": intro_t})
        if ch1_txt:
            excerpt_sections.append({"title": ch1_title or "1", "text": ch1_txt})
        if not excerpt_sections:
            single = clean_text(str(data.get("excerpt", "") or ""))[:3200]
            if single:
                excerpt_sections = _split_legacy_excerpt(single, intro_w, doc_lang)
        if not excerpt_sections:
            ch1_f = ch1_title or _first_chapter_heading_from_toc(clean_toc) or "1"
            excerpt_sections = [{"title": intro_w, "text": ph}, {"title": ch1_f, "text": ph}]
    else:
        cont = clean_text(str(data.get("continuous_excerpt", "") or data.get("excerpt", "") or ""))[:2800]
        frag_labels = {"ru": f"Фрагмент: {wt}", "kz": f"Үзінді: {wt}", "en": f"Excerpt: {wt}"}
        frag_label = frag_labels.get(doc_lang, f"Фрагмент: {wt}")
        if cont:
            excerpt_sections = [{"title": frag_label, "text": cont}]
        else:
            excerpt_sections = [
                {"title": (clean_toc[0]["title"] if clean_toc else frag_label), "text": ph}
            ]

    excerpt_title = (
        excerpt_sections[0]["title"]
        if excerpt_sections
        else (clean_toc[0]["title"] if clean_toc else intro_w)
    )
    excerpt = "\n\n".join(s.get("text", "") for s in excerpt_sections).strip()
    if not excerpt:
        excerpt = ph

    if split_preview and clean_toc:
        import re
        shown_clean = {re.sub(r"^\d+(\.\d+)*\.?\s*", "", s["title"]).strip().lower() for s in excerpt_sections}
        locked_from_toc = []
        for r in clean_toc:
            t = str(r.get("title", "")).strip()
            if not t:
                continue
            tc = re.sub(r"^\d+(\.\d+)*\.?\s*", "", t).strip().lower()
            if tc in shown_clean:
                continue
            num = str(r.get("num", "")).strip()
            clean_t = re.sub(r"^\d+(\.\d+)*\.?\s*", "", t).strip()
            locked_from_toc.append(f"{num}. {clean_t}" if num else clean_t)
        if locked_from_toc:
            locked = locked_from_toc
    else:
        while len(locked) < 4:
            n = len(locked) + 1
            locked.append({ "ru": f"Раздел {n}", "kz": f"Бөлім {n}", "en": f"Section {n}" }.get(doc_lang, f"Раздел {n}"))

    return {
        "work_type": wt,
        "topic": topic,
        "doc_lang": doc_lang,
        "has_toc_sheet": bool(has_chapters or wt in ("Сочинение", "Эссе")),
        "toc": clean_toc,
        "excerpt_title": excerpt_title,
        "excerpt": excerpt,
        "excerpt_sections": excerpt_sections,
        "locked_section_titles": locked,
        "_cost_usd": round(get_session_cost(), 4),
    }


# Обратная совместимость
generate_referat = generate_work
