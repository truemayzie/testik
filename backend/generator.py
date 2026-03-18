"""
generator.py — генерация учебных работ через Claude API.
Модель: claude-sonnet-4-5
"""

import os
import json
import requests
import time
from dotenv import load_dotenv
import anthropic

load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
MODEL  = "claude-sonnet-4-5"


def ask(prompt: str, max_tokens: int = 8000) -> str:
    """Запрос к Claude API."""
    message = client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}]
    )
    return message.content[0].text.strip()


def ask_json(prompt: str) -> dict:
    """Запрос к Claude, возвращает JSON."""
    raw = ask(prompt + "\n\nВерни ТОЛЬКО валидный JSON без markdown и пояснений.")
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
    import re
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'\*{1,3}([^*]+)\*{1,3}', r'\1', text)
    text = re.sub(r'```[^`]*```', '', text, flags=re.DOTALL)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    text = re.sub(r'^[-*_]{3,}\s*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


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
        "words_per_page": 280,
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
        "words_per_page": 280,
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
}


# ── CrossRef — реальные источники ──────────────────────────────────────────

CROSSREF_URL = "https://api.crossref.org/works"


def translate_topic_to_english(topic: str) -> str:
    """Переводит тему на английский через Claude для поиска в CrossRef."""
    try:
        result = ask(
            f"Translate this Russian academic topic to English "
            f"(just the translation, nothing else): {topic}",
            max_tokens=200,
        )
        print(f"Тема переведена: {result[:60]}")
        return result.strip()
    except Exception:
        return topic


def search_real_sources(topic: str, count: int = 10) -> list:
    """Ищет реальные научные источники через CrossRef API."""
    print(f"Ищу реальные источники по теме: {topic}")
    english_topic = translate_topic_to_english(topic)

    try:
        params = {
            "query":  english_topic,
            "rows":   count * 3,
            "select": "title,author,published,container-title,DOI",
            "filter": "from-pub-date:2022",
            "sort":   "relevance",
        }
        headers = {
            "User-Agent": "AcademicService/1.0 (mailto:support@academic-service.ru)"
        }
        response = requests.get(CROSSREF_URL, params=params, timeout=15, headers=headers)
        response.raise_for_status()
        data      = response.json()
        all_papers = data.get("message", {}).get("items", [])

        papers = []
        for p in all_papers:
            titles = p.get("title", [])
            if not titles or not titles[0]:
                continue
            title = titles[0]
            if not any(c.isascii() and c.isalpha() for c in title[:20]):
                continue
            pub        = p.get("published", {})
            date_parts = pub.get("date-parts", [[0]])
            year       = date_parts[0][0] if date_parts and date_parts[0] else 0
            if year < 2022:
                continue
            papers.append(p)
            if len(papers) >= count:
                break

        print(f"Найдено {len(papers)} источников через CrossRef")
        return papers
    except Exception as e:
        print(f"Ошибка CrossRef: {e}")
        return []


def format_source_gost(paper: dict, number: int) -> str:
    """Форматирует источник CrossRef по ГОСТ Р 7.0.5-2008."""
    titles = paper.get("title", [])
    title  = titles[0] if titles else ""
    if not title:
        return ""

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

    pub        = paper.get("published", {})
    date_parts = pub.get("date-parts", [[""]])
    year       = str(date_parts[0][0]) if date_parts and date_parts[0] else ""

    container = paper.get("container-title", [])
    venue     = container[0] if container else ""
    doi       = paper.get("DOI", "")

    prefix = f"{authors_str}. " if authors_str else ""
    if venue:
        source = f"{number}. {prefix}{title} // {venue}. — {year}."
    else:
        source = f"{number}. {prefix}{title}. — {year}."
    if doi:
        source += f" DOI: {doi}"

    return source


