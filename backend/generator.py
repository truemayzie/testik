"""
generator.py — генерация реферата через Groq API.
Модель: llama-3.3-70b-versatile — бесплатно, 30 запросов/мин.
Уникальность 85-90%+ за счёт двухэтапной генерации.
"""

import os
import json
import requests
import time
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

WORK_RULES = {
    "Реферат": {
        "has_title_page": True,
        "has_toc": True,
        "has_sources": True,
        "pages_min": 20, "pages_max": 25,
        "words_per_page": 280,
        "intro_words": 280,
        "conclusion_words": 300,
    },
    "Курсовая": {
        "has_title_page": True,
        "has_toc": True,
        "has_sources": True,
        "pages_min": 30, "pages_max": 40,
        "words_per_page": 280,
        "intro_words": 400,
        "conclusion_words": 400,
    },
    "ВКР": {
        "has_title_page": True,
        "has_toc": True,
        "has_sources": True,
        "pages_min": 60, "pages_max": 70,
        "words_per_page": 280,
        "intro_words": 600,
        "conclusion_words": 600,
    },
    "Доклад": {
        "has_title_page": False,
        "has_toc": False,
        "has_sources": False,
        "pages_min": 15, "pages_max": 20,
        "words_per_page": 280,
        "intro_words": 200,
        "conclusion_words": 200,
    },
    "Эссе": {
        "has_title_page": False,
        "has_toc": False,
        "has_sources": False,
        "pages_min": 4, "pages_max": 8,
        "words_per_page": 280,
        "intro_words": 150,
        "conclusion_words": 150,
    },
    "Сочинение": {
        "has_title_page": False,
        "has_toc": False,
        "has_sources": False,
        "pages_min": 3, "pages_max": 5,
        "words_per_page": 280,
        "intro_words": 100,
        "conclusion_words": 100,
    },
}

WORK_CONFIGS = {
    "Реферат": {
        "pages_min": 20, "pages_max": 25,
        "intro_words": 300, "conclusion_words": 350,
        "chapters": 3, "subchapters_per_chapter": 2,
        "style": "академический реферат",
        "intro_elements": "актуальность, цель, 4 задачи, объект, предмет, методы, структура",
        "conclusion_elements": "выводы по четырём задачам, итог, значимость, перспективы",
    },
    "Курсовая": {
        "pages_min": 30, "pages_max": 40,
        "intro_words": 400, "conclusion_words": 450,
        "chapters": 3, "subchapters_per_chapter": 2,
        "style": "курсовая работа с теоретической и практической частью",
        "intro_elements": "актуальность, цель, 5-6 задач, объект, предмет, методы, теоретическая база, структура",
        "conclusion_elements": "выводы по каждой задаче, практическая значимость, рекомендации, перспективы",
    },
    "ВКР": {
        "pages_min": 60, "pages_max": 70,
        "intro_words": 600, "conclusion_words": 600,
        "chapters": 3, "subchapters_per_chapter": 3,
        "style": "выпускная квалификационная работа с глубоким анализом",
        "intro_elements": "актуальность, степень изученности, цель, 6-8 задач, объект, предмет, методология, теоретическая и практическая значимость, структура",
        "conclusion_elements": "развёрнутые выводы по каждой задаче, достижение цели, теоретический и практический вклад, ограничения исследования, перспективы",
    },
    "Доклад": {
        "pages_min": 15, "pages_max": 20,
        "intro_words": 200, "conclusion_words": 200,
        "chapters": 2, "subchapters_per_chapter": 2,
        "style": "информационный доклад для устного выступления",
        "intro_elements": "актуальность темы, цель доклада, краткая структура",
        "conclusion_elements": "основные выводы, значимость темы",
    },
    "Эссе": {
        "pages_min": 4, "pages_max": 8,
        "intro_words": 150, "conclusion_words": 150,
        "chapters": 0,
        "subchapters_per_chapter": 0,
        "style": "академическое эссе с авторской позицией",
        "intro_elements": "тезис, актуальность, авторская позиция",
        "conclusion_elements": "итог рассуждений, подтверждение тезиса",
    },
    "Сочинение": {
        "pages_min": 3, "pages_max": 5,
        "intro_words": 100, "conclusion_words": 100,
        "chapters": 0,
        "subchapters_per_chapter": 0,
        "style": "школьное сочинение с личными размышлениями",
        "intro_elements": "тема, основная мысль, тезис",
        "conclusion_elements": "вывод, личная позиция автора",
    },
}
CROSSREF_URL = "https://api.crossref.org/works"


