"""
generator.py — генерация учебных работ через Claude API.
Модель: claude-sonnet-4-5
"""

import os
import json
import re
import time
from dotenv import load_dotenv
import anthropic
from github_proxy import ask_via_github

load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"), base_url="https://anthropic-proxy.kakadun99.workers.dev")
MODEL  = "claude-sonnet-4-5"

# Глобальный счётчик стоимости текущей генерации
_session_cost: float = 0.0


LANG_LABELS = {
    "ru": {
        "name": "русский",
        "intro": "Введение",
        "conclusion": "Заключение",
        "sources": "Список литературы",
    },
    "kz": {
        "name": "казахский",
        "intro": "Кіріспе",
        "conclusion": "Қорытынды",
        "sources": "Пайдаланылған әдебиеттер",
    },
    "en": {
        "name": "English",
        "intro": "Introduction",
        "conclusion": "Conclusion",
        "sources": "References",
    },
}


def detect_language_from_topic(topic: str) -> str:
    """Auto-script определение языка темы: kz | en | ru (fallback)."""
    text = (topic or "").strip()
    if not text:
        return "ru"
    low = text.lower()
    if any(tag in low for tag in ("[kz]", "kz:", "қаз", "каз")):
        return "kz"
    if any(tag in low for tag in ("[en]", "en:", "english", "англ")):
        return "en"
    if re.search(r"[әіңғүұқөһ]", low):
        return "kz"
    letters = re.findall(r"[A-Za-zА-Яа-яЁёӘәІіҢңҒғҮүҰұҚқӨөҺһ]", text)
    if not letters:
        return "ru"
    latin = sum(ch.isascii() and ch.isalpha() for ch in letters)
    cyril = len(letters) - latin
    if latin > cyril:
        return "en"
    return "ru"


def _lang_labels(doc_lang: str) -> dict[str, str]:
    return LANG_LABELS.get(doc_lang, LANG_LABELS["ru"])


def _canonical_service_key(name: str) -> str:
    s = (name or "").strip().lower()
    variants = {
        "intro": {"введение", "кіріспе", "introduction"},
        "conclusion": {"заключение", "қорытынды", "conclusion"},
        "sources": {"список литературы", "пайдаланылған әдебиеттер", "references"},
        "appendix": {"приложения", "қосымшалар", "appendix", "appendices"},
    }
    for key, names in variants.items():
        if s in names:
            return key
    return ""


def ask(prompt: str, max_tokens: int = 8000) -> str:
    """Запрос к Claude API через GitHub Actions прокси."""
    global _session_cost
    text, usage = ask_via_github(MODEL, max_tokens, [{"role": "user", "content": prompt}])
    # claude-sonnet-4-5: $3/M input tokens, $15/M output tokens
    input_tokens  = usage.get("input_tokens", 0)
    output_tokens = usage.get("output_tokens", 0)
    _session_cost += input_tokens * 3e-6 + output_tokens * 15e-6
    print(f"[Proxy] Ответ получен, длина: {len(text)}, токены: {input_tokens}+{output_tokens}, стоимость сессии: ${_session_cost:.4f}")
    return text


def ask_json(prompt: str) -> dict:
    """Запрос к Claude, возвращает JSON."""
    raw = ask(prompt + "\n\nВерни ТОЛЬКО валидный JSON без markdown и пояснений.")
    if "```" in raw:
        for part in raw.split("```"):
            if "{" in part:
                raw = part.lstrip("json").strip()
                break
    return json.loads(raw)


def ask_json_limited(prompt: str, max_tokens: int = 1200) -> dict:
    """Claude → JSON с ограничением max_tokens (предпросмотр перед оплатой)."""
    raw = ask(prompt + "\n\nВерни ТОЛЬКО валидный JSON без markdown и пояснений.", max_tokens=max_tokens)
    if "```" in raw:
        for part in raw.split("```"):
            if "{" in part:
                raw = part.lstrip("json").strip()
                break
    return json.loads(raw)


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


# ── Служебные страницы (не содержат основного текста) ──────────────────────

SERVICE_PAGES = {
    "Реферат":   3,   # титульник + содержание + список литературы
    "Доклад":    3,   # титульник + содержание + список литературы
    "Курсовая":  4,   # титульник + содержание (1-2) + список литературы (2)
    "ВКР":       8,   # титульник + содержание (2) + список литературы (3) + приложения (2)
    "Эссе":      0,
    "Сочинение": 0,
}


