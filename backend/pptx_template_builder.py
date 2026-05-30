"""
Сборка PPTX из JSON слайдов (slides_from_result) через готовый .pptx-шаблон темы.
Шаблон: backend/tamplates/ion.pptx — макеты «Титульный», «Заголовок и объект», «Только заголовок».
"""

from __future__ import annotations

import io
import os
from typing import Any

from pptx import Presentation
from pptx.util import Pt

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_TEMPLATE = os.path.join(BACKEND_DIR, "tamplates", "ion.pptx")

LAYOUT_TITLE = 0
LAYOUT_CONTENT = 1
LAYOUT_FINAL = 12  # «Карточка имени» — текст в теле слайда, не в шапке


def template_path(name: str = "ion") -> str:
    custom = os.getenv("PRESENTATION_TEMPLATE_PATH", "").strip()
    if custom and os.path.isfile(custom):
        return custom
    path = os.path.join(BACKEND_DIR, "tamplates", f"{name}.pptx")
    if os.path.isfile(path):
        return path
    alt = os.path.join(BACKEND_DIR, "templates", "pptx", f"{name}.pptx")
    return alt if os.path.isfile(alt) else path


def template_available(name: str = "ion") -> bool:
    return os.path.isfile(template_path(name))


def _clear_slides(prs: Presentation) -> None:
    while len(prs.slides) > 0:
        idx = len(prs.slides) - 1
        r_id = prs.slides._sldIdLst[idx].rId  # noqa: SLF001
        prs.part.drop_rel(r_id)
        del prs.slides._sldIdLst[idx]


def _set_bullets(text_frame, lines: list[str]) -> None:
    cleaned = [ln.strip() for ln in lines if ln and ln.strip()]
    if not cleaned:
        text_frame.text = "—"
        return
    text_frame.text = cleaned[0]
    for para in text_frame.paragraphs:
        para.level = 0
    for line in cleaned[1:]:
        p = text_frame.add_paragraph()
        p.text = line
        p.level = 0
        p.space_after = Pt(6)


def _subtitle_lines(sl: dict[str, Any]) -> str:
    wt = (sl.get("work_type") or "").strip()
    return wt or "Учебная работа"


def _bullet_lines(sl: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for b in sl.get("bullets") or []:
        if isinstance(b, dict):
            bold = (b.get("bold") or "").strip()
            rest = (b.get("text") or "").strip()
            line = f"{bold} {rest}".strip() if rest else bold
            if line:
                out.append(line)
        elif b:
            out.append(str(b).strip())
    for st in sl.get("stats") or []:
        if isinstance(st, dict):
            num = (st.get("num") or "").strip()
            desc = (st.get("desc") or "").strip()
            if num:
                out.append(f"{num} — {desc}".strip(" —"))
    return out


def _conclusion_lines(sl: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for it in sl.get("items") or []:
        if isinstance(it, dict):
            title = (it.get("title") or "").strip()
            text = (it.get("text") or "").strip()
            if title and text:
                out.append(f"{title}: {text}")
            elif title:
                out.append(title)
            elif text:
                out.append(text)
        elif it:
            out.append(str(it).strip())
    return out


def _add_title_slide(prs: Presentation, sl: dict[str, Any]) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[LAYOUT_TITLE])
    slide.placeholders[0].text = (sl.get("title") or "Тема работы")[:200]
    if len(slide.placeholders) > 1:
        slide.placeholders[1].text = _subtitle_lines(sl)[:500]


def _add_content_slide(prs: Presentation, sl: dict[str, Any], heading_default: str) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[LAYOUT_CONTENT])
    slide.placeholders[0].text = (sl.get("heading") or heading_default)[:200]
    lines: list[str] = []
    stype = (sl.get("type") or "").upper()
    if stype == "TOC":
        lines = [str(x).strip() for x in (sl.get("items") or []) if str(x).strip()]
    elif stype == "CONCLUSION":
        lines = _conclusion_lines(sl)
    else:
        lines = _bullet_lines(sl)
    if len(slide.placeholders) > 1:
        _set_bullets(slide.placeholders[1].text_frame, lines)


def _add_final_slide(prs: Presentation, sl: dict[str, Any]) -> None:
    from pptx.enum.text import PP_ALIGN

    slide = prs.slides.add_slide(prs.slide_layouts[LAYOUT_FINAL])
    slide.placeholders[0].text = ""
    body = slide.placeholders[1].text_frame
    body.text = "Спасибо за внимание!"
    p = body.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    for run in p.runs:
        run.font.size = Pt(28)
        run.font.bold = True


def build_pptx_bytes(slides_payload: dict[str, Any], template: str | None = None) -> io.BytesIO:
    """slides_payload — объект с ключом slides (как build_slides_from_result)."""
    path = template or template_path()
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Шаблон PPTX не найден: {path}")

    prs = Presentation(path)
    _clear_slides(prs)

    for sl in slides_payload.get("slides") or []:
        stype = (sl.get("type") or "").upper()
        if stype == "TITLE":
            _add_title_slide(prs, sl)
        elif stype in ("TOC", "CONTENT", "CONCLUSION", "RELEVANCE", "OVERVIEW", "STATS", "SOURCES"):
            _add_content_slide(prs, sl, heading_default=stype)
        elif stype == "FINAL":
            _add_final_slide(prs, sl)
        else:
            _add_content_slide(prs, sl, heading_default=str(sl.get("heading") or "Раздел"))

    out = io.BytesIO()
    prs.save(out)
    out.seek(0)
    return out


def build_pptx_file(slides_payload: dict[str, Any], output_path: str, template: str | None = None) -> str:
    data = build_pptx_bytes(slides_payload, template=template)
    with open(output_path, "wb") as f:
        f.write(data.getvalue())
    return output_path
