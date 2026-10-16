"""
rules.py — правила структуры, объёмов и служебных страниц для каждого типа учебной работы.
"""

from __future__ import annotations

# Служебные страницы (титульник, содержание, литература, приложения)
SERVICE_PAGES: dict[str, int] = {
    "Реферат":   3,   # титульник + содержание + список литературы
    "Доклад":    3,   # титульник + содержание + список литературы
    "Курсовая":  4,   # титульник + содержание (1-2) + список литературы (2)
    "ВКР":       8,   # титульник + содержание (2) + список литературы (3) + приложения (2)
    "Эссе":      0,
    "Сочинение": 0,
    "Тест":      0,
}

PREVIEW_WORK_TYPES = frozenset(
    {"Сочинение", "Эссе", "Доклад", "Реферат", "Курсовая", "ВКР", "Тест"}
)

WORK_RULES: dict[str, dict] = {
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