def get_sources_for_topic(topic: str) -> tuple:
    """Получает реальные источники и форматирует по ГОСТ."""
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
                "year":  year,
                "venue": container[0] if container else "",
            })

    if not formatted:
        return [], []

    # Переводим на русский через Claude
    print("Перевожу источники на русский...")
    sources_text = "\n".join(formatted)
    try:
        translated = ask(
            f"""Переведи названия статей и журналов в этом списке литературы на русский язык.
Авторов (фамилии и инициалы) оставь как есть — только транслитерируй латиницу в кириллицу.
Формат ГОСТ сохрани полностью. DOI оставь без изменений.
Верни ТОЛЬКО переведённый список, без пояснений:

{sources_text}"""
        )
        translated_lines = [l.strip() for l in translated.split("\n") if l.strip()]
        formatted = [l for l in translated_lines if l and l[0].isdigit()]
        print(f"Переведено {len(formatted)} источников")
    except Exception as e:
        print(f"Ошибка перевода источников: {e}")

    print(f"Отформатировано {len(formatted)} источников по ГОСТ")
    return formatted, raw_data


# ── Промпты структуры ───────────────────────────────────────────────────────

def get_structure_prompt(topic: str, work_type: str, rules: dict) -> str:

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
    "Введение",
    "1. [конкретное название главы]",
    "1.1. [конкретное название подглавы]",
    "1.2. [конкретное название подглавы]",
    "2. [конкретное название главы]",
    "2.1. [конкретное название подглавы]",
    "2.2. [конкретное название подглавы]",
    "Заключение",
    "Список литературы"
  ]
}}

Замени [конкретное название] на реальные названия по теме. Верни ТОЛЬКО JSON."""

    if work_type == "Реферат":
        return f"""Создай структуру реферата на тему «{topic}».

Верни JSON с 3 главами и 2 подглавами в каждой:
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

    if work_type == "Курсовая":
        return f"""Создай структуру курсовой работы на тему «{topic}».

Верни JSON строго с 3 главами:
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
    "Глава 3. Разработка решений и практические результаты [название]",
    "3.1. [подглава]",
    "3.2. [подглава]",
    "3.3. [подглава]",
    "Заключение",
    "Список литературы",
    "Приложения"
  ]
}}

Замени [название] и [подглава] на конкретные названия по теме «{topic}». Верни ТОЛЬКО JSON."""

    # Реферат по умолчанию
    return get_structure_prompt(topic, "Реферат", rules)


# ── Промпты введения ────────────────────────────────────────────────────────

def get_intro_prompt(topic: str, work_type: str, words: int, sources_instruction: str) -> str:

    INTRO_ELEMENTS = {
        "Доклад":   "актуальность темы, цель доклада, краткое содержание разделов",
        "Реферат":  "актуальность темы, степень изученности, цель, 4 конкретные задачи нумерованным списком, объект, предмет, методы, структура работы",
        "Курсовая": "актуальность с обоснованием, степень изученности проблемы, противоречие, цель, 5-6 задач нумерованным списком, объект, предмет, методы исследования, теоретическая база, практическая значимость, структура",
        "ВКР":      "актуальность с научным обоснованием, степень разработанности в литературе, научная проблема, цель, 6-8 задач нумерованным списком, объект, предмет, гипотеза, методология (теоретические и эмпирические методы), теоретическая значимость, практическая значимость, апробация результатов, структура работы",
    }

    elements = INTRO_ELEMENTS.get(work_type, INTRO_ELEMENTS["Реферат"])

    return f"""Напиши введение {work_type.lower()} на тему «{topic}».
Объём: строго {words} слов — считай слова точно.

Обязательные элементы:
{elements}

{sources_instruction}

Требования:
- ТОЛЬКО русский язык
- Иностранные имена — только в русской транслитерации
- Академический стиль
- Конкретные формулировки, не общие фразы
- Максимум 1-2 ссылки на источники

- НИКАКОГО markdown: никаких #, ##, **, *, ---, нумерованных списков с точкой
- Все иностранные имена и названия — ТОЛЬКО в русской транслитерации
- Никаких латинских букв кроме устоявшихся научных терминов (DOI, pH и т.п.)

Верни ТОЛЬКО текст введения без заголовка."""


# ── Промпты для разделов ────────────────────────────────────────────────────

