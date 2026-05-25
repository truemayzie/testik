"""
presentation_generator.py — генерация JSON-структуры слайдов и текста выступления.
generate_presentation: по умолчанию сборка из result без Claude; режим claude — через API.
generate_speech: генерирует DOCX текста выступления (без изменений).
"""

import os
import re
import json
from datetime import datetime

from docx import Document
from docx.shared import Pt as DocPt, Cm as DocCm
from docx.enum.text import WD_ALIGN_PARAGRAPH

from generator import ask as _ask


# ── Промпт для Claude API ─────────────────────────────────────────────────────

def _build_slides_prompt(topic: str, work_type: str, full_text: str,
                          profile: dict) -> str:
    is_long  = work_type in ("Курсовая", "ВКР")
    is_short = work_type in ("Эссе", "Сочинение")

    university = profile.get("university", "")
    faculty    = profile.get("faculty", "")
    department = profile.get("department") or profile.get("speciality", "")
    full_name  = profile.get("fullName") or profile.get("full_name", "")
    group      = profile.get("groupNumber") or profile.get("group", "")
    teacher    = profile.get("teacherName") or profile.get("teacher", "")
    city       = profile.get("city", "Москва")
    year       = str(datetime.now().year)

    if is_short:
        slide_plan = "TITLE + 2 CONTENT + FINAL (4 слайда)"
        n_content  = 2
        total      = 4
        accent     = "bordeaux" if work_type == "Эссе" else "bordeaux"
    elif is_long:
        slide_plan = "TITLE + TOC + 7 CONTENT + CONCLUSION + FINAL (11 слайдов)"
        n_content  = 7
        total      = 11
        accent     = "green"
    else:
        slide_plan = "TITLE + TOC + 4 CONTENT + CONCLUSION + FINAL (8 слайдов)"
        n_content  = 4
        total      = 8
        accent     = "blue"

    toc_example = "" if is_short else f"""    {{
      "type": "TOC",
      "heading": "Содержание",
      "slide_num": 2,
      "total": {total},
      "items": ["Введение", "...названия разделов из текста...", "Заключение"]
    }},"""

    conclusion_example = "" if is_short else f"""    {{
      "type": "CONCLUSION",
      "heading": "Выводы",
      "slide_num": {total - 1},
      "total": {total},
      "items": [
        {{"title": "Вывод 1", "text": "Пояснение из текста"}},
        {{"title": "Вывод 2", "text": "Пояснение из текста"}},
        {{"title": "Вывод 3", "text": "Пояснение из текста"}},
        {{"title": "Вывод 4", "text": "Пояснение из текста"}}
      ]
    }},"""

    return f"""Создай JSON-структуру презентации. Строго: {slide_plan}.
Тема: {topic}
Тип работы: {work_type}

Фрагмент текста работы:
{full_text}

Верни ТОЛЬКО валидный JSON без ```json и без пояснений.

{{
  "accent": "{accent}",
  "slides": [
    {{
      "type": "TITLE",
      "title": "{topic}",
      "work_type": "{work_type}",
      "university": "{university}",
      "faculty": "{faculty}",
      "department": "{department}",
      "full_name": "{full_name}",
      "group": "{group}",
      "teacher": "{teacher}",
      "city": "{city}",
      "year": "{year}"
    }},
{toc_example}
    {{
      "type": "CONTENT",
      "heading": "Название раздела из текста",
      "slide_num": 3,
      "total": {total},
      "topic": "{topic}",
      "has_image": false,
      "bullets": [
        {{"bold": "Ключевое слово", "text": "— пояснение 1-2 предложения с фактами"}},
        {{"bold": "Ключевое слово", "text": "— пояснение 1-2 предложения с фактами"}},
        {{"bold": "Ключевое слово", "text": "— пояснение 1-2 предложения с фактами"}}
      ],
      "stats": [
        {{"num": "70%",  "desc": "описание из текста"}},
        {{"num": "1939", "desc": "описание из текста"}}
      ]
    }},
    <ещё {n_content - 1} слайдов CONTENT — у 1 из них has_image: true, stats: []>
{conclusion_example}
    {{
      "type": "FINAL",
      "title": "{topic}",
      "full_name": "{full_name}"
    }}
  ]
}}

Правила:
— Ровно {total} слайдов итого
— bullets: ОБЯЗАТЕЛЬНО массив объектов {{bold, text}}, НЕ строки
— CONCLUSION items: массив объектов {{title, text}}, НЕ строки
— CONTENT с has_image: true → stats: []
— slide_num: порядковый номер (1..{total}), total: {total}
— topic во всех CONTENT: "{topic}"
— Только реальные факты, цифры, имена из фрагмента текста
"""


# ── Основная генерация ────────────────────────────────────────────────────────

