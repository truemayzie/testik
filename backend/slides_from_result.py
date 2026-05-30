"""
Сборка JSON слайдов из уже готового result работы — без второго вызова Claude.
Формат совместим с PresentationViewer и pptx_template_builder.
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
    r"кіріспе|қорытынды|introduction|conclusion|sources?|references?|bibliography)$",
    re.I,
)

_SUBSECTION = re.compile(r"^\d+\.\d+")

MAX_CONTENT_SLIDES_SHORT = 2
MAX_CONTENT_SLIDES_DEFAULT = 7
MAX_CONTENT_SLIDES_LONG = 9
MAX_BULLETS_PER_SLIDE = 3
MAX_BULLET_CHARS = 130
MAX_CONCLUSION_ITEMS = 3
MAX_CONCLUSION_TEXT = 120


def _presentation_title(raw: str) -> str:
    """Убирает нумерацию документа: «1.1. Текст» → «Текст»."""
    s = str(raw or "").strip()
    s = re.sub(r"^\d+(?:\.\d+)*\.?\s*", "", s)
    s = re.sub(r"^(?:глава|chapter|б(?:ө|о)лім)\s*\d+\.?\s*", "", s, flags=re.I)
    return s.strip() or str(raw).strip()


def _is_subsection(title: str) -> bool:
    return bool(_SUBSECTION.match(str(title).strip()))


def _presentation_sections_pool(structure: list[str]) -> list[str]:
    """Главы и подглавы (1.1, 2.2) — без введения и списка литературы."""
    return [
        s for s in structure
        if s and not _SKIP_SECTION.match(str(s).strip())
    ]


def _n_content_slides(structure: list[str], work_type: str) -> int:
    pool = _presentation_sections_pool(structure)
    if work_type in ("Эссе", "Сочинение"):
        return min(len(pool), MAX_CONTENT_SLIDES_SHORT) or MAX_CONTENT_SLIDES_SHORT
    if work_type in ("Курсовая", "ВКР"):
        cap = MAX_CONTENT_SLIDES_LONG
        return min(max(len(pool), 5), cap)
    cap = MAX_CONTENT_SLIDES_DEFAULT
    return min(max(len(pool), 4), cap)


def _presentation_body_sections(structure: list[str], n_content: int) -> list[str]:
    pool = _presentation_sections_pool(structure)
    return pool[:n_content]


def _truncate_bullet(b: dict[str, str]) -> dict[str, str]:
    bold = (b.get("bold") or "").strip()[:45]
    rest = (b.get("text") or "").strip()
    line = f"{bold} {rest}".strip() if rest else bold
    if len(line) <= MAX_BULLET_CHARS:
        return {"bold": bold, "text": rest}
    if bold and rest:
        budget = MAX_BULLET_CHARS - len(bold) - 2
        if budget > 20:
            rest = rest[: budget - 1] + "…"
            return {"bold": bold, "text": rest}
    short = line[: MAX_BULLET_CHARS - 1] + "…"
    return {"bold": short[:40], "text": ""}


def sync_toc_from_slides(slides: list[dict[str, Any]]) -> None:
    """Оглавление = заголовки всех CONTENT по порядку + «Выводы»."""
    content_headings: list[str] = []
    has_conclusion = False
    for sl in slides:
        stype = (sl.get("type") or "").upper()
        if stype == "CONTENT":
            h = (sl.get("heading") or "").strip()
            if h:
                content_headings.append(h)
        elif stype == "CONCLUSION":
            has_conclusion = True
    toc_items = list(content_headings)
    if has_conclusion and "Выводы" not in toc_items:
        toc_items.append("Выводы")
    for sl in slides:
        if (sl.get("type") or "").upper() == "TOC":
            sl["heading"] = "Структура презентации"
            sl["items"] = toc_items
            break


def trim_slides_for_template(slides: list[dict[str, Any]]) -> None:
    """Укорачивает буллеты и выводы, чтобы не обрезались в Ion."""
    for sl in slides:
        stype = (sl.get("type") or "").upper()
        if stype == "CONTENT":
            bullets = sl.get("bullets") or []
            trimmed = [
                _truncate_bullet(b if isinstance(b, dict) else {"bold": str(b), "text": ""})
                for b in bullets[:MAX_BULLETS_PER_SLIDE]
            ]
            sl["bullets"] = trimmed
            sl["stats"] = (sl.get("stats") or [])[:1]
        elif stype == "CONCLUSION":
            items = []
            for it in (sl.get("items") or [])[:MAX_CONCLUSION_ITEMS]:
                if isinstance(it, dict):
                    title = (it.get("title") or "").strip()[:48]
                    text = (it.get("text") or "").strip()
                    if len(text) > MAX_CONCLUSION_TEXT:
                        text = text[: MAX_CONCLUSION_TEXT - 1] + "…"
                    items.append({"title": title, "text": text})
                elif it:
                    items.append({"title": str(it)[:48], "text": ""})
            sl["items"] = items or [{"title": "Итог", "text": "Краткие выводы по теме"}]


def _effective_structure(result: dict, work_type: str) -> list[str]:
    """Полный список разделов для TOC и CONTENT — не только «Результат» у теста."""
    structure = [str(s).strip() for s in (result.get("structure") or []) if str(s).strip()]
    content = result.get("content") or {}

    if work_type == "Тест":
        if structure:
            return structure
        return list(content.keys()) or ["Результат"]

    ordered: list[str] = []
    seen: set[str] = set()
    for s in structure:
        if s not in seen:
            ordered.append(s)
            seen.add(s)

    intro = (result.get("intro") or "").strip()
    concl = (result.get("conclusion") or "").strip()
    intro_keys = {"введение", "кіріспе", "introduction"}
    concl_keys = {"заключение", "қорытынды", "conclusion"}

    if intro and not any(k in seen for k in intro_keys):
        for label in ("Введение", "Introduction", "Кіріспе"):
            if label not in seen:
                ordered.insert(0, label)
                content.setdefault(label, intro)
                seen.add(label)
                break

    for key in content:
        if key not in seen and not _SKIP_SECTION.match(key):
            ordered.append(key)
            seen.add(key)

    if concl and not any(k in seen for k in concl_keys):
        for label in ("Заключение", "Conclusion", "Қорытынды"):
            if label not in seen:
                ordered.append(label)
                content.setdefault(label, concl)
                seen.add(label)
                break

    return ordered or structure or list(content.keys())


def build_slides_from_result(
    topic: str,
    work_type: str,
    result: dict,
    profile: dict | None = None,
) -> dict[str, Any]:
    profile = profile or {}
    is_short = work_type in ("Эссе", "Сочинение")

    is_short = work_type in ("Эссе", "Сочинение")
    with_toc = not is_short
    with_conclusion = not is_short

    structure = _effective_structure(result, work_type)
    n_content = _n_content_slides(structure, work_type)
    content_map = dict(result.get("content") or {})
    if result.get("intro") and "Введение" in structure and "Введение" not in content_map:
        content_map["Введение"] = result.get("intro") or ""
    if result.get("conclusion") and "Заключение" in structure and "Заключение" not in content_map:
        content_map["Заключение"] = result.get("conclusion") or ""

    body_sections = _presentation_body_sections(structure, n_content)

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

    image_idx = max(0, len(body_sections) // 2)
    for i, section in enumerate(body_sections):
        raw = _strip_tables(content_map.get(section, "") or "")
        paras = _paragraphs(raw, 4)
        bullets = [_bullet_from_paragraph(p) for p in paras[:3]]
        if not bullets:
            bullets = [{"bold": section[:40], "text": "— ключевые положения раздела"}]

        stats = _extract_stats(raw) if i != image_idx else []
        slides.append({
            "type": "CONTENT",
            "heading": _presentation_title(section),
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
            for section in reversed(body_sections):
                raw_sec = _strip_tables(content_map.get(section, "") or "")
                for sent in _sentences(raw_sec, 4):
                    words = sent.split()
                    title = " ".join(words[:6])
                    if len(title) > 48:
                        title = title[:45] + "…"
                    items.append({"title": title, "text": sent[:200]})
                if items:
                    break
        if not items:
            items = [
                {"title": "Итог", "text": "Краткие выводы по теме работы"},
            ]
        slides.append({
            "type": "CONCLUSION",
            "heading": "Выводы",
            "items": items[:MAX_CONCLUSION_ITEMS],
        })

    if with_toc:
        slides.insert(1, {
            "type": "TOC",
            "heading": "Структура презентации",
            "items": [],
        })

    slides.append({
        "type": "FINAL",
    })

    sync_toc_from_slides(slides)
    trim_slides_for_template(slides)

    total = len(slides)
    for n, sl in enumerate(slides, start=1):
        sl["slide_num"] = n
        sl["total"] = total

    accent = _accent_for_work_type(work_type)
    return {
        "accent": accent,
        "slides": slides,
        "provider": "deterministic",
    }


def slide_titles_from_slides(slides_dict: dict) -> list[str]:
    return [
        sl.get("heading") or sl.get("title", "")
        for sl in slides_dict.get("slides", [])
        if sl.get("type") not in ("FINAL",)
        and (sl.get("heading") or sl.get("title"))
    ]