def get_section_prompt(topic: str, section: str, parent: str,
                       words: int, work_type: str,
                       sources_instruction: str) -> str:

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
        return f"""Напиши краткое вступление к главе «{section}» {work_type.lower()} на тему «{topic}».
{f"Контекст: {chapter_context}" if chapter_context else ""}
Объём: 80-100 слов.
Обозначь что будет рассмотрено в этой главе.
Только русский язык. Академический стиль. Никакого markdown.
Все иностранные имена — только в русской транслитерации.
Верни ТОЛЬКО текст без заголовка."""

    # Основная часть для Эссе/Сочинения
    if section == "Основная часть":
        TYPE_STYLE = {
            "Эссе":      "разговорный, авторская позиция, аргументы и контраргументы",
            "Сочинение": "живой личный стиль, примеры из жизни и литературы, эмоциональность",
        }
        style = TYPE_STYLE.get(work_type, "академический стиль")
        return f"""Напиши основную часть {work_type.lower()} на тему «{topic}».
Объём: СТРОГО {words} слов.
Стиль: {style}
Без заголовков и глав — только связный текст абзацами.
Верни ТОЛЬКО текст."""

    # Основной промпт для подглав
    STYLE_BY_TYPE = {
        "Доклад":   "информационный стиль, чёткие тезисы, понятный язык для устного выступления",
        "Реферат":  "академический стиль, анализ, авторская оценка, разнообразные синтаксические конструкции",
        "Курсовая": f"научный стиль, {chapter_context}" if chapter_context else "научный стиль",
        "ВКР":      f"строгий научный стиль, {chapter_context}, собственный исследовательский вклад" if chapter_context else "строгий научный стиль",
    }
    style      = STYLE_BY_TYPE.get(work_type, "академический стиль")
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

    return f"""Напиши раздел «{section}» для {work_type.lower()} на тему «{topic}».
{parent_text}
Объём: строго {words} слов — считай слова точно.
Стиль: {style}

{sources_instruction}
{tables_instruction}

ТРЕБОВАНИЯ:
- ТОЛЬКО русский язык — никаких иностранных слов кроме устоявшихся терминов
- Иностранные имена учёных — только в русской транслитерации
- Никаких артефактов, пустых квадратов □, непечатных символов
- Конкретные факты, цифры, примеры
- Авторская позиция и собственные выводы
- Максимум 1-2 ссылки на источники [1], [2]
- В конце главы (не подглавы) — краткий вывод 2-3 предложения
- НИКАКОГО markdown: никаких #, ##, **, *, ---, нумерованных списков
- Все иностранные имена и названия — ТОЛЬКО в русской транслитерации
- Никаких латинских букв кроме устоявшихся научных терминов (DOI, pH и т.п.)

Верни ТОЛЬКО текст без заголовка."""


# ── Промпты заключения ──────────────────────────────────────────────────────

def get_conclusion_prompt(topic: str, work_type: str, words: int) -> str:

    CONCLUSION_ELEMENTS = {
        "Доклад":   "основные выводы по каждому разделу, значимость темы, практические рекомендации",
        "Реферат":  "выводы по каждой из 4 задач из введения, достижение цели, теоретическая и практическая значимость, перспективы изучения",
        "Курсовая": "выводы по каждой задаче, теоретический вклад, практические рекомендации, перспективы дальнейшего исследования",
        "ВКР":      "подтверждение или опровержение гипотезы, выводы по каждой задаче, достижение цели, теоретическая значимость, практическая ценность, ограничения исследования, направления дальнейших исследований",
    }

    elements = CONCLUSION_ELEMENTS.get(work_type, CONCLUSION_ELEMENTS["Реферат"])

    return f"""Напиши заключение {work_type.lower()} на тему «{topic}».
Объём: строго {words} слов — считай слова точно.

Обязательные элементы:
{elements}

Требования:
- ТОЛЬКО русский язык
- Не добавляй новую информацию — только обобщай результаты
- Конкретные выводы, не общие фразы
- Академический стиль
- НИКАКОГО markdown: никаких #, ##, **, *, ---
- Все иностранные имена — ТОЛЬКО в русской транслитерации
- Никаких латинских букв кроме устоявшихся научных терминов

Верни ТОЛЬКО текст без заголовка."""


# ── Специальная генерация для Сочинения и Эссе ─────────────────────────────