# ── Правила для каждого типа работы ────────────────────────────────────────

WORK_RULES = {
    "Сочинение": {
        "has_title_page": False,
        "has_toc":        False,
        "has_sources":    False,
        "has_tables":     False,
        "has_chapters":   False,
        "pages_min":      3,
        "pages_max":      5,
        "words_per_page": 300,
        "intro_words":    100,
        "conclusion_words": 100,
        "style":    "школьное сочинение от первого лица, живой личный стиль, эмоциональность, примеры из жизни",
        "forbidden": "никаких заголовков глав, никаких нумерованных разделов, никаких таблиц, никакого академического языка",
    },
    "Эссе": {
        "has_title_page": False,
        "has_toc":        False,
        "has_sources":    False,
        "has_tables":     False,
        "has_chapters":   False,
        "pages_min":      4,
        "pages_max":      8,
        "words_per_page": 300,
        "intro_words":    150,
        "conclusion_words": 150,
        "style":    "разговорный стиль, авторская позиция, рассуждение, аргументы и контраргументы",
        "forbidden": "никаких заголовков глав, никаких таблиц, никакого сухого академического языка",
    },
    "Доклад": {
        "has_title_page":   True,
        "has_toc":          True,
        "has_sources":      True,
        "has_tables":       True,
        "has_chapters":     True,
        "chapters_count":   2,
        "subchapters_count": 2,
        "pages_min":        15,
        "pages_max":        20,
        "words_per_page":   280,
        "intro_words":      200,
        "conclusion_words": 200,
        "style":    "информационный стиль, чёткие тезисы, подходит для зачитывания вслух, понятный язык",
        "forbidden": "никаких сложных терминов без объяснений",
    },
    "Реферат": {
        "has_title_page":   True,
        "has_toc":          True,
        "has_sources":      True,
        "has_tables":       True,
        "has_chapters":     True,
        "chapters_count":   3,
        "subchapters_count": 2,
        "pages_min":        20,
        "pages_max":        25,
        "words_per_page":   280,
        "intro_words":      300,
        "conclusion_words": 300,
        "style":    "академический стиль, анализ источников, авторская позиция",
        "forbidden": "никаких иностранных слов кроме терминов, никаких артефактов",
    },
    "Курсовая": {
        "has_title_page":   True,
        "has_toc":          True,
        "has_sources":      True,
        "has_tables":       True,
        "has_chapters":     True,
        "chapters_count":   3,
        "subchapters_count": 2,
        "pages_min":        30,
        "pages_max":        40,
        "words_per_page":   280,
        "intro_words":      400,
        "conclusion_words": 400,
        "style":    "научный стиль, теоретическая и практическая части, промежуточные выводы после каждой главы",
        "sources_min": 15,
        "forbidden": "никаких иностранных слов кроме терминов",
    },
    "ВКР": {
        "has_title_page":   True,
        "has_toc":          True,
        "has_sources":      True,
        "has_tables":       True,
        "has_chapters":     True,
        "chapters_count":   3,
        "subchapters_count": 3,
        "pages_min":        60,
        "pages_max":        70,
        "words_per_page":   280,
        "intro_words":      600,
        "conclusion_words": 600,
        "style":    "строгий научный стиль, методология, собственное исследование, развёрнутый анализ",
        "sources_min": 20,
        "has_appendix": True,
        "forbidden": "никаких иностранных слов кроме терминов",
    },
    "Тест": {
        "has_title_page": False,
        "has_toc":        False,
        "has_sources":    False,
        "has_tables":     False,
        "has_chapters":   False,
        "pages_min":      1,
        "pages_max":      1,
        "words_per_page": 100,
        "intro_words":    0,
        "conclusion_words": 0,
        "style":    "краткий тестовый ответ",
        "forbidden": "",
    },
}


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
    print(f"Генерирую {count} источников для темы: {topic} | язык: {doc_lang}")
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
    print(f"Получено {len(lines)} источников")
    return lines


# ── Промпты структуры ───────────────────────────────────────────────────────