def generate_presentation(job_id: str, topic: str, work_type: str,
                           profile: dict, result: dict) -> tuple:
    """
    Генерирует JSON-структуры слайдов.
    PRESENTATION_SLIDES_MODE=deterministic (по умолчанию) | claude
    Возвращает (slides_dict, slide_titles).
    """
    mode = (os.getenv("PRESENTATION_SLIDES_MODE") or "deterministic").strip().lower()
    if mode != "claude":
        from slides_from_result import build_slides_from_result, slide_titles_from_slides

        slides_dict = build_slides_from_result(
            topic, work_type, result, profile or {},
        )
        titles = slide_titles_from_slides(slides_dict)
        print(f"[extras] Слайды (deterministic): {len(slides_dict.get('slides', []))} шт., job={job_id}")
        return slides_dict, titles

    structure = result.get("structure", [])
    max_sections   = 12 if work_type in ("Курсовая", "ВКР") else 7
    chars_per_sect = 600 if work_type in ("Курсовая", "ВКР") else 400

    text_parts = []
    for section in structure[:max_sections]:
        content = result.get("content", {}).get(section, "")
        content = re.sub(r'\[TABLE\].*?\[/TABLE\]', '', content, flags=re.DOTALL)
        text_parts.append(f"## {section}\n{content[:chars_per_sect]}")
    full_text = "\n\n".join(text_parts)

    # Запрос к Claude API
    prompt = _build_slides_prompt(topic, work_type, full_text, profile or {})
    max_tokens = 4000 if work_type in ("Курсовая", "ВКР") else 2500
    raw = _ask(prompt, max_tokens=max_tokens)

    match = re.search(r'\{[\s\S]*\}', raw)
    if not match:
        raise ValueError("Claude не вернул JSON для структуры слайдов")
    slides_dict = json.loads(match.group())

    slides = slides_dict.get("slides", [])
    if not slides:
        raise ValueError("Список слайдов пустой")

    # Нормализация: приводим к ожидаемому формату
    total = len(slides)
    for sl in slides:
        sl.setdefault("total", total)
        stype = sl.get("type", "")
        if stype == "CONTENT":
            sl["bullets"] = [
                {"bold": b, "text": ""} if isinstance(b, str) else b
                for b in sl.get("bullets", [])
            ]
            sl.setdefault("stats", [])
            sl.setdefault("has_image", False)
            sl.setdefault("topic", topic)
        elif stype == "CONCLUSION":
            sl["items"] = [
                {"title": it, "text": ""} if isinstance(it, str) else it
                for it in sl.get("items", [])
            ]
        elif stype == "TOC":
            sl["items"] = [str(it) for it in sl.get("items", [])]

    slide_titles = [
        sl.get("heading") or sl.get("title", "")
        for sl in slides
        if sl.get("type") not in ("FINAL",)
        and (sl.get("heading") or sl.get("title"))
    ]

    print(f"[extras] Слайды сгенерированы: {len(slides)} шт., job={job_id}")
    return slides_dict, slide_titles


# ── Текст выступления ─────────────────────────────────────────────────────────

def generate_speech(job_id: str, topic: str, work_type: str, result: dict,
                    slide_titles=None) -> str:
    """Генерирует текст выступления и сохраняет в /tmp/speech_{job_id}.docx."""

    _is_long = work_type in ("Курсовая", "ВКР")
    _max_sections   = 12 if _is_long else 8
    _chars_per_sect = 600 if _is_long else 400

    text_parts = []
    for section in result.get("structure", []):
        content = result.get("content", {}).get(section, "")
        content = re.sub(r'\[TABLE\].*?\[/TABLE\]', '', content, flags=re.DOTALL)
        text_parts.append(f"## {section}\n{content[:_chars_per_sect]}")
    full_text = "\n\n".join(text_parts[:_max_sections])

    n_slides = len(slide_titles) if slide_titles else 0
    speech_max_tokens = 6000 if _is_long else (4000 if n_slides >= 8 else 2500)

    if slide_titles and len(slide_titles) >= 2:
        slides_block = "\n".join(
            f"  Слайд {i+1}: {t}" for i, t in enumerate(slide_titles)
        )
        prompt = f"""Напиши текст выступления для защиты {work_type.lower()}.
Тема: «{topic}»

Структура презентации ({len(slide_titles)} слайдов):
{slides_block}

ОБЯЗАТЕЛЬНЫЕ требования:
— Напиши текст для КАЖДОГО из {len(slide_titles)} слайдов без исключения — не обрывай на середине
— Каждый блок начинается строго с «Слайд N.» (N — номер от 1 до {len(slide_titles)})
— Каждый блок: 3-4 конкретных предложения, опираясь на содержание этого слайда
— Переходы конкретные: называй заголовок следующего слайда
— Используй конкретные факты, цифры и имена из текста работы
— Академический стиль, уверенный тон
— Только текст, никакой разметки кроме «Слайд N.»

Фрагмент работы:
{full_text}"""
    else:
        prompt = f"""Напиши текст выступления для защиты {work_type.lower()} на 3-5 минут (450-600 слов).
Тема: «{topic}»
Строго следуй структуре работы. Используй конкретные факты и цифры.
Академический стиль, уверенный тон. Только текст без заголовков и разметки.

Фрагмент работы:
{full_text}"""

    speech_text = _ask(prompt, max_tokens=speech_max_tokens)

    doc = Document()
    sec = doc.sections[0]
    sec.left_margin   = DocCm(3)
    sec.right_margin  = DocCm(1.5)
    sec.top_margin    = DocCm(2)
    sec.bottom_margin = DocCm(2)

    heading = doc.add_heading("Текст выступления", level=1)
    heading.alignment = WD_ALIGN_PARAGRAPH.CENTER

    sub = doc.add_paragraph(f"Тема: {topic}")
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    doc.add_paragraph()

    for line in speech_text.split("\n"):
        line = line.strip()
        if not line:
            continue
        p = doc.add_paragraph()
        p.paragraph_format.first_line_indent = DocCm(1.25)
        p.paragraph_format.space_after = DocPt(0)
        run = p.add_run(line)
        run.font.name = "Times New Roman"
        run.font.size = DocPt(14)

    output = f"/tmp/speech_{job_id}.docx"
    doc.save(output)
    print(f"[extras] Текст выступления сохранён: {output}")
    return output
