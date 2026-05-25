"""
Разовая генерация ВКР по фиксированному плану (не меняет общие промпты для всех пользователей).
Запуск из корня backend:
  python oneoff_vkr_didactic_time.py --email irotow@yandex.ru
"""
from __future__ import annotations

import argparse
import json
import sys
import time

# Локальные импорты из generator
from generator import (
    WORK_RULES,
    SERVICE_PAGES,
    _canonical_service_key,
    _check_volume,
    _lang_labels,
    ask_text,
    clean_text,
    detect_language_from_topic,
    generate_sources,
    get_conclusion_prompt,
)

TOPIC = (
    "Дидактические игры как средство формирования знаний о времени "
    "у детей старшего дошкольного возраста"
)
WORK_TYPE = "ВКР"
PAGES = 55

# Фиксированная структура по согласованному плану
STRUCTURE = [
    "Введение",
    "Глава 1. Теоретические основы формирования знаний о времени у детей старшего дошкольного возраста",
    "1.1. Понятие и структура знаний о времени у детей старшего дошкольного возраста",
    "1.2. Подходы к формированию временных представлений в дошкольном образовании",
    "1.3. Дидактическая игра как средство обучения дошкольников",
    "Глава 2. Методические основы исследования формирования знаний о времени",
    "2.1. Анализ опыта формирования знаний о времени в дошкольной педагогике",
    "2.2. Обзор дидактических игр и упражнений по теме «время»",
    "2.3. Методика диагностики и организации опытной работы",
    "Глава 3. Педагогическая практика в дошкольном образовательном учреждении",
    "3.1. Анализ образовательной среды и исходного уровня детей группы",
    "3.2. Реализация комплекса дидактических игр в группе",
    "3.3. Анализ результатов и выводы по практике",
    "Заключение",
    "Список литературы",
    "Приложения",
]

SECTION_CONTEXT: dict[str, str] = {
    "1.1": "ТЕОРИЯ: понятие времени для дошкольника; суточный цикл; раньше-позже; дни недели; вчера-сегодня-завтра; времена года; месяцы; элементарные часы; возрастные особенности старшего дошкольного возраста (5-7 лет).",
    "1.2": "ТЕОРИЯ: ФГОС ДО, познавательное развитие, принципы наглядности, систематичности, игровой деятельности, режим дня, роль воспитателя, уголок времени, календарь погоды.",
    "1.3": "ТЕОРИЯ: понятие дидактической игры, отличие от других видов игры, функции, критерии отбора игр по теме «время», вывод о целесообразности игр.",
    "2.1": "АНАЛИТИКА: обзор подходов (Эльконин, Дьяченко, календарная экология, режим дня, игровые технологии) — кратко по авторам.",
    "2.2": "АНАЛИТИКА: обзор игр и упражнений; ОБЯЗАТЕЛЬНО таблица [TABLE] с колонками: название игры | цель | что формирует | возраст; пробелы в практике.",
    "2.3": "МЕТОДИКА: констатирующий, формирующий (4-6 недель, 2-3 игры в неделю), контрольный этапы; 5 показателей диагностики; кратко комплекс из 6-8 игр; гипотеза о росте уровня.",
    "3.1": "ПРАКТИКА-АНАЛИЗ: ДОУ (тип, режим, материалы), подготовительная группа 5-6 (6-7) лет, N=25 детей; наблюдение воспитателя; констатирующая диагностика; таблица % по уровням (высокий/средний/низкий) по 5 показателям; трудности детей.",
    "3.2": "ПРАКТИКА-ВНЕДРЕНИЕ: комплекс игр по блокам (режим дня, дни недели, времена года, раньше-позже, часы); 3-4 игры подробно: цель, материалы, ход, результат; игры: «Путешествие по дню», «Что делаем утром, днём, вечером», «Зайка опоздал», «Дни недели — друзья», «Календарь открытий», «Вчера, сегодня, завтра»; срок 5 недель.",
    "3.3": "ПРАКТИКА-ВЫВОДЫ: контрольная диагностика; таблица до/после; качественный анализ; гипотеза подтверждена; рекомендации воспитателю.",
}