def get_structure_prompt(topic: str, work_type: str, rules: dict, doc_lang: str) -> str:
    labels = _lang_labels(doc_lang)
    intro = labels["intro"]
    conclusion = labels["conclusion"]
    sources = labels["sources"]

    if work_type in ("Сочинение", "Эссе"):
        return f"""Создай структуру {work_type.lower()} на тему «{topic}».

Верни JSON:
{{
  "structure": ["Основная часть"]
}}

Никаких введений, заключений и списков литературы как отдельных разделов.
Верни ТОЛЬКО JSON."""

    if work_type == "Доклад":
        return f"""Создай структуру доклада на тему «{topic}».

Верни JSON с 2 главами и подглавами:
{{
  "structure": [
    "{intro}",
    "1. [конкретное название главы]",
    "1.1. [конкретное название подглавы]",
    "1.2. [конкретное название подглавы]",
    "2. [конкретное название главы]",
    "2.1. [конкретное название подглавы]",
    "2.2. [конкретное название подглавы]",
    "{conclusion}",
    "{sources}"
  ]
}}

Замени [конкретное название] на реальные названия по теме. Верни ТОЛЬКО JSON."""

    if work_type == "Реферат":
        return f"""Создай структуру реферата на тему «{topic}».

Верни JSON с 3 главами и 2 подглавами в каждой:
{{
  "structure": [
    "{intro}",
    "1. [конкретное название главы]",
    "1.1. [конкретное название подглавы]",
    "1.2. [конкретное название подглавы]",
    "2. [конкретное название главы]",
    "2.1. [конкретное название подглавы]",
    "2.2. [конкретное название подглавы]",
    "3. [конкретное название главы]",
    "3.1. [конкретное название подглавы]",
    "3.2. [конкретное название подглавы]",
    "{conclusion}",
    "{sources}"
  ]
}}

Замени [конкретное название] на реальные названия по теме «{topic}». Верни ТОЛЬКО JSON."""

    if work_type == "Курсовая":
        if doc_lang == "kz":
            return f"""«{topic}» тақырыбы бойынша курстық жұмыстың құрылымын құр.

JSON-ды қатаң түрде 3 тараумен қайтар:
{{
  "structure": [
    "{intro}",
    "1-тарау. [нақты атау] теориялық негіздері",
    "1.1. [нақты бөлімше атауы]",
    "1.2. [нақты бөлімше атауы]",
    "2-тарау. [нақты атау] талдауы",
    "2.1. [нақты бөлімше атауы]",
    "2.2. [нақты бөлімше атауы]",
    "3-тарау. [нақты атау] бойынша практикалық ұсыныстар",
    "3.1. [нақты бөлімше атауы]",
    "3.2. [нақты бөлімше атауы]",
    "{conclusion}",
    "{sources}"
  ]
}}

[нақты атау] және [нақты бөлімше атауы] орнына тақырыпқа сәйкес нақты атауларды қой.
Барлық тарау/бөлімше атаулары тек қазақ тілінде болсын.
ТЕК JSON қайтар."""
        return f"""Создай структуру курсовой работы на тему «{topic}».

Верни JSON строго с 3 главами:
{{
  "structure": [
    "{intro}",
    "Глава 1. Теоретические основы [конкретное название]",
    "1.1. [конкретное название подглавы]",
    "1.2. [конкретное название подглавы]",
    "Глава 2. Анализ [конкретное название]",
    "2.1. [конкретное название подглавы]",
    "2.2. [конкретное название подглавы]",
    "Глава 3. Практические рекомендации [конкретное название]",
    "3.1. [конкретное название подглавы]",
    "3.2. [конкретное название подглавы]",
    "{conclusion}",
    "{sources}"
  ]
}}

Замени [конкретное название] на реальные названия по теме «{topic}». Верни ТОЛЬКО JSON."""

    if work_type == "ВКР":
        return f"""Создай структуру ВКР на тему «{topic}».

Верни JSON строго с 3 главами по 3 подглавы:
{{
  "structure": [
    "{intro}",
    "Глава 1. Теоретические и методологические основы [название]",
    "1.1. [подглава]",
    "1.2. [подглава]",
    "1.3. [подглава]",
    "Глава 2. Исследование и анализ [название]",
    "2.1. [подглава]",
    "2.2. [подглава]",
    "2.3. [подглава]",
    "Глава 3. Разработка решений и практические результаты [название]",
    "3.1. [подглава]",
    "3.2. [подглава]",
    "3.3. [подглава]",
    "{conclusion}",
    "{sources}",
    "Приложения"
  ]
}}

Замени [название] и [подглава] на конкретные названия по теме «{topic}». Верни ТОЛЬКО JSON."""

    # Реферат по умолчанию
    return get_structure_prompt(topic, "Реферат", rules, doc_lang)


# ── Промпты введения ────────────────────────────────────────────────────────

