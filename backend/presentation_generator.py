"""
presentation_generator.py — генерация JSON-структуры слайдов и текста выступления.
generate_presentation: PRESENTATION_SLIDES_MODE=claude | deterministic
generate_speech: генерирует DOCX текста выступления.
"""

import os
import re
import json
from datetime import datetime

from docx import Document
from docx.shared import Pt as DocPt, Cm as DocCm
from docx.enum.text import WD_ALIGN_PARAGRAPH

from generator import ask as _ask


def _build_slides_prompt(
    topic: str,
    work_type: str,
    full_text: str,
    profile: dict,
    structure: list[str],
) -> str:
    from slides_from_result import (
        _n_content_slides,
        _presentation_sections_pool,
        _presentation_title,
    )

    is_long = work_type in ("Курсовая", "ВКР")
    is_short = work_type in ("Эссе", "Сочинение")

    university = profile.get("university", "")
    faculty = profile.get("faculty", "")
    department = profile.get("department") or profile.get("speciality", "")
    full_name = profile.get("fullName") or profile.get("full_name", "")
    group = profile.get("groupNumber") or profile.get("group", "")
    teacher = profile.get("teacherName") or profile.get("teacher", "")
    city = profile.get("city", "Москва")
    year = str(datetime.now().year)

    section_labels = [
        _presentation_title(s) for s in _presentation_sections_pool(structure)
    ]
    n_content = _n_content_slides(structure, work_type)
    if section_labels:
        n_content = min(n_content, len(section_labels))

    if is_short:
        slide_plan = f"TITLE + {n_content} CONTENT + FINAL ({2 + n_content} слайдов)"
        accent = "bordeaux"
        with_toc = False
        with_conclusion = False
    else:
        total = 2 + n_content + 2  # title + toc + content + conclusion + final
        slide_plan = (
            f"TITLE + TOC + {n_content} CONTENT + CONCLUSION + FINAL ({total} слайдов)"
        )
        accent = "green" if is_long else "blue"
        with_toc = True
        with_conclusion = True

    sections_hint = ""
    if section_labels:
        sections_hint = (
            "Разделы работы (каждый значимый — отдельный CONTENT, включая подглавы 1.1, 2.1):\n"
            + "\n".join(f"  • {label}" for label in section_labels[:n_content])
        )

    toc_example = ""
    if with_toc:
        toc_example = """    {{
      "type": "TOC",
      "heading": "Структура презентации",
      "items": ["...заголовки всех CONTENT слайдов по порядку...", "Выводы"]
    }},"""

    conclusion_example = ""
    if with_conclusion:
        conclusion_example = """    {{
      "type": "CONCLUSION",
      "heading": "Выводы",
      "items": [
        {{"title": "Вывод 1", "text": "кратко, до 100 символов"}},
        {{"title": "Вывод 2", "text": "кратко, до 100 символов"}},
        {{"title": "Вывод 3", "text": "кратко, до 100 символов"}}
      ]
    }},"""

    return f"""Создай JSON-структуру презентации. Строго: {slide_plan}.
Тема: {topic}
Тип работы: {work_type}

{sections_hint}

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
      "heading": "Название раздела",
      "topic": "{topic}",
      "has_image": false,
      "bullets": [
        {{"bold": "Ключ", "text": "— короткое пояснение до 100 символов"}},
        {{"bold": "Ключ", "text": "— короткое пояснение"}},
        {{"bold": "Ключ", "text": "— короткое пояснение"}}
      ],
      "stats": []
    }},
    <ещё CONTENT — по одному на каждый раздел из списка выше, всего {n_content} шт.>
{conclusion_example}
    {{
      "type": "FINAL"
    }}
  ]
}}

Правила:
— Ровно {n_content} слайдов CONTENT — по одному на раздел из списка, в том же порядке
— bullets: массив {{bold, text}}, НЕ более 3 буллетов на слайд, суммарно до 120 символов на буллет
— CONCLUSION: не более 3 пунктов, короткий text
— CONTENT с has_image: true → stats: [] (не более одного такого слайда)
— topic во всех CONTENT: "{topic}"
— Заголовки БЕЗ нумерации («1.», «1.1.»)
— TOC.items = заголовки всех CONTENT по порядку + «Выводы» (точное совпадение с CONTENT.heading)
— TITLE: work_type строго «{work_type}» (подзаголовок на титуле, обычный регистр)
— FINAL: только {{"type": "FINAL"}}
— Только факты из фрагмента текста
"""