def _section_context(section: str) -> str:
    s = section.strip()
    for key, ctx in SECTION_CONTEXT.items():
        if s.startswith(key):
            return ctx
    if "Глава 1" in s:
        return "Вступление к главе 1: теоретические основы темы."
    if "Глава 2" in s:
        return "Вступление к главе 2: методика и аналитика."
    if "Глава 3" in s:
        return "Вступление к главе 3: педагогическая практика в ДОУ."
    return ""


def get_oneoff_intro_prompt(topic: str, words: int, sources_instruction: str) -> str:
    return f"""Напиши введение выпускной квалификационной работы (ВКР) на тему «{topic}».
Объём: строго {words} слов.

Обязательно включи:
- актуальность (время — сложная категория; дети путают вчера/завтра, слабо ориентируются в режиме дня и календаре);
- проблему (низкий уровень знаний о времени, слабое системное использование дидактических игр);
- объект: процесс формирования знаний о времени у детей старшего дошкольного возраста (5-7 лет, подготовительная группа);
- предмет: дидактические игры как средство формирования;
- цель: теоретически обосновать и экспериментально проверить эффективность дидактических игр;
- 6 задач нумерованным списком (теория времени; игры как средство; анализ практики; разработка и внедрение комплекса игр; оценка результатов; рекомендации);
- методы: анализ литературы, обобщение, наблюдение, беседа, педагогический эксперимент, сравнение до/после;
- база исследования: МБДОУ (укажи условное «ДОУ «Радуга»»), подготовительная группа «Солнышко», 25 детей 5-6 лет;
- гипотеза, новизна, теоретическая и практическая значимость, апробация, структура работы.

{sources_instruction}

Без markdown и без ссылок [1] во введении. Только связный текст."""


def get_oneoff_section_prompt(
    topic: str,
    section: str,
    parent: str,
    words: int,
    sources_instruction: str,
) -> str:
    parts = section.split(".")
    is_sub = len(parts) >= 3 and parts[1].strip()[:1].isdigit()
    ctx = _section_context(section)

    if "Глава" in section and not is_sub:
        return f"""Краткое вступление к «{section}» ВКР на тему «{topic}» ({ctx}).
Объём: 80-100 слов. Без markdown."""

    return f"""Напиши раздел «{section}» ВКР на тему «{topic}».
{f"Контекст: {ctx}" if ctx else ""}
{f"Родительский раздел: {parent}" if parent else ""}
Объём: строго {words} слов.

{sources_instruction}

Требования:
- научный стиль педагогики дошкольного образования;
- конкретика, примеры, при необходимости таблица в формате [TABLE]{{"title":"...","headers":[...],"rows":[...]}}[/TABLE];
- ссылки [1], [2] экономно в конце предложений;
- без markdown-заголовков;
- в конце подраздела — краткий вывод (2-3 предложения).

Верни только текст раздела."""


def get_oneoff_appendix_prompt(topic: str) -> str:
    return f"""Напиши раздел «Приложения» для ВКР на тему «{topic}».
Оформи как приложения А, Б, В, Г, Д (каждое с заголовком).

Обязательное содержание:
Приложение А — календарный план внедрения дидактических игр на 5 недель (таблица: неделя | игра | цель | форма).
Приложение Б — сценарии 6 дидактических игр (полные): «Путешествие по дню»; «Что делаем утром, днём, вечером»; «Зайка опоздал»; «Дни недели — друзья»; «Календарь открытий»; «Вчера, сегодня, завтра» (у каждой: цель, материалы, ход, ожидаемый результат).
Приложение В — диагностические задания по 5 показателям + ключ оценивания (высокий/средний/низкий).
Приложение Г — таблицы результатов констатирующей и контрольной диагностики (условные данные по 25 детям, % по уровням).
Приложение Д — характеристика ДОУ и группы (краткая справка).

Объём: 2500-3500 слов. Без markdown #. Можно таблицы [TABLE]...[/TABLE]."""