def get_intro_prompt(topic: str, work_type: str, words: int, sources_instruction: str, doc_lang: str) -> str:

    INTRO_ELEMENTS = {
        "Доклад":   "актуальность темы, цель доклада, краткое содержание разделов",
        "Реферат":  "актуальность темы, степень изученности, цель, 4 конкретные задачи нумерованным списком, объект, предмет, методы, структура работы",
        "Курсовая": "актуальность с обоснованием, степень изученности проблемы, противоречие, цель, 5-6 задач нумерованным списком, объект, предмет, методы исследования, теоретическая база, практическая значимость, структура",
        "ВКР":      "актуальность с научным обоснованием, степень разработанности в литературе, научная проблема, цель, 6-8 задач нумерованным списком, объект, предмет, гипотеза, методология (теоретические и эмпирические методы), теоретическая значимость, практическая значимость, апробация результатов, структура работы",
    }

    elements = INTRO_ELEMENTS.get(work_type, INTRO_ELEMENTS["Реферат"])

    lang_name = _lang_labels(doc_lang)["name"]
    return f"""Напиши введение {work_type.lower()} на тему «{topic}».
Объём: строго {words} слов — считай слова точно.

Обязательные элементы:
{elements}

{sources_instruction}

Требования:
- Язык текста: {lang_name}
- Используй корректные имена/термины в норме выбранного языка
- Академический стиль
- Конкретные формулировки, не общие фразы
- В введении ссылки НЕ используются совсем — введение это авторский текст без цитирования источников. Не ставь [1], [2] и никакие другие ссылки во введении

- НИКАКОГО markdown: никаких #, ##, **, *, ---, нумерованных списков с точкой
- Никаких мини-заголовков внутри текста — только связный текст без внутренних заголовков
- Пиши единообразно на выбранном языке, без смешивания языков в одном абзаце

КРИТИЧЕСКИ ВАЖНО ПО ОБЪЁМУ:
- Целевой объём: {words} слов — это обязательное минимальное требование
- Считай слова по ходу написания
- Если текст получается короче — расширяй рассуждения, добавляй примеры и детали
- Лучше написать на 10-15% больше чем меньше целевого объёма
- НЕ обрезай текст искусственно

Верни ТОЛЬКО текст введения без заголовка."""


# ── Промпты для разделов ────────────────────────────────────────────────────