def _normalize_claude_slides(slides_dict: dict, topic: str, work_type: str) -> dict:
    from slides_from_result import (
        _presentation_title,
        sync_toc_from_slides,
        trim_slides_for_template,
    )

    slides = slides_dict.get("slides", [])
    for sl in slides:
        stype = (sl.get("type") or "").upper()
        if stype == "TITLE":
            sl["title"] = topic
            sl["work_type"] = work_type
        if sl.get("heading"):
            sl["heading"] = _presentation_title(sl["heading"])
        elif stype == "CONCLUSION":
            sl["heading"] = "Выводы"
        elif stype == "FINAL":
            sl.clear()
            sl["type"] = "FINAL"

    sync_toc_from_slides(slides)
    trim_slides_for_template(slides)

    total = len(slides)
    for n, sl in enumerate(slides, start=1):
        sl["slide_num"] = n
        sl["total"] = total
    slides_dict["slides"] = slides
    return slides_dict


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
    max_sections = 12 if work_type in ("Курсовая", "ВКР") else 10
    chars_per_sect = 600 if work_type in ("Курсовая", "ВКР") else 450

    text_parts = []
    for section in structure[:max_sections]:
        content = result.get("content", {}).get(section, "")
        content = re.sub(r'\[TABLE\].*?\[/TABLE\]', '', content, flags=re.DOTALL)
        text_parts.append(f"## {section}\n{content[:chars_per_sect]}")
    full_text = "\n\n".join(text_parts)

    try:
        prompt = _build_slides_prompt(
            topic, work_type, full_text, profile or {}, structure,
        )
        max_tokens = 4500 if work_type in ("Курсовая", "ВКР") else 3500
        raw = _ask(prompt, max_tokens=max_tokens)

        match = re.search(r'\{[\s\S]*\}', raw)
        if not match:
            raise ValueError("Claude не вернул JSON для структуры слайдов")
        slides_dict = json.loads(match.group())

        slides = slides_dict.get("slides", [])
        if not slides:
            raise ValueError("Список слайдов пустой")

        for sl in slides:
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

        slides_dict = _normalize_claude_slides(slides_dict, topic, work_type)
        slides_dict["provider"] = "claude"
        from slides_from_result import slide_titles_from_slides

        titles = slide_titles_from_slides(slides_dict)
        print(f"[extras] Слайды (claude): {len(slides_dict.get('slides', []))} шт., job={job_id}")
        return slides_dict, titles
    except Exception as exc:
        print(f"[extras] Claude slides failed, fallback deterministic: {exc}")
        from slides_from_result import build_slides_from_result, slide_titles_from_slides

        slides_dict = build_slides_from_result(topic, work_type, result, profile or {})
        titles = slide_titles_from_slides(slides_dict)
        return slides_dict, titles


def _clean_speech_line(line: str) -> str:
    line = re.sub(r'^#+\s*', '', line.strip())
    line = re.sub(r'\*\*(.+?)\*\*', r'\1', line)
    line = re.sub(r'^\*\s+', '', line)
    return line.strip()


# ── Текст выступления ─────────────────────────────────────────────────────────

def generate_speech(job_id: str, topic: str, work_type: str, result: dict,
                    slide_titles=None) -> str:
    """Генерирует текст выступления и сохраняет в /tmp/speech_{job_id}.docx."""

    _is_long = work_type in ("Курсовая", "ВКР")
    _max_sections = 12 if _is_long else 8
    _chars_per_sect = 600 if _is_long else 400

    text_parts = []
    for section in result.get("structure", []):
        content = result.get("content", {}).get(section, "")
        content = re.sub(r'\[TABLE\].*?\[/TABLE\]', '', content, flags=re.DOTALL)
        text_parts.append(f"## {section}\n{content[:_chars_per_sect]}")
    full_text = "\n\n".join(text_parts[:_max_sections])

    n_slides = len(slide_titles) if slide_titles else 0
    speech_max_tokens = 6000 if _is_long else (4500 if n_slides >= 8 else 3000)

    if slide_titles and len(slide_titles) >= 2:
        slides_block = "\n".join(
            f"  Слайд {i+1}: {t}" for i, t in enumerate(slide_titles)
        )
        prompt = f"""Напиши текст выступления для защиты {work_type.lower()}.
Тема: «{topic}»

Структура презентации ({len(slide_titles)} слайдов):
{slides_block}

ОБЯЗАТЕЛЬНЫЕ требования:
— Напиши текст для КАЖДОГО из {len(slide_titles)} слайдов без исключения
— Каждый блок начинается строго с «Слайд N.» (N — номер от 1 до {len(slide_titles)})
— Каждый блок: 3-4 предложения по содержанию этого слайда (не дублируй заголовок дословно)
— На слайде «Структура презентации» перечисли пункты оглавления из следующих слайдов
— Переходы: называй заголовок следующего слайда
— Конкретные факты и цифры из текста работы
— Академический стиль, без markdown (#, **, списков)
— Только текст, разметка только «Слайд N.»

Фрагмент работы:
{full_text}"""
    else:
        prompt = f"""Напиши текст выступления для защиты {work_type.lower()} на 3-5 минут (450-600 слов).
Тема: «{topic}»
Строго следуй структуре работы. Используй конкретные факты и цифры.
Академический стиль, уверенный тон. Без markdown. Только текст.

Фрагмент работы:
{full_text}"""

    speech_text = _ask(prompt, max_tokens=speech_max_tokens)

    doc = Document()
    sec = doc.sections[0]
    sec.left_margin = DocCm(3)
    sec.right_margin = DocCm(1.5)
    sec.top_margin = DocCm(2)
    sec.bottom_margin = DocCm(2)

    heading = doc.add_heading("Текст выступления", level=1)
    heading.alignment = WD_ALIGN_PARAGRAPH.CENTER

    sub = doc.add_paragraph(f"Тема: {topic}")
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    doc.add_paragraph()

    for line in speech_text.split("\n"):
        line = _clean_speech_line(line)
        if not line:
            continue
        p = doc.add_paragraph()
        p.paragraph_format.first_line_indent = DocCm(1.25)
        p.paragraph_format.space_after = DocPt(0)
        run = p.add_run(line)
        run.font.name = "Times New Roman"
        run.font.size = DocPt(14)

    import jobstore
    output = jobstore.extras_file_path(f"speech_{job_id}.docx")
    doc.save(output)
    print(f"[extras] Текст выступления сохранён: {output}")
    return output
