"""
Сборка JSON слайдов из уже готового result работы — без второго вызова Claude.
Формат совместим с PresentationViewer и render_slides.js.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any


def _accent_for_work_type(work_type: str) -> str:
    if work_type in ("Курсовая", "ВКР"):
        return "green"
    if work_type in ("Эссе", "Сочинение"):
        return "bordeaux"
    return "blue"


def _strip_tables(text: str) -> str:
    return re.sub(r"\[TABLE\].*?\[/TABLE\]", "", text or "", flags=re.DOTALL).strip()


def _sentences(text: str, limit: int = 6) -> list[str]:
    text = re.sub(r"\s+", " ", _strip_tables(text))
    if not text:
        return []
    parts = re.split(r"(?<=[.!?…])\s+", text)
    out = []
    for p in parts:
        p = p.strip()
        if len(p) < 12:
            continue
        out.append(p)
        if len(out) >= limit:
            break
    return out


def _paragraphs(text: str, limit: int = 5) -> list[str]:
    chunks = [c.strip() for c in re.split(r"\n\s*\n", _strip_tables(text)) if c.strip()]
    if not chunks and text.strip():
        chunks = _sentences(text, limit)
    return chunks[:limit]


def _bullet_from_paragraph(para: str, max_text: int = 220) -> dict[str, str]:
    para = re.sub(r"\s+", " ", para).strip()
    if len(para) <= 50:
        return {"bold": para[:40], "text": ""}
    m = re.match(r"^(.{15,60}?)([.:,;—–-]\s+)(.+)$", para)
    if m:
        bold, rest = m.group(1).strip(), m.group(3).strip()
    else:
        words = para.split()
        bold = " ".join(words[:5])
        rest = " ".join(words[5:])
    if len(rest) > max_text:
        rest = rest[: max_text - 1] + "…"
    return {"bold": bold, "text": f"— {rest}" if rest else ""}


def _extract_stats(text: str, max_items: int = 2) -> list[dict[str, str]]:
    stats: list[dict[str, str]] = []
    for m in re.finditer(r"(\d{1,3}(?:[.,]\d+)?\s*%)", text):
        stats.append({"num": m.group(1).replace(" ", ""), "desc": "по данным работы"})
        if len(stats) >= max_items:
            return stats
    for m in re.finditer(r"\b(19\d{2}|20\d{2})\b", text):
        stats.append({"num": m.group(1), "desc": "ключевая дата"})
        if len(stats) >= max_items:
            return stats
    return stats


_SKIP_SECTION = re.compile(
    r"^(введение|заключение|список\s+литературы|литература|"
    r"кіріспе|қорытынды|introduction|conclusion|sources?)$",
    re.I,
)


def build_slides_from_result(
    topic: str,
    work_type: str,
    result: dict,
    profile: dict | None = None,
) -> dict[str, Any]:
    profile = profile or {}
    is_long = work_type in ("Курсовая", "ВКР")
    is_short = work_type in ("Эссе", "Сочинение")

    if is_short:
        n_content = 2
        with_toc = False
        with_conclusion = False
    elif is_long:
        n_content = 7
        with_toc = True
        with_conclusion = True
    else:
        n_content = 4
        with_toc = True
        with_conclusion = True

    structure = list(result.get("structure") or [])
    content_map = result.get("content") or {}
    body_sections = [
        s for s in structure
        if s and not _SKIP_SECTION.match(str(s).strip())
    ]
    if not body_sections:
        body_sections = [s for s in structure if s][:n_content]

    if len(body_sections) > n_content:
        step = max(1, len(body_sections) // n_content)
        picked = []
        for i in range(0, len(body_sections), step):
            picked.append(body_sections[i])
            if len(picked) >= n_content:
                break
        body_sections = picked[:n_content]
    else:
        body_sections = body_sections[:n_content]

    while len(body_sections) < n_content and structure:
        for s in structure:
            if s not in body_sections:
                body_sections.append(s)
            if len(body_sections) >= n_content:
                break
        if len(body_sections) < n_content:
            break

    slides: list[dict[str, Any]] = []
    year = str(datetime.now().year)

    slides.append({
        "type": "TITLE",
        "title": topic,
        "work_type": work_type,
        "university": profile.get("university", ""),
        "faculty": profile.get("faculty", ""),
        "department": profile.get("department") or profile.get("speciality", ""),
        "full_name": profile.get("fullName") or profile.get("full_name", ""),
        "group": profile.get("groupNumber") or profile.get("group", ""),
        "teacher": profile.get("teacherName") or profile.get("teacher", ""),
        "city": profile.get("city", "Москва"),
        "year": year,
    })

    if with_toc:
        toc_items = [str(s) for s in structure[:12]] or body_sections
        slides.append({
            "type": "TOC",
            "heading": "Содержание",
            "items": toc_items,
        })

    image_idx = max(0, len(body_sections) // 2)
    for i, section in enumerate(body_sections):
        raw = _strip_tables(content_map.get(section, "") or "")
        if not raw:
            raw = _strip_tables(content_map.get(section, "") or "")
        paras = _paragraphs(raw, 4)
        bullets = [_bullet_from_paragraph(p) for p in paras[:3]]
        if not bullets:
            bullets = [{"bold": section[:40], "text": "— ключевые положения раздела"}]

        stats = _extract_stats(raw) if i != image_idx else []
        slides.append({
            "type": "CONTENT",
            "heading": section,
            "topic": topic,
            "has_image": i == image_idx,
            "bullets": bullets,
            "stats": stats,
        })

    if with_conclusion:
        conc_raw = _strip_tables(result.get("conclusion") or "")
        if not conc_raw:
            for s in structure:
                if re.search(r"заключ", str(s), re.I):
                    conc_raw = _strip_tables(content_map.get(s, "") or "")
                    break
        items = []
        for sent in _sentences(conc_raw, 4):
            words = sent.split()
            title = " ".join(words[:6])
            if len(title) > 48:
                title = title[:45] + "…"
            items.append({"title": title, "text": sent[:200]})
        if not items:
            items = [
                {"title": "Вывод 1", "text": "Основные результаты исследования"},
                {"title": "Вывод 2", "text": "Практическая значимость работы"},
            ]
        slides.append({
            "type": "CONCLUSION",
            "heading": "Выводы",
            "items": items[:4],
        })

    slides.append({
        "type": "FINAL",
        "title": topic,
        "full_name": profile.get("fullName") or profile.get("full_name", ""),
    })

    total = len(slides)
    for n, sl in enumerate(slides, start=1):
        sl["slide_num"] = n
        sl["total"] = total

    accent = _accent_for_work_type(work_type)
    return {"accent": accent, "slides": slides, "provider": "deterministic"}


def slide_titles_from_slides(slides_dict: dict) -> list[str]:
    return [
        sl.get("heading") or sl.get("title", "")
        for sl in slides_dict.get("slides", [])
        if sl.get("type") not in ("FINAL",)
        and (sl.get("heading") or sl.get("title"))
    ]