def get_section_prompt(topic: str, section: str, parent: str,
                       words: int, work_type: str,
                       sources_instruction: str, doc_lang: str) -> str:

    parts  = section.split(".")
    is_sub = len(parts) >= 3 and parts[1].strip()[:1].isdigit()

    # Контекст главы для Курсовой/ВКР
    chapter_context = ""
    ch_num = parts[0].replace("Глава", "").strip()
    if work_type == "Курсовая":
        if ch_num.startswith("1"):
            chapter_context = "ТЕОРЕТИЧЕСКАЯ ЧАСТЬ: определения, история вопроса, существующие подходы из литературы, обзор источников"
        elif ch_num.startswith("2"):
            chapter_context = "АНАЛИТИЧЕСКАЯ ЧАСТЬ: анализ текущего состояния, сравнение подходов, выявление проблем, данные и факты"
        elif ch_num.startswith("3"):
            chapter_context = "ПРАКТИЧЕСКАЯ ЧАСТЬ: конкретные решения, рекомендации, собственные предложения автора, обоснование эффективности"
    if work_type == "ВКР":
        if ch_num.startswith("1"):
            chapter_context = "ТЕОРЕТИКО-МЕТОДОЛОГИЧЕСКАЯ ЧАСТЬ: обзор научной литературы, теоретические концепции, методологические подходы, понятийный аппарат"
        elif ch_num.startswith("2"):
            chapter_context = "ИССЛЕДОВАТЕЛЬСКАЯ ЧАСТЬ: методика исследования, сбор и анализ данных, результаты, интерпретация"
        elif ch_num.startswith("3"):
            chapter_context = "ПРАКТИЧЕСКАЯ ЧАСТЬ: разработка решений, апробация, оценка эффективности, практические рекомендации"

    # Вступление к главе (не подглава)
    is_chapter_intro = (
        work_type in ("Курсовая", "ВКР") and
        "Глава" in section and
        not is_sub
    )
    if is_chapter_intro:
        lang_name = _lang_labels(doc_lang)["name"]
        return f"""Напиши краткое вступление к главе «{section}» {work_type.lower()} на тему «{topic}».
{f"Контекст: {chapter_context}" if chapter_context else ""}
Объём: 80-100 слов.
Обозначь что будет рассмотрено в этой главе.
Язык текста: {lang_name}. Академический стиль. Никакого markdown.
Верни ТОЛЬКО текст без заголовка."""

    # Основная часть для Эссе/Сочинения
    if section == "Основная часть":
        TYPE_STYLE = {
            "Эссе":      "разговорный, авторская позиция, аргументы и контраргументы",
            "Сочинение": "живой личный стиль, примеры из жизни и литературы, эмоциональность",
        }
        style = TYPE_STYLE.get(work_type, "академический стиль")
        lang_name = _lang_labels(doc_lang)["name"]
        return f"""Напиши основную часть {work_type.lower()} на тему «{topic}».
Объём: СТРОГО {words} слов.
Стиль: {style}
Без заголовков и глав — только связный текст абзацами.
Язык текста: {lang_name}

КРИТИЧЕСКИ ВАЖНО ПО ОБЪЁМУ:
- Целевой объём: {words} слов — это обязательное минимальное требование
- Считай слова по ходу написания
- Если текст получается короче — расширяй рассуждения, добавляй примеры и детали
- Лучше написать на 10-15% больше чем меньше целевого объёма
- НЕ обрезай текст искусственно

Верни ТОЛЬКО текст."""

    # Основной промпт для подглав
    STYLE_BY_TYPE = {
        "Доклад":   "информационный стиль, чёткие тезисы, понятный язык для устного выступления",
        "Реферат":  "академический стиль, анализ, авторская оценка, разнообразные синтаксические конструкции",
        "Курсовая": f"научный стиль, {chapter_context}" if chapter_context else "научный стиль",
        "ВКР":      f"строгий научный стиль, {chapter_context}, собственный исследовательский вклад" if chapter_context else "строгий научный стиль",
    }
    style       = STYLE_BY_TYPE.get(work_type, "академический стиль")
    parent_text = f"Этот раздел входит в главу «{parent}»." if parent else ""

    tables_instruction = ""
    if work_type not in ("Сочинение", "Эссе"):
        tables_instruction = """
ТАБЛИЦА: если данные удобно систематизировать — добавь ОДНУ таблицу в формате:
[TABLE]
{
  "caption": "краткое описание без номера",
  "headers": ["Столбец 1", "Столбец 2"],
  "rows": [["значение", "значение"]]
}
[/TABLE]
Если таблица не нужна — не добавляй."""

    lang_name = _lang_labels(doc_lang)["name"]
    return f"""Напиши раздел «{section}» для {work_type.lower()} на тему «{topic}».
{parent_text}
Объём: строго {words} слов — считай слова точно.
Стиль: {style}

{sources_instruction}
{tables_instruction}

ТРЕБОВАНИЯ:
- Язык текста: {lang_name}
- Не смешивай языки в одном абзаце
- Никаких артефактов, пустых квадратов □, непечатных символов
- Конкретные факты, цифры, примеры
- Авторская позиция и собственные выводы
- Ссылки на источники — максимум 1 ссылка на весь подраздел, только если приводишь конкретную статистику или цитируешь конкретное исследование. Если таких фактов нет — не ставь ссылки вообще
- В конце главы (не подглавы) — краткий вывод 2-3 предложения
- НИКАКОГО markdown: никаких #, ##, **, *, ---, нумерованных списков
- Никаких мини-заголовков внутри текста подглавы — только связный текст без внутренних заголовков

КРИТИЧЕСКИ ВАЖНО ПО ОБЪЁМУ:
- Целевой объём: {words} слов — это обязательное минимальное требование
- Считай слова по ходу написания
- Если текст получается короче — расширяй рассуждения, добавляй примеры и детали
- Лучше написать на 10-15% больше чем меньше целевого объёма
- НЕ обрезай текст искусственно

Верни ТОЛЬКО текст без заголовка."""


# ── Промпты заключения ──────────────────────────────────────────────────────