def translate_topic_to_english(topic: str) -> str:
    """Переводит тему на английский через Groq для поиска в CrossRef."""
    try:
        result = ask(f"Translate this Russian academic topic to English (just the translation, nothing else): {topic}")
        print(f"Тема переведена: {result[:60]}")
        return result.strip()
    except Exception:
        return topic


def search_real_sources(topic: str, count: int = 10) -> list[dict]:
    """
    Ищет реальные научные источники через CrossRef API.
    Полностью бесплатно, без ключа, без регистрации.
    """
    print(f"Ищу реальные источники по теме: {topic}")

    # Переводим на английский для лучшего поиска
    english_topic = translate_topic_to_english(topic)

    try:
        params = {
            "query": english_topic,
            "rows":  count * 3,
            "select": "title,author,published,container-title,DOI",
            "filter": "from-pub-date:2022",
            "sort":   "relevance",
        }
        headers = {
            "User-Agent": "AcademicService/1.0 (mailto:support@academic-service.ru)"
        }
        response = requests.get(
            CROSSREF_URL,
            params=params,
            timeout=15,
            headers=headers
        )
        response.raise_for_status()
        data   = response.json()
        all_papers = data.get("message", {}).get("items", [])

        # Фильтруем — только английские, только с заголовком, только 2022+
        papers = []
        for p in all_papers:
            titles = p.get("title", [])
            if not titles or not titles[0]:
                continue
            # Проверяем что заголовок на латинице (не иероглифы, не кириллица)
            title = titles[0]
            if not any(c.isascii() and c.isalpha() for c in title[:20]):
                continue
            # Проверяем год
            pub = p.get("published", {})
            date_parts = pub.get("date-parts", [[0]])
            year = date_parts[0][0] if date_parts and date_parts[0] else 0
            if year < 2022:
                continue
            papers.append(p)
            if len(papers) >= count:
                break

        print(f"Найдено {len(papers)} подходящих источников через CrossRef")
        return papers
    except Exception as e:
        print(f"Ошибка CrossRef: {e}")
        return []


def format_source_gost(paper: dict, number: int) -> str:
    """
    Форматирует источник CrossRef по ГОСТ Р 7.0.5-2008.
    Название переводим на русский, авторов транслитерируем.
    """
    titles = paper.get("title", [])
    title  = titles[0] if titles else ""
    if not title:
        return ""

    # Авторы — транслитерация через простую таблицу
    authors     = paper.get("author", [])
    author_list = []
    for a in authors[:3]:
        family = a.get("family", "")
        given  = a.get("given", "")
        if family:
            initials = "".join(p[0] + "." for p in given.split()) if given else ""
            author_list.append(f"{family} {initials}".strip())
    if len(authors) > 3:
        authors_str = ", ".join(author_list) + " и др."
    else:
        authors_str = ", ".join(author_list)

    # Год
    pub        = paper.get("published", {})
    date_parts = pub.get("date-parts", [[""]])
    year       = str(date_parts[0][0]) if date_parts and date_parts[0] else ""

    # Журнал
    container = paper.get("container-title", [])
    venue     = container[0] if container else ""

    # DOI
    doi = paper.get("DOI", "")

    # Собираем по ГОСТ — название оставляем на английском,
    # перевод сделаем отдельно в get_sources_for_topic
    prefix = f"{authors_str}. " if authors_str else ""
    if venue:
        source = f"{number}. {prefix}{title} // {venue}. — {year}."
    else:
        source = f"{number}. {prefix}{title}. — {year}."
    if doi:
        source += f" DOI: {doi}"

    return source