def generate_oneoff_vkr(topic: str, pages: int, profile: dict | None, progress_cb=None) -> dict:
    import generator as gen

    gen._session_cost = 0.0
    doc_lang = detect_language_from_topic(topic)
    labels = _lang_labels(doc_lang)

    rules = dict(WORK_RULES["ВКР"])
    rules["pages_min"] = 50
    rules["pages_max"] = 60

    pages = max(50, min(pages, 60))
    service_pages = SERVICE_PAGES.get(WORK_TYPE, 0)
    text_pages = max(pages - service_pages, 1)
    total_words = text_pages * rules["words_per_page"]
    intro_words = rules["intro_words"]
    conclusion_words = rules["conclusion_words"]
    body_words = total_words - intro_words - conclusion_words
    sources_min = rules.get("sources_min", 20)

    structure = list(STRUCTURE)

    if progress_cb:
        progress_cb(5, 100, "Подбираем источники")
    sources = generate_sources(topic, count=sources_min, doc_lang=doc_lang)
    if sources:
        sources_instruction = f"""ИСПОЛЬЗУЙ ИСТОЧНИКИ [1]-[{len(sources)}]:
{chr(10).join(sources[:8])}
...
Ссылки в конце предложений: [1], [2]. Экономно."""
    else:
        sources = [f"{i}. Автор И.О. Название. — М.: Издательство, 2023." for i in range(1, sources_min + 1)]
        sources_instruction = "Ссылки [1], [2] экономно."

    section_names = [
        s for s in structure
        if _canonical_service_key(s) not in {"intro", "conclusion", "sources", "appendix"}
    ]
    sub_sections = [
        s for s in section_names
        if "." in s and len(s.split(".")) >= 3 and s.split(".")[1].strip()[:1].isdigit()
    ]
    sub_words = max(350, body_words // max(len(sub_sections), 1))

    content: dict[str, str] = {}

    if progress_cb:
        progress_cb(15, 100, "Пишем введение")
    content[labels["intro"]] = ask_text(
        get_oneoff_intro_prompt(topic, intro_words, sources_instruction)
    )
    _check_volume(labels["intro"], content[labels["intro"]], intro_words)

    for i, section in enumerate(section_names):
        if progress_cb:
            progress_cb(15 + int(70 * (i + 1) / len(section_names)), 100, f"Раздел {i + 1}/{len(section_names)}")
        parts = section.split(".")
        is_sub = len(parts) >= 3 and parts[1].strip()[:1].isdigit()
        parent = ""
        if is_sub:
            ch_num = parts[0].strip()
            parent = next(
                (
                    s
                    for s in section_names
                    if s.split(".")[0].strip() == ch_num
                    and not (
                        len(s.split(".")) >= 3 and s.split(".")[1].strip()[:1].isdigit()
                    )
                ),
                "",
            )
        words = sub_words if is_sub else 90
        content[section] = ask_text(
            get_oneoff_section_prompt(topic, section, parent, words, sources_instruction)
        )
        _check_volume(section, content[section], words)
        time.sleep(0.5)

    if progress_cb:
        progress_cb(88, 100, "Пишем заключение")
    content[labels["conclusion"]] = ask_text(
        get_conclusion_prompt(topic, WORK_TYPE, conclusion_words, doc_lang)
    )

    if progress_cb:
        progress_cb(94, 100, "Пишем приложения")
    content["Приложения"] = ask_text(get_oneoff_appendix_prompt(topic))

    total_chars = sum(len(v) for v in content.values())
    estimated_pages = round(total_chars / 1800)

    return {
        "title": f"ВКР на тему: «{topic}»",
        "structure": structure,
        "content": content,
        "sources": sources,
        "meta": {
            "Тип работы": WORK_TYPE,
            "ГОСТ": "7.32-2017",
            "Объём": f"~{estimated_pages} страниц",
            "doc_lang": doc_lang,
        },
        "profile": profile or {},
        "_cost_usd": round(gen._session_cost, 4),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", default="irotow@yandex.ru")
    parser.add_argument("--pages", type=int, default=PAGES)
    args = parser.parse_args()

    # Сохранение в БД через frontend script — здесь только JSON для проверки
    print("Generating oneoff VKR...", file=sys.stderr)
    print(f"Topic: {TOPIC}", file=sys.stderr)
    print(f"Email: {args.email}", file=sys.stderr)

    profile: dict = {}
    result = generate_oneoff_vkr(TOPIC, args.pages, profile)
    out_path = "/tmp/oneoff_vkr_didactic_time.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(out_path)
    print(f"Estimated pages: {result['meta'].get('Объём')}", file=sys.stderr)
    print(f"Cost USD: {result.get('_cost_usd')}", file=sys.stderr)


if __name__ == "__main__":
    main()