def get_conclusion_prompt(topic: str, work_type: str, words: int, doc_lang: str) -> str:

    CONCLUSION_ELEMENTS = {
        "Доклад":   "основные выводы по каждому разделу, значимость темы, практические рекомендации",
        "Реферат":  "выводы по каждой из 4 задач из введения, достижение цели, теоретическая и практическая значимость, перспективы изучения",
        "Курсовая": "выводы по каждой задаче, теоретический вклад, практические рекомендации, перспективы дальнейшего исследования",
        "ВКР":      "подтверждение или опровержение гипотезы, выводы по каждой задаче, достижение цели, теоретическая значимость, практическая ценность, ограничения исследования, направления дальнейших исследований",
    }

    elements = CONCLUSION_ELEMENTS.get(work_type, CONCLUSION_ELEMENTS["Реферат"])

    lang_name = _lang_labels(doc_lang)["name"]
    return f"""Напиши заключение {work_type.lower()} на тему «{topic}».
Объём: строго {words} слов — считай слова точно.

Обязательные элементы:
{elements}

Требования:
- Язык текста: {lang_name}
- Не добавляй новую информацию — только обобщай результаты
- Конкретные выводы, не общие фразы
- Академический стиль
- В заключении ссылки НЕ используются совсем — это только выводы автора. Не ставь [1], [2] и никакие другие ссылки в заключении
- НИКАКОГО markdown: никаких #, ##, **, *, ---
- Никаких мини-заголовков внутри текста — только связный текст без внутренних заголовков
- Пиши единообразно на выбранном языке без смешения языков

КРИТИЧЕСКИ ВАЖНО ПО ОБЪЁМУ:
- Целевой объём: {words} слов — это обязательное минимальное требование
- Считай слова по ходу написания
- Если текст получается короче — расширяй рассуждения, добавляй примеры и детали
- Лучше написать на 10-15% больше чем меньше целевого объёма
- НЕ обрезай текст искусственно

Верни ТОЛЬКО текст без заголовка."""


# ── Специальная генерация для Сочинения и Эссе ─────────────────────────────

def generate_essay_or_composition(topic: str, pages: int, work_type: str, progress_cb=None) -> dict:
    """Генерация сочинения или эссе — единым текстом без глав."""

    rules = WORK_RULES[work_type]
    pages = max(rules["pages_min"], min(pages, rules["pages_max"]))
    total_words = pages * rules["words_per_page"]
    print(f"Пишу {work_type.lower()} (~{total_words} слов)...")

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
        print(f"  ВНИМАНИЕ: «{label}» — {actual_chars} симв. (~{actual_words} слов), "
              f"ожидалось минимум {expected_words} слов ({min_chars} симв.)")
    else:
        print(f"  ✓ «{label}» — {actual_chars} симв. (~{actual_words} слов)")


# ── Главная функция генерации ───────────────────────────────────────────────