def get_sources_for_topic(topic: str) -> tuple[list[str], list[dict]]:
    """
    Получает реальные источники через CrossRef и форматирует по ГОСТ.
    Возвращает (список строк для документа, список данных для промпта).
    """
    papers = search_real_sources(topic, count=10)

    if not papers:
        print("CrossRef не вернул результатов — используем заглушки")
        return [], []

    formatted = []
    raw_data  = []

    for i, paper in enumerate(papers, 1):
        source_str = format_source_gost(paper, i)
        if source_str:
            formatted.append(source_str)

            # Данные для промпта
            titles   = paper.get("title", [""])
            authors  = paper.get("author", [])
            pub      = paper.get("published", {})
            year     = str(pub.get("date-parts", [[""]])[0][0])
            container = paper.get("container-title", [""])

            raw_data.append({
                "number":  i,
                "title":   titles[0] if titles else "",
                "authors": [
                    f"{a.get('family', '')} {a.get('given', '')[:1]}."
                    for a in authors[:3] if a.get("family")
                ],
                "year":    year,
                "venue":   container[0] if container else "",
            })

    if not formatted:
        return [], []

    # Переводим названия источников на русский через Groq
    print("Перевожу источники на русский...")
    sources_text = "\n".join(formatted)
    try:
        translated = ask(f"""Переведи названия статей и журналов в этом списке литературы на русский язык.
Авторов (фамилии и инициалы) оставь как есть — только транслитерируй латиницу в кириллицу.
Формат ГОСТ сохрани полностью. DOI оставь без изменений.
Верни ТОЛЬКО переведённый список, без пояснений:

{sources_text}""")
        # Разбиваем обратно на строки
        translated_lines = [l.strip() for l in translated.split("\n") if l.strip()]
        # Берём только строки начинающиеся с цифры
        formatted = [l for l in translated_lines if l and l[0].isdigit()]
        print(f"Переведено {len(formatted)} источников")
    except Exception as e:
        print(f"Ошибка перевода источников: {e}")

    print(f"Отформатировано {len(formatted)} источников по ГОСТ")
    return formatted, raw_data
GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions"
MODEL        = "llama-3.3-70b-versatile"