def generate_essay_or_composition(topic: str, pages: int, work_type: str) -> dict:
    """Генерация сочинения или эссе — единым текстом без глав."""

    rules = WORK_RULES[work_type]
    pages = max(rules["pages_min"], min(pages, rules["pages_max"]))
    total_words = pages * rules["words_per_page"]

    if work_type == "Сочинение":
        prompt = f"""Напиши сочинение на тему «{topic}».
Объём: строго {total_words} слов — считай слова точно.

Структура (не выделять заголовками!):
1. Вступление — введение в тему, основная мысль автора (примерно {total_words // 6} слов)
2. Основная часть — рассуждения, примеры из жизни или литературы, личный опыт ({total_words * 2 // 3} слов)
3. Заключение — вывод, личная позиция ({total_words // 6} слов)

Стиль:
- Пиши как живой человек, от первого лица
- Живой язык, эмоциональность, личные наблюдения
- Примеры из реальной жизни или книг
- Плавные переходы между абзацами
- НИКАКИХ заголовков, нумерации, разделов
- ТОЛЬКО русский язык

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

Верни ТОЛЬКО текст эссе — без заголовка, без пояснений."""

    text = ask_text(prompt)

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


# ── Главная функция генерации ───────────────────────────────────────────────

def generate_work(topic: str, pages: int, work_type: str = "Реферат",
                  profile: dict | None = None) -> dict:
    """Генерирует работу нужного типа через Claude API."""

    rules = WORK_RULES.get(work_type, WORK_RULES["Реферат"])

    # Ограничиваем pages диапазоном типа
    pages = max(rules["pages_min"], min(pages, rules["pages_max"]))

    # Сочинение и Эссе — отдельная логика
    if work_type in ("Сочинение", "Эссе"):
        result = generate_essay_or_composition(topic, pages, work_type)
        result["profile"] = profile or {}
        return result

    # Расчёт объёма
    total_words      = pages * rules["words_per_page"]
    intro_words      = rules["intro_words"]
    conclusion_words = rules["conclusion_words"]
    body_words       = total_words - intro_words - conclusion_words

    # Шаг 0: Реальные источники
    print("Шаг 0: Ищу реальные источники...")
    real_sources, sources_data = get_sources_for_topic(topic)

    sources_min = rules.get("sources_min", 8)

    if sources_data:
        sources_for_prompt = "\n".join([
            f"[{s['number']}] {s['title']} / {', '.join(s['authors'])} ({s['year']})"
            for s in sources_data
        ])
        sources_instruction = f"""РЕАЛЬНЫЕ ИСТОЧНИКИ (используй ссылки [1]-[{len(sources_data)}]):
{sources_for_prompt}
Используй ссылки ЭКОНОМНО — максимум 1-2 на весь подраздел."""
    else:
        sources_instruction = "Используй ссылки [1], [2] в тексте экономно."

    # Шаг 1: Структура
    print("Шаг 1: Генерирую структуру...")
    data1     = ask_json(get_structure_prompt(topic, work_type, rules))
    structure = data1["structure"]

    SKIP_KEYS    = {"Введение", "Заключение", "Список литературы", "Приложения"}
    section_names = [s for s in structure if s not in SKIP_KEYS]

    # Подглавы — только секции вида "X.Y. Название"
    sub_sections = [
        s for s in section_names
        if "." in s and len(s.split(".")) >= 3 and s.split(".")[1].strip()[:1].isdigit()
    ]
    sub_words = max(200, body_words // max(len(sub_sections), 1))

    content = {}

    # Шаг 2: Введение
    print("Шаг 2: Пишу введение...")
    content["Введение"] = ask_text(
        get_intro_prompt(topic, work_type, intro_words, sources_instruction)
    )

    # Шаг 3: Разделы
    for i, section in enumerate(section_names):
        print(f"Шаг {i+3}: Пишу «{section}»...")

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
                               words, work_type, sources_instruction)
        )
        time.sleep(0.5)

    # Шаг 4: Заключение
    print("Пишу заключение...")
    content["Заключение"] = ask_text(
        get_conclusion_prompt(topic, work_type, conclusion_words)
    )

    # Источники
    if real_sources:
        sources = real_sources
    else:
        sources = [
            f"{i}. Автор И.О. Название работы. — М.: Издательство, 2023."
            for i in range(1, sources_min + 1)
        ]

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