def generate_work(topic: str, pages: int, work_type: str = "Реферат",
                  profile: dict | None = None, progress_cb=None) -> dict:
    """Генерирует работу нужного типа через Claude API."""
    global _session_cost
    _session_cost = 0.0

    print(f"\n{'='*60}")
    print(f"Начало генерации: {work_type}")
    print(f"Тема: {topic}")
    print(f"Страниц: {pages}")
    doc_lang = detect_language_from_topic(topic)
    labels = _lang_labels(doc_lang)
    print(f"Язык документа: {doc_lang}")
    print(f"{'='*60}\n")

    rules = WORK_RULES.get(work_type, WORK_RULES["Реферат"])

    # Ограничиваем pages диапазоном типа
    pages = max(rules["pages_min"], min(pages, rules["pages_max"]))

    # Тест — минимальная генерация для проверки pipeline
    if work_type == "Тест":
        if progress_cb:
            progress_cb(1, 1, "Тестовая генерация")
        print("Тестовая генерация: минимальный промпт...")
        text = clean_text(ask(f"Напиши ровно 2-3 предложения на тему: {topic}. Только сам текст, без заголовков.", max_tokens=200))
        result = {
            "title":     f"[ТЕСТ] {topic}",
            "structure": ["Результат"],
            "content":   {"Результат": text},
            "sources":   [],
            "meta":      {"Тип работы": "Тест", "Объём": "1 стр."},
            "profile":   profile or {},
            "_cost_usd": round(_session_cost, 4),
        }
        print(f"[TOTAL] Тип: Тест | Тема: {topic[:40]}")
        return result

    # Сочинение и Эссе — отдельная логика
    if work_type in ("Сочинение", "Эссе"):
        result = generate_essay_or_composition(topic, pages, work_type, progress_cb=progress_cb)
        result["profile"] = profile or {}
        result["_cost_usd"] = round(_session_cost, 4)
        print(f"{'='*50}")
        print(f"[TOTAL] Тип: {work_type} | Тема: {topic[:40]}")
        print(f"[TOTAL] Стоимость генерации: ${_session_cost:.4f}")
        print(f"{'='*50}")
        return result

    # Расчёт объёма с учётом служебных страниц
    service_pages = SERVICE_PAGES.get(work_type, 0)
    text_pages    = max(pages - service_pages, 1)
    total_words   = text_pages * rules["words_per_page"]
    print(f"Запрошено страниц: {pages}")
    print(f"Служебных страниц: {service_pages}")
    print(f"Страниц основного текста: {text_pages}")
    print(f"Целевой объём слов: {total_words}")
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
    print("Шаг 0: Генерирую источники...")
    progress_done = 0
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
    print("Шаг 1: Генерирую структуру...")
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

    sections_count = max(len(section_names), 1)
    per_section_units = max(1, BODY_TOTAL_UNITS // sections_count)
    body_units = per_section_units * sections_count
    # Шаг 2: Введение
    print("Шаг 2: Пишу введение...")
    if progress_cb:
        intro_start = progress_done + max(1, INTRO_UNITS // 3)
        progress_cb(intro_start, 100, "Пишем введение")
    content[labels["intro"]] = ask_text(
        get_intro_prompt(topic, work_type, intro_words, sources_instruction, doc_lang)
    )
    _check_volume(labels["intro"], content[labels["intro"]], intro_words)
    progress_done += INTRO_UNITS
    if progress_cb:
        progress_cb(progress_done, 100, "Введение готово")

    # Шаг 3: Разделы
    for i, section in enumerate(section_names):
        print(f"Шаг {i+3}: Пишу «{section}»...")
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

        words            = sub_words if is_sub else 80
        content[section] = ask_text(
            get_section_prompt(topic, section, parent,
                               words, work_type, sources_instruction, doc_lang)
        )
        _check_volume(section, content[section], words)
        progress_done += per_section_units
        if progress_cb:
            progress_cb(progress_done, 100, f"Раздел {i + 1} из {len(section_names)} готов")
        time.sleep(0.5)

    # Шаг 4: Заключение
    print("Пишу заключение...")
    if progress_cb:
        progress_cb(progress_done + CONCLUSION_UNITS, 100, "Пишем заключение")
    content[labels["conclusion"]] = ask_text(
        get_conclusion_prompt(topic, work_type, conclusion_words, doc_lang)
    )
    _check_volume(labels["conclusion"], content[labels["conclusion"]], conclusion_words)

    total_chars     = sum(len(v) for v in content.values())
    estimated_pages = round(total_chars / 1800)
    print(f"Готово! Примерный объём: {estimated_pages} страниц")

    print(f"{'='*50}")
    print(f"[TOTAL] Тип: {work_type} | Тема: {topic[:40]}")
    print(f"[TOTAL] Стоимость генерации: ${_session_cost:.4f}")
    print(f"{'='*50}")

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
        "_cost_usd": round(_session_cost, 4),
    }


PREVIEW_WORK_TYPES = frozenset(
    {"Сочинение", "Эссе", "Доклад", "Реферат", "Курсовая", "ВКР", "Тест"}
)


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
    for r in ai_rows:
        k = str(r.get("num", "")).strip()
        t = str(r.get("title", "")).strip()
        if not t:
            continue
        if k not in by_num or len(t) > len(by_num[k]):
            by_num[k] = t[:200]

    concl_title = concl_w
    src_title = src_w
    for r in ai_rows:
        tt = str(r.get("title", "")).strip()
        if not tt:
            continue
        ttl = tt.lower()
        if any(x in ttl for x in ("заключ", "қорыт", "conclusion", "tynystau")):
            concl_title = tt[:200]
        if any(x in ttl for x in ("источн", "литератур", "references", "дереккөз", "bibliography")):
            src_title = tt[:200]

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
    rows.append({"num": "", "title": (by_num.get("", intro_w))[:200], "page": str(p)})
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

    rows.append({"num": str(chapters_count + 1), "title": concl_title[:200], "page": str(p)})
    p += 2
    rows.append({"num": str(chapters_count + 2), "title": src_title[:200], "page": str(p)})
    return rows


def _rebuild_preview_toc_essay(ai_rows: list[dict], _intro_w: str, _concl_w: str, doc_lang: str) -> list[dict]:
    """Сочинение/эссе: в содержании только основная часть (глава 1 и подпункты)."""
    by_num: dict[str, str] = {}
    for r in ai_rows:
        k = str(r.get("num", "")).strip()
        t = str(r.get("title", "")).strip()
        if not t:
            continue
        if k not in by_num or len(t) > len(by_num[k]):
            by_num[k] = t[:200]

    b = {
        "ru": ("Основная часть", "Аргументы и примеры", "Развитие мысли"),
        "kz": ("Негізгі бөлім", "Дәлелдер мен мысалдар", "Ойды дамыту"),
        "en": ("Main body", "Arguments and examples", "Developing the idea"),
    }.get(doc_lang, ("Main body", "Arguments", "Development"))

    return [
        {"num": "1", "title": (by_num.get("1") or b[0])[:200], "page": "1"},
        {"num": "1.1", "title": (by_num.get("1.1") or b[1])[:200], "page": "2"},
        {"num": "1.2", "title": (by_num.get("1.2") or b[2])[:200], "page": "3"},
    ]


def generate_payment_preview(topic: str, work_type: str) -> dict:
    """
    Дешёвый предпросмотр: оглавление + начало первого раздела + названия остальных.
    Без источников и без полного текста.
    """
    global _session_cost
    _session_cost = 0.0

    topic = (topic or "").strip()
    if not topic:
        raise ValueError("Пустая тема")

    wt = (work_type or "").strip()
    if wt not in PREVIEW_WORK_TYPES:
        wt = "Реферат"

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
            f"Тип: {wt} — в toc для ответа можно дать строки «1», «1.1», «1.2» (основная часть с подпунктами); "
            f"на сервере в предпросмотре останется только эта тройка. Заголовки на языке темы."
        )
    elif wt == "Тест":
        structure_hint = f"Тип: {wt} — минимальное оглавление из 1–2 строк или одна строка с пустым num."
    else:
        cc = int(rules.get("chapters_count") or 3)
        sc = int(rules.get("subchapters_count") or 2)
        total_rows = 1 + cc + cc * sc + 2
        structure_hint = (
            f"Тип: {wt} — оглавление СТРОГО по стандарту: ровно {cc} главы с num «1»…«{cc}» (не больше), "
            f"у каждой главы ровно {sc} подпунктов «N.1»…«N.{sc}». Затем «{concl_w}» (num «{cc + 1}») и «{src_w}» (num «{cc + 2}»). "
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
- Ровно {cc} нумерованных глав (num «1»…«{cc}»), у каждой ровно {sc} подглав; затем заключение (num «{cc + 1}») и источники (num «{cc + 2}»). Не вставляй лишнюю главу «{cc + 1}» в основную часть.
- introduction_excerpt и first_chapter_excerpt — разный текст: во втором уже основная часть главы 1, не дублируй введение.
- locked_section_titles: минимум 4 раздела, логично идущие после показанного текста первой главы.

Не включай ключи кроме перечисленных. Не пиши пояснений вне JSON."""
        max_preview_tokens = 3800
    else:
        json_spec = """{
  "toc": [{"num": "1", "title": "название основной части без номера в title", "page": "строка"}, {"num": "1.1", "title": "...", "page": "строка"}, {"num": "1.2", "title": "...", "page": "строка"}],
  "continuous_excerpt": "строка — цельный связный отрывок начала работы без внутренних подзаголовков (~600 токенов выхода, до ~2600 знаков). Без markdown и без «ёлочек»; абзацы через \\n\\n",
  "locked_section_titles": ["строка", "строка", ...]
}"""
        req_tail = """Требования:
- toc: три строки с num «1», «1.1», «1.2» — только основная часть с подпунктами (без введения и заключения в списке).
- continuous_excerpt: законченные абзацы, не обрыв на полуслове.
- locked_section_titles: минимум 2 названия после показанного фрагмента.

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
    if not isinstance(locked, list):
        locked = []
    locked = [str(x).strip()[:200] for x in locked if str(x).strip()][:12]

    if len(clean_toc) < 3:
        mid_labels = {"ru": "Основная часть", "kz": "Негізгі бөлім", "en": "Main body"}
        sub_labels = {"ru": "Развитие темы", "kz": "Тақырыпты дамыту", "en": "Developing the topic"}
        mid = mid_labels.get(doc_lang, mid_labels["ru"])
        sub = sub_labels.get(doc_lang, sub_labels["ru"])
        clean_toc = [
            {"num": "", "title": intro_w, "page": "3"},
            {"num": "1", "title": mid, "page": "5"},
            {"num": "1.1", "title": sub, "page": "6"},
            {"num": "2", "title": concl_w, "page": "…"},
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
        "_cost_usd": round(_session_cost, 4),
    }


# Обратная совместимость
generate_referat = generate_work