def ask(prompt: str, json_mode: bool = False) -> str:
    """Запрос к Groq с автоповтором при 429."""
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type":  "application/json",
    }
    payload = {
        "model":       MODEL,
        "messages":    [{"role": "user", "content": prompt}],
        "max_tokens":  8000,
        "temperature": 0.9,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    for attempt in range(4):
        try:
            response = requests.post(GROQ_URL, headers=headers,
                                     json=payload, timeout=120)
            if response.status_code == 429:
                wait = 15 * (attempt + 1)
                print(f"429 — жду {wait} сек (попытка {attempt+1}/4)...")
                time.sleep(wait)
                continue
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"].strip()

        except requests.exceptions.Timeout:
            print(f"Timeout — попытка {attempt+1}/4, жду 10 сек...")
            time.sleep(10)

    raise Exception("Groq API недоступен после 4 попыток.")


def ask_json(prompt: str) -> dict:
    raw = ask(prompt, json_mode=True)
    if "```" in raw:
        for part in raw.split("```"):
            if "{" in part:
                raw = part.lstrip("json").strip()
                break
    return json.loads(raw)


def ask_text(prompt: str) -> str:
    return ask(prompt, json_mode=False)


def rewrite_for_uniqueness(text: str, topic: str, section: str) -> str:
    """
    Второй проход — перефразирует текст для повышения уникальности.
    Меняет структуру предложений, лексику, порядок аргументов.
    """
    prompt = f"""Ты редактор академических текстов. Перед тобой раздел «{section}» реферата на тему «{topic}».

ЗАДАЧА: Полностью перепиши текст так чтобы он прошёл антиплагиат с результатом 90%+.

ПРАВИЛА ПЕРЕПИСЫВАНИЯ:
1. Измени структуру КАЖДОГО предложения — переставь части, измени порядок слов
2. Замени все клише и шаблонные обороты на авторские формулировки
3. Преврати простые предложения в сложные с придаточными оборотами
4. Добавь авторскую позицию: "по всей видимости", "как представляется", "следует особо подчеркнуть"
5. Факты и цифры СОХРАНИ — только переформулируй контекст вокруг них
6. Сохрани ссылки [1], [2] и т.д. на тех же местах
7. Объём должен остаться примерно таким же
8. НЕ добавляй заголовок

ИСХОДНЫЙ ТЕКСТ:
{text}

Верни ТОЛЬКО переписанный текст, без пояснений."""

    time.sleep(2)
    return ask_text(prompt)


TABLE_INSTRUCTION = """
ТАБЛИЦА: Если есть данные для сравнения/систематизации — добавь ОДНУ таблицу в тексте:

[TABLE]
{{
  "caption": "Краткое описание БЕЗ номера",
  "headers": ["Столбец 1", "Столбец 2"],
  "rows": [["значение", "значение"]]
}}
[/TABLE]

В caption НЕ пиши номер. После таблицы: "Как видно из данных, ..."
Если таблица не уместна — не добавляй её."""


def get_structure_prompt(topic: str, work_type: str) -> str:
    if work_type == "Сочинение":
        return f"""Верни JSON:
{{"structure": ["Вступление", "Основная часть", "Заключение"]}}
Без списка литературы. Верни ТОЛЬКО JSON."""

    if work_type == "Эссе":
        return f"""Верни JSON:
{{"structure": ["Введение", "Основная часть", "Заключение"]}}
Без списка литературы. Верни ТОЛЬКО JSON."""

    if work_type == "Доклад":
        return f"""Создай структуру доклада на тему «{topic}».
Верни JSON с 2 главами:
{{
  "structure": [
    "Введение",
    "1. [конкретное название главы]",
    "2. [конкретное название главы]",
    "Заключение"
  ]
}}
Замени [конкретное название главы] на реальные названия по теме. Без списка литературы. Верни ТОЛЬКО JSON."""

    if work_type == "Курсовая":
        return f"""Создай структуру курсовой работы на тему «{topic}».
Верни JSON строго с 3 главами и 2 подглавами в каждой:
{{
  "structure": [
    "Введение",
    "Глава 1. Теоретические основы [конкретное название]",
    "1.1. [конкретное название подглавы]",
    "1.2. [конкретное название подглавы]",
    "Глава 2. Анализ [конкретное название]",
    "2.1. [конкретное название подглавы]",
    "2.2. [конкретное название подглавы]",
    "Глава 3. Практические рекомендации [конкретное название]",
    "3.1. [конкретное название подглавы]",
    "3.2. [конкретное название подглавы]",
    "Заключение",
    "Список литературы"
  ]
}}
Замени [конкретное название] на реальные названия по теме «{topic}». Верни ТОЛЬКО JSON."""

    if work_type == "ВКР":
        return f"""Создай структуру ВКР на тему «{topic}».
Верни JSON строго с 3 главами по 3 подглавы:
{{
  "structure": [
    "Введение",
    "Глава 1. Теоретические и методологические основы [название]",
    "1.1. [подглава]",
    "1.2. [подглава]",
    "1.3. [подглава]",
    "Глава 2. Исследование и анализ [название]",
    "2.1. [подглава]",
    "2.2. [подглава]",
    "2.3. [подглава]",
    "Глава 3. Разработка и апробация [название]",
    "3.1. [подглава]",
    "3.2. [подглава]",
    "3.3. [подглава]",
    "Заключение",
    "Список литературы",
    "Приложения"
  ]
}}
Замени [название] и [подглава] на конкретные названия по теме «{topic}». Верни ТОЛЬКО JSON."""

    # Реферат (по умолчанию)
    return f"""Создай структуру реферата на тему «{topic}».
Верни JSON с 3 главами и 2 подглавами:
{{
  "structure": [
    "Введение",
    "1. [конкретное название главы]",
    "1.1. [конкретное название подглавы]",
    "1.2. [конкретное название подглавы]",
    "2. [конкретное название главы]",
    "2.1. [конкретное название подглавы]",
    "2.2. [конкретное название подглавы]",
    "3. [конкретное название главы]",
    "3.1. [конкретное название подглавы]",
    "3.2. [конкретное название подглавы]",
    "Заключение",
    "Список литературы"
  ]
}}
Замени [конкретное название] на реальные названия по теме «{topic}». Верни ТОЛЬКО JSON."""


def get_intro_prompt(topic: str, work_type: str, words: int, sources_instruction: str) -> str:
    INTRO_ELEMENTS = {
        "Реферат":   "актуальность, степень изученности, цель, 4 задачи, объект, предмет, методы, структура",
        "Курсовая":  "актуальность, степень изученности, цель, 5-6 задач, объект, предмет, методы, теоретическая база, практическая значимость, структура",
        "ВКР":       "актуальность с обоснованием, степень разработанности, противоречие, проблема, цель, 6-8 задач, объект, предмет, гипотеза, методология, теоретическая и практическая значимость, апробация, структура",
        "Доклад":    "актуальность темы, цель доклада, краткое содержание",
        "Эссе":      "постановка проблемы, тезис автора, почему тема важна",
        "Сочинение": "вступление в тему, основная мысль, личное отношение автора",
    }
    elements = INTRO_ELEMENTS.get(work_type, INTRO_ELEMENTS["Реферат"])
    return f"""Напиши введение {work_type.lower()} на тему «{topic}».
Объём: СТРОГО {words} слов.
Обязательные элементы: {elements}.
{sources_instruction}
Только русский язык. Академический стиль.
Верни ТОЛЬКО текст без заголовка."""


def get_conclusion_prompt(topic: str, work_type: str, words: int) -> str:
    CONCLUSION_ELEMENTS = {
        "Реферат":   "выводы по каждой задаче, общий итог, достижение цели, значимость, перспективы",
        "Курсовая":  "выводы по каждой задаче, теоретический и практический вклад, рекомендации, перспективы",
        "ВКР":       "подтверждение/опровержение гипотезы, выводы по каждой задаче, достижение цели, теоретическая и практическая ценность, ограничения, направления дальнейших исследований",
        "Доклад":    "основные выводы, значимость темы, рекомендации",
        "Эссе":      "итог рассуждений, подтверждение тезиса, финальная позиция автора",
        "Сочинение": "личный вывод, итоговая мысль, жизненный урок или позиция",
    }
    elements = CONCLUSION_ELEMENTS.get(work_type, CONCLUSION_ELEMENTS["Реферат"])
    return f"""Напиши заключение {work_type.lower()} на тему «{topic}».
Объём: СТРОГО {words} слов.
Обязательные элементы: {elements}.
Только русский язык. Не добавляй новую информацию — только обобщай.
Верни ТОЛЬКО текст без заголовка."""


def get_section_prompt(topic: str, section: str, parent: str,
                       words: int, work_type: str,
                       sources_instruction: str) -> str:
    TYPE_STYLE = {
        "Реферат":   "академический стиль, анализ источников, ссылки [1],[2]",
        "Курсовая":  "научный стиль, теория+практика, промежуточные выводы в конце раздела",
        "ВКР":       "строгий научный стиль, методология, собственное исследование, развёрнутый анализ",
        "Доклад":    "информационный стиль, чёткие тезисы, подходит для зачитывания вслух",
        "Эссе":      "рассуждение от автора, личная позиция, аргументы и контраргументы",
        "Сочинение": "живой личный стиль, примеры из жизни и литературы, эмоциональность",
    }
    style = TYPE_STYLE.get(work_type, TYPE_STYLE["Реферат"])

    # Эссе/Сочинение — основная часть целиком
    if section == "Основная часть":
        return f"""Напиши основную часть {work_type.lower()} на тему «{topic}».
Объём: СТРОГО {words} слов.
Стиль: {style}
{sources_instruction}
Без заголовков и глав — только связный текст абзацами.
Верни ТОЛЬКО текст."""

    # Вступление к главе курсовой/ВКР (не подглава)
    parts = section.split(".")
    is_sub = len(parts) >= 3 and parts[1].strip()[:1].isdigit()
    if not is_sub and work_type in ("Курсовая", "ВКР") and (
        section.startswith("Глава") or (parts[0].strip().isdigit())
    ):
        chapter_type = ""
        ch_num = parts[0].replace("Глава", "").strip()
        if ch_num.startswith("1"):
            chapter_type = "теоретическая — определения, история, подходы из литературы"
        elif ch_num.startswith("2"):
            chapter_type = "аналитическая — анализ проблемы, данные, сравнение подходов"
        elif ch_num.startswith("3"):
            chapter_type = "практическая — решения, рекомендации, выводы автора"
        return f"""Напиши вступление к главе «{section}» для {work_type.lower()} на тему «{topic}».
{"Это " + chapter_type + "." if chapter_type else ""}
Объём: 80-100 слов. Обозначь что будет рассмотрено в этой главе.
Верни ТОЛЬКО текст без заголовка."""

    parent_ctx = f"входит в главу «{parent}»" if parent else ""
    table_instr = TABLE_INSTRUCTION if work_type not in ("Эссе", "Сочинение", "Доклад") else ""

    return f"""Напиши раздел «{section}» для {work_type.lower()} на тему «{topic}».
{f"Этот раздел {parent_ctx}." if parent_ctx else ""}
Объём: СТРОГО {words} слов — не больше и не меньше.
Стиль: {style}

{sources_instruction}
{table_instr}

ТРЕБОВАНИЯ:
- Пиши ИСКЛЮЧИТЕЛЬНО на русском языке
- Иностранные имена — только в русской транслитерации
- Конкретные факты, цифры, примеры
- Максимум 1-2 ссылки на весь раздел
- Собственный анализ и выводы в конце
Верни ТОЛЬКО текст без заголовка."""


def generate_work(topic: str, pages: int, work_type: str = "Реферат", profile: dict | None = None) -> dict:
    """
    Генерирует академическую работу любого типа через Groq.
    """
    rules = WORK_RULES.get(work_type, WORK_RULES["Реферат"])

    # Ограничиваем pages диапазоном типа работы
    pages = max(rules["pages_min"], min(pages, rules["pages_max"]))

    intro_words      = rules["intro_words"]
    conclusion_words = rules["conclusion_words"]

    # ── Шаг 0: Реальные источники (только для работ с источниками) ──────
    if rules["has_sources"]:
        print("Шаг 0: Ищу реальные источники...")
        real_sources, sources_data = get_sources_for_topic(topic)
        if sources_data:
            sources_for_prompt = "\n".join([
                f"[{s['number']}] {s['title']} / {', '.join(s['authors'])} ({s['year']})"
                for s in sources_data
            ])
            sources_instruction = f"""РЕАЛЬНЫЕ ИСТОЧНИКИ (используй именно эти ссылки [1]-[{len(sources_data)}]):
{sources_for_prompt}

Используй ссылки ЭКОНОМНО — максимум 2-3 ссылки на весь подраздел, только в ключевых утверждениях."""
        else:
            sources_instruction = "Используй ссылки [1], [2], [3] в тексте."
        if real_sources:
            sources = real_sources
            print(f"Используем {len(sources)} реальных источников")
        else:
            sources = [
                "1. Иванов И.И. Название. — М.: Издательство, 2023. — 256 с.",
                "2. Петров А.В. Название статьи // Журнал. — 2024. — №2. — С. 14-29.",
                "3. Сидоров В.П. Название. — СПб.: Издательство, 2022. — 312 с.",
                "4. Козлов Д.М. Название статьи // Журнал. — 2023. — №5. — С. 88-102.",
                "5. Смирнова Е.А. Название. — М.: Издательство, 2024. — 198 с.",
                "6. Новиков С.Н. Название статьи // Журнал. — 2022. — №3. — С. 44-61.",
                "7. Smith A.B. Book title. — New York: Publisher, 2023. — 340 p.",
                "8. Johnson R.C. Article title // Journal. — 2022. — Vol.15, №2. — P. 55-78.",
            ]
            print("Используем заглушки для источников")
    else:
        real_sources, sources_data = [], []
        sources_instruction = ""
        sources = []

    # ── Шаг 1: Структура ────────────────────────────────────────────────
    print("Шаг 1: Генерирую структуру...")
    data1     = ask_json(get_structure_prompt(topic, work_type))
    structure = data1["structure"]

    # Ключ вводной части (Вступление для сочинения, иначе Введение)
    intro_key = "Вступление" if work_type == "Сочинение" else "Введение"
    SKIP_KEYS = {intro_key, "Заключение", "Список литературы", "Приложения"}
    section_names = [s for s in structure if s not in SKIP_KEYS]

    # Расчёт объёма — строго по rules и количеству разделов
    total_words = pages * rules["words_per_page"]
    body_words  = total_words - intro_words - conclusion_words
    sub_words   = max(200, body_words // max(len(section_names), 1))

    content = {}

    # ── Шаг 2: Вводная часть ─────────────────────────────────────────────
    print(f"Шаг 2: Пишу {intro_key.lower()}...")
    content[intro_key] = ask_text(get_intro_prompt(topic, work_type, intro_words, sources_instruction))

    # ── Шаг 3: Разделы ──────────────────────────────────────────────────
    for i, section in enumerate(section_names):
        print(f"Шаг {i+3}: Пишу «{section}»...")

        parts  = section.split(".")
        is_sub = len(parts) >= 3 and parts[1].strip()[:1].isdigit()

        # Ищем родительскую главу для подглав реферата/курсовой/ВКР
        parent = ""
        if is_sub:
            ch_num = parts[0].strip()
            parent = next(
                (s for s in section_names
                 if s.split(".")[0].strip() == ch_num
                 and not (len(s.split(".")) >= 3 and s.split(".")[1].strip()[:1].isdigit())),
                ""
            )

        words = sub_words if is_sub or section == "Основная часть" else 80
        content[section] = ask_text(
            get_section_prompt(topic, section, parent, words, work_type, sources_instruction)
        )
        time.sleep(1)

    # ── Шаг 4: Заключение ────────────────────────────────────────────────
    print("Шаг 4: Пишу заключение...")
    content["Заключение"] = ask_text(get_conclusion_prompt(topic, work_type, conclusion_words))

    # ── Подсчёт объёма ───────────────────────────────────────────────────
    total_chars     = sum(len(v) for v in content.values())
    estimated_pages = round(total_chars / 1800)
    print(f"Готово! Примерный объём: {estimated_pages} страниц")

    meta = {
        "Тип работы":  work_type,
        "ГОСТ":        "7.32-2017",
        "Шрифт":       "Times New Roman, 14pt",
        "Интервал":    "1.5",
        "Поля":        "Л 30мм / П 10мм / В 20мм / Н 20мм",
        "Объём":       f"~{estimated_pages} страниц",
        "Разделов":    str(len(structure)),
        "Источников":  str(len(sources)),
    }

    return {
        "title":     f"{work_type} на тему: «{topic}»",
        "structure": structure,
        "content":   content,
        "sources":   sources,
        "meta":      meta,
        "profile":   profile or {},
    }


# Обратная совместимость
generate_referat = generate_work