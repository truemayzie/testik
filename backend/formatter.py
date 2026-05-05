"""
formatter.py — создание DOCX по ГОСТ 7.32-2017.
Автособираемое оглавление, главы и подглавы.
"""

import re
import json as _json
from docx import Document
from docx.shared import Pt, Mm, Cm, Twips, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import copy, io

DOC_LANG_LABELS = {
    "ru": {
        "toc": "СОДЕРЖАНИЕ",
        "intro": "Введение",
        "conclusion": "Заключение",
        "sources": "Список литературы",
        "appendix": "Приложения",
    },
    "kz": {
        "toc": "МАЗМҰНЫ",
        "intro": "Кіріспе",
        "conclusion": "Қорытынды",
        "sources": "Пайдаланылған әдебиеттер",
        "appendix": "Қосымшалар",
    },
    "en": {
        "toc": "CONTENTS",
        "intro": "Introduction",
        "conclusion": "Conclusion",
        "sources": "References",
        "appendix": "Appendices",
    },
}


def _doc_labels(doc_lang: str) -> dict[str, str]:
    return DOC_LANG_LABELS.get(doc_lang, DOC_LANG_LABELS["ru"])


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


# ── Утилиты ──────────────────────────────────────────────────────────────────

def set_run_font(run, bold=False, size=14):
    run.font.name = "Times New Roman"
    run.font.size = Pt(size)
    run.font.bold = bold
    rPr = run._element.get_or_add_rPr()
    rFonts = OxmlElement("w:rFonts")
    for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        rFonts.set(qn(attr), "Times New Roman")
    rPr.insert(0, rFonts)


def fmt(p, align=WD_ALIGN_PARAGRAPH.JUSTIFY,
        indent_cm=1.25, line_pt=21, before=0, after=0):
    p.alignment = align
    f = p.paragraph_format
    f.line_spacing = Pt(line_pt)
    f.space_before = Pt(before)
    f.space_after  = Pt(after)
    f.first_line_indent = Cm(indent_cm) if indent_cm is not None else Cm(0)


def run(p, text, bold=False, size=14):
    r = p.add_run(text)
    set_run_font(r, bold=bold, size=size)
    return r


def blank(doc):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after  = Pt(0)
    p.paragraph_format.line_spacing = Pt(21)
    r = p.add_run("")
    set_run_font(r)


def center(doc, text, bold=False, size=14, before=0, after=0):
    p = doc.add_paragraph()
    fmt(p, WD_ALIGN_PARAGRAPH.CENTER, 0, 21, before, after)
    run(p, text, bold, size)
    return p


def right(doc, text, size=12, after=4):
    p = doc.add_paragraph()
    fmt(p, WD_ALIGN_PARAGRAPH.RIGHT, 0, 18, 0, after)
    run(p, text, size=size)


# ── Поля и нумерация ─────────────────────────────────────────────────────────

def setup_margins(section):
    section.top_margin    = Cm(2)
    section.bottom_margin = Cm(2)
    section.left_margin   = Cm(3)
    section.right_margin  = Cm(1)
    section.page_width    = Mm(210)
    section.page_height   = Mm(297)


def add_page_numbers(section):
    """Нумерация снизу по центру."""
    footer = section.footer
    footer.is_linked_to_previous = False
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after  = Pt(0)
    r = p.add_run()
    for tag, text in [("begin", None), (None, " PAGE "), ("end", None)]:
        if tag:
            el = OxmlElement("w:fldChar")
            el.set(qn("w:fldCharType"), tag)
            r._r.append(el)
        else:
            instr = OxmlElement("w:instrText")
            instr.text = text
            r._r.append(instr)
    set_run_font(r, size=12)


def no_number_on_title(doc):
    """Без номера на первой странице."""
    sectPr = doc.sections[0]._sectPr
    titlePg = OxmlElement("w:titlePg")
    sectPr.append(titlePg)
    doc.sections[0].first_page_footer.paragraphs[0].text = ""


# ── Стили заголовков ─────────────────────────────────────────────────────────

def add_page_break_before(p):
    """Добавляет разрыв страницы перед параграфом через XML."""
    pPr = p._element.get_or_add_pPr()
    pageBreakBefore = OxmlElement("w:pageBreakBefore")
    pPr.append(pageBreakBefore)


def _force_black_color(h_style):
    """Устанавливает чёрный цвет заголовка через API и удаляет theme-атрибуты из XML."""
    h_style.font.color.rgb = RGBColor(0, 0, 0)
    rPr = h_style.element.get_or_add_rPr()
    color_el = rPr.find(qn("w:color"))
    if color_el is None:
        color_el = OxmlElement("w:color")
        rPr.append(color_el)
    color_el.set(qn("w:val"), "000000")
    for attr in ("w:themeColor", "w:themeShade", "w:themeTint"):
        if color_el.get(qn(attr)) is not None:
            del color_el.attrib[qn(attr)]


def setup_heading_styles(doc):
    """
    Heading 1 — главные разделы (ВВЕДЕНИЕ, ГЛАВА 1, ЗАКЛЮЧЕНИЕ и т.д.)
                с разрывом страницы, по центру, жирный, прописные (all caps)
    Heading 2 — подглавы (1.1. 1.2.) без разрыва, по левому краю, жирный
    """
    # Heading 1 — главные разделы С разрывом страницы
    h1 = doc.styles["Heading 1"]
    h1.font.name     = "Times New Roman"
    h1.font.size     = Pt(14)
    h1.font.bold     = True
    h1.font.all_caps = True
    _force_black_color(h1)
    h1.paragraph_format.alignment         = WD_ALIGN_PARAGRAPH.CENTER
    h1.paragraph_format.space_before      = Pt(0)
    h1.paragraph_format.space_after       = Pt(12)
    h1.paragraph_format.line_spacing      = Pt(21)
    h1.paragraph_format.first_line_indent = Cm(0)
    # Разрыв страницы перед каждым Heading 1
    pPr = h1.element.get_or_add_pPr()
    numPr = pPr.find(qn("w:numPr"))
    if numPr is not None:
        pPr.remove(numPr)
    pb = OxmlElement("w:pageBreakBefore")
    pPr.append(pb)

    # Heading 2 — подглавы БЕЗ разрыва, по левому краю, жирный
    h2 = doc.styles["Heading 2"]
    h2.font.name     = "Times New Roman"
    h2.font.size     = Pt(14)
    h2.font.bold     = True
    h2.font.all_caps = False
    _force_black_color(h2)
    h2.paragraph_format.alignment         = WD_ALIGN_PARAGRAPH.LEFT
    h2.paragraph_format.space_before      = Pt(12)
    h2.paragraph_format.space_after       = Pt(6)
    h2.paragraph_format.line_spacing      = Pt(21)
    h2.paragraph_format.first_line_indent = Cm(0)
    pPr2 = h2.element.get_or_add_pPr()
    numPr2 = pPr2.find(qn("w:numPr"))
    if numPr2 is not None:
        pPr2.remove(numPr2)


# ── Программное оглавление ───────────────────────────────────────────────────

_WORDS_PER_PAGE = 500  # ~500 слов на страницу (14pt TNR, интервал 1.5, поля ГОСТ)

# Tab stop для оглавления: 8640 twips ≈ 15.24 см от левого поля параграфа.
# Все уровни (главы и подглавы) используют одну позицию — номера страниц
# выровнены одинаково. Подглавы не вычитают свой w:left, иначе при длинных
# заголовках \t рисует слишком мало точек и номер прилипает к тексту.
TOC_TAB_TWIPS = 8640

def _count_words(text: str) -> int:
    """Подсчёт слов в тексте (без таблиц)."""
    if not text:
        return 0
    text = re.sub(r'\[TABLE\].*?\[/TABLE\]', '', text, flags=re.DOTALL)
    return len(text.split())


def _set_toc_tab(paragraph, pos_twips: int):
    """Устанавливает tab stop с точками-лидерами через XML напрямую.
    ВАЖНО: вызывать ПОСЛЕ добавления всех run-ов в параграф.
    pos_twips — позиция от левого поля параграфа в твипах.
    """
    pPr = paragraph._p.get_or_add_pPr()
    for old in pPr.findall(qn("w:tabs")):
        pPr.remove(old)
    tabs_el = OxmlElement("w:tabs")
    tab = OxmlElement("w:tab")
    tab.set(qn("w:val"), "right")
    tab.set(qn("w:leader"), "dot")
    tab.set(qn("w:pos"), str(pos_twips))
    tabs_el.append(tab)
    pPr.append(tabs_el)


_TOC_LEFT_L2 = 567  # отступ подглав в твипах (≈1.0 см)

def _toc_line(doc, title: str, level: int, page_num: int, tab_pos: int = TOC_TAB_TWIPS):
    """Одна строка оглавления: название + tab-лидер с точками + номер страницы.

    В Word/OOXML позиция w:tab/w:pos отсчитывается от левого края параграфа
    (включая w:ind/w:left), а НЕ от левого поля страницы.
    Поэтому для подглав с w:left=567 задаём tab на (tab_pos - 567),
    чтобы номера страниц визуально выровнялись с главами.
    """
    p = doc.add_paragraph()
    p.paragraph_format.space_before      = Pt(0)
    p.paragraph_format.space_after       = Pt(4)
    p.paragraph_format.line_spacing      = Pt(21)
    p.paragraph_format.first_line_indent = Cm(0)
    p.paragraph_format.keep_together     = True

    # keepLines — запрещает разрыв строк внутри параграфа.
    # Это не даёт \t оказаться в начале новой строки при переносе длинного заголовка.
    _pPr = p._p.get_or_add_pPr()
    _kl = OxmlElement("w:keepLines")
    _pPr.append(_kl)

    if level == 2:
        # Отступ подглав: w:left=567, w:firstLine=0
        pPr = p._p.get_or_add_pPr()
        ind_el = pPr.find(qn("w:ind"))
        if ind_el is None:
            ind_el = OxmlElement("w:ind")
            pPr.append(ind_el)
        ind_el.set(qn("w:left"),     str(_TOC_LEFT_L2))
        ind_el.set(qn("w:firstLine"), "0")

    # Все уровни используют одну позицию tab stop.
    # Не вычитаем w:left для подглав: Word считает w:pos от левого поля страницы,
    # а не от левого края параграфа — номера выровнены одинаково для всех уровней.
    effective_tab = tab_pos

    # Runs добавляем СНАЧАЛА — затем tab stop
    r1 = p.add_run(title)
    set_run_font(r1, bold=False, size=14)
    r1.font.color.rgb = RGBColor(0, 0, 0)

    r_tab = p.add_run("\t")
    set_run_font(r_tab, bold=False, size=14)

    r2 = p.add_run(str(page_num))
    set_run_font(r2, bold=False, size=14)
    r2.font.color.rgb = RGBColor(0, 0, 0)

    # Tab stop с точками — ПОСЛЕ runs
    _set_toc_tab(p, effective_tab)


def add_toc(doc, entries: list, title: str = "СОДЕРЖАНИЕ", tab_pos: int = TOC_TAB_TWIPS):
    """
    Программное оглавление: название по центру + строки с точками.
    entries — список (title, level, page_num).
    """
    p = doc.add_paragraph()
    fmt(p, WD_ALIGN_PARAGRAPH.CENTER, 0, 21, 0, 12)
    run(p, title, bold=True, size=14)

    for entry_title, level, page_num in entries:
        _toc_line(doc, entry_title, level, page_num, tab_pos=tab_pos)

    # Разрыв страницы не нужен — Heading 1 уже имеет pageBreakBefore,
    # двойной разрыв давал пустую страницу между оглавлением и текстом.


# ── Титульная страница ───────────────────────────────────────────────────────

def add_title_page(doc, topic, profile: dict = {}, work_type: str = "Реферат"):
    from datetime import datetime
    year = datetime.now().year

    def _get(*keys):
        for k in keys:
            v = (profile.get(k) or "").strip()
            if v:
                return v
        return ""

    university = _get("university")
    faculty    = _get("faculty")
    speciality = _get("speciality", "direction", "department")
    discipline = _get("discipline")
    full_name  = _get("full_name", "fullName")
    group      = _get("group", "groupNumber")
    teacher    = _get("teacher", "teacherName")
    city       = _get("city") or "Город"

    def cline(text, bold=False):
        """Строка по центру, 14pt."""
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.first_line_indent = Cm(0)
        p.paragraph_format.space_before      = Pt(0)
        p.paragraph_format.space_after       = Pt(0)
        p.paragraph_format.line_spacing      = Pt(21)
        r = p.add_run(text)
        set_run_font(r, bold=bold, size=14)

    def rline(text, bold=False):
        """Строка по правому краю, 14pt."""
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        p.paragraph_format.first_line_indent = Cm(0)
        p.paragraph_format.space_before      = Pt(0)
        p.paragraph_format.space_after       = Pt(0)
        p.paragraph_format.line_spacing      = Pt(21)
        r = p.add_run(text)
        set_run_font(r, bold=bold, size=14)

    skip_faculty   = bool(profile.get("skipFaculty"))
    skip_speciality = bool(profile.get("skipSpeciality"))
    skip_discipline = bool(profile.get("skipDiscipline"))

    # ── БЛОК 1: Шапка ────────────────────────────────────────────────────────
    cline(university or "Название учебного заведения", bold=True)
    if not skip_faculty:
        cline(faculty or "Направление (факультет)")
    if not skip_speciality:
        cline(speciality or "Специализация")

    # ── 4 пустые строки ──────────────────────────────────────────────────────
    for _ in range(4):
        blank(doc)

    # ── БЛОК 2: Тип работы и тема ────────────────────────────────────────────
    TITLE_LABELS = {
        "Реферат":  "Реферат",
        "Доклад":   "Доклад",
        "Курсовая": "Курсовая работа",
        "ВКР":      "Выпускная квалификационная работа",
    }
    cline(TITLE_LABELS.get(work_type, "Реферат"), bold=True)

    if not skip_discipline:
        if discipline and work_type != "ВКР":
            cline(discipline)
        else:
            cline("Предмет")

    # "На тему:" обычный, само название жирное
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.first_line_indent = Cm(0)
    p.paragraph_format.space_before      = Pt(0)
    p.paragraph_format.space_after       = Pt(0)
    p.paragraph_format.line_spacing      = Pt(21)
    r_lbl = p.add_run("На тему: ")
    set_run_font(r_lbl, bold=False, size=14)
    r_top = p.add_run(f"«{topic}»")
    set_run_font(r_top, bold=True, size=14)

    # ── 4 пустые строки ──────────────────────────────────────────────────────
    for _ in range(4):
        blank(doc)

    # ── БЛОК 3: Студент и руководитель ───────────────────────────────────────
    rline("Выполнил:")
    rline(full_name or "ФИО")
    rline(f"Группа: {group}" if group else "Группа: №")
    rline("Проверил(а):")
    rline(teacher or "ФИО")

    # ── 3 пустые строки ──────────────────────────────────────────────────────
    for _ in range(3):
        blank(doc)

    # ── БЛОК 4: Город и год в footer первой страницы ─────────────────────────
    section = doc.sections[0]
    sectPr  = section._sectPr
    if sectPr.find(qn("w:titlePg")) is None:
        titlePg = OxmlElement("w:titlePg")
        sectPr.append(titlePg)

    footer_para = section.first_page_footer.paragraphs[0]
    footer_para.clear()
    footer_para.alignment                    = WD_ALIGN_PARAGRAPH.CENTER
    footer_para.paragraph_format.space_before = Pt(0)
    footer_para.paragraph_format.space_after  = Pt(0)
    set_run_font(footer_para.add_run(f"{city}, {year}"), size=14)

    doc.add_page_break()


# ── Служебные заголовки (ВВЕДЕНИЕ, ЗАКЛЮЧЕНИЕ) ───────────────────────────────

def add_service_heading(doc, title):
    """
    ВВЕДЕНИЕ / ЗАКЛЮЧЕНИЕ / СПИСОК ЛИТЕРАТУРЫ
    Heading 1 → разрыв страницы автоматически, по центру, жирный, прописные.
    """
    p = doc.add_paragraph(style="Heading 1")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.first_line_indent = Cm(0)
    r = p.add_run(title.upper())
    set_run_font(r, bold=True, size=14)
    r.font.color.rgb = RGBColor(0, 0, 0)


# ── Заголовки глав и подглав ─────────────────────────────────────────────────

def is_subheading(title):
    """1.1. Название → True, 1. Название → False."""
    parts = title.split(".")
    return len(parts) >= 3 and parts[0].isdigit() and parts[1].isdigit()


def add_chapter_heading(doc, title):
    """
    ГЛАВА (1. 2. 3.) — Heading 1, разрыв страницы, жирный, по центру, прописные.
    """
    p = doc.add_paragraph(style="Heading 1")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.first_line_indent = Cm(0)
    r = p.add_run(title.rstrip(".").upper())
    set_run_font(r, bold=True, size=14)
    r.font.color.rgb = RGBColor(0, 0, 0)


def add_subchapter_heading(doc, title):
    """
    ПОДГЛАВА (1.1. 1.2.) — Heading 2, БЕЗ разрыва страницы, по левому краю, жирный.
    """
    p = doc.add_paragraph(style="Heading 2")
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.first_line_indent = Cm(0)
    r = p.add_run(title.rstrip("."))
    set_run_font(r, bold=True, size=14)
    r.font.color.rgb = RGBColor(0, 0, 0)


# ── Таблица по ГОСТ ─────────────────────────────────────────────────────────

def add_gost_table(doc, table_data: dict, table_counter: list):
    """
    Добавляет таблицу по ГОСТ 7.32-2017.
    table_counter — список [n] для сквозной нумерации.
    При переносе на след. страницу — дублирует заголовок.
    """
    headers = table_data.get("headers", [])
    rows    = table_data.get("rows", [])
    if not headers or not rows:
        return

    # Сквозная нумерация
    table_counter[0] += 1
    n = table_counter[0]

    # Берём описание из caption, убираем старый номер
    raw_caption = table_data.get("caption", "")
    # Убираем "Таблица N — " если модель уже добавила
    import re as _re
    clean_desc = _re.sub(r'^[Тт]аблица\s+\d+\s*[—-]\s*', '', raw_caption).strip()
    caption = f"Таблица {n} — {clean_desc}" if clean_desc else f"Таблица {n}"

    from docx.oxml import OxmlElement as _OE
    from docx.oxml.ns import qn as _qn

    def mark_tbl_header(row):
        """Помечает строку как повторяемый заголовок при переносе."""
        trPr = row._tr.get_or_add_trPr()
        tblHeader = _OE("w:tblHeader")
        trPr.append(tblHeader)

    # ── Отступ перед таблицей ─────────────────────────────────────────────────
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_before = Pt(6)
    spacer.paragraph_format.space_after  = Pt(0)
    spacer.paragraph_format.line_spacing = Pt(18)

    # ── Таблица: строка-подпись + строка-заголовок + строки данных ───────────
    # rows[0] — "Таблица N — ..." (объединённая ячейка, tblHeader)
    # rows[1] — заголовки столбцов (tblHeader)
    # rows[2..] — данные
    table = doc.add_table(rows=2 + len(rows), cols=len(headers))
    table.style = "Table Grid"

    # ── Строка 0: подпись таблицы (объединённые ячейки на всю ширину) ──
    cap_row = table.rows[0]
    mark_tbl_header(cap_row)
    # Объединяем все ячейки строки в одну
    cap_cell = cap_row.cells[0]
    if len(headers) > 1:
        cap_cell = cap_row.cells[0].merge(cap_row.cells[-1])
    cap_cell.text = ""
    cap_p = cap_cell.paragraphs[0]
    cap_p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    cap_p.paragraph_format.space_before      = Pt(3)
    cap_p.paragraph_format.space_after       = Pt(3)
    cap_p.paragraph_format.first_line_indent = Cm(0)
    cap_p.paragraph_format.left_indent       = Cm(0)
    r_cap = cap_p.add_run(caption)
    set_run_font(r_cap, bold=True, size=12)

    # Убираем все границы у ячеек строки-подписи
    for cell in cap_row.cells:
        tc = cell._tc
        tcPr = tc.get_or_add_tcPr()
        tcBorders = _OE("w:tcBorders")
        for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
            border = _OE(f"w:{side}")
            border.set(_qn("w:val"), "none")
            border.set(_qn("w:sz"), "0")
            border.set(_qn("w:space"), "0")
            border.set(_qn("w:color"), "auto")
            tcBorders.append(border)
        tcPr.append(tcBorders)

    # ── Строка 1: заголовки столбцов ──
    hdr_row = table.rows[1]
    mark_tbl_header(hdr_row)

    # tblLook с firstRow=1 активирует повторение заголовка в Word
    tbl = table._tbl
    tblPr = tbl.find(_qn("w:tblPr"))
    if tblPr is not None:
        tblLook = _OE("w:tblLook")
        tblLook.set(_qn("w:firstRow"), "1")
        tblLook.set(_qn("w:val"), "04A0")
        tblPr.append(tblLook)

    for i, header in enumerate(headers):
        cell = hdr_row.cells[i]
        cell.text = ""
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after  = Pt(3)
        r = p.add_run(str(header))
        set_run_font(r, bold=True, size=12)

    # ── Строки данных ──
    for ri, row_data in enumerate(rows):
        row = table.rows[ri + 2]

        trPr_data = row._tr.get_or_add_trPr()
        cantSplit = _OE("w:cantSplit")
        trPr_data.append(cantSplit)

        for ci, cell_val in enumerate(row_data):
            cell = row.cells[ci]
            cell.text = ""
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after  = Pt(2)
            r = p.add_run(str(cell_val))
            set_run_font(r, size=12)

    # Отступ после таблицы
    after = doc.add_paragraph()
    after.paragraph_format.space_before = Pt(6)
    after.paragraph_format.space_after  = Pt(0)


# ── Основной текст с поддержкой таблиц ──────────────────────────────────────

def add_body(doc, text, table_counter: list):
    """
    Текст абзацами с поддержкой таблиц.
    Таблицы помечены маркерами [TABLE]...[/TABLE].
    table_counter — список [n] для сквозной нумерации.
    """
    # Разбиваем текст на части: обычный текст и таблицы
    parts = re.split(r'(\[TABLE\].*?\[/TABLE\])', text, flags=re.DOTALL)

    for part in parts:
        part = part.strip()
        if not part:
            continue

        if part.startswith('[TABLE]'):
            # Извлекаем JSON таблицы
            try:
                json_str = part.replace('[TABLE]', '').replace('[/TABLE]', '').strip()
                table_data = _json.loads(json_str)
                add_gost_table(doc, table_data, table_counter)
            except Exception as e:
                print(f"Ошибка парсинга таблицы: {e}")
                # Если не удалось — просто пропускаем таблицу
        else:
            # Обычный текст — разбиваем по абзацам
            for para in part.split("\n"):
                para = para.strip()
                if not para:
                    continue
                p = doc.add_paragraph()
                fmt(p, WD_ALIGN_PARAGRAPH.JUSTIFY, 1.25, 21, 0, 0)
                run(p, para, size=14)


# ── Список литературы ────────────────────────────────────────────────────────

def add_sources(doc, sources, sources_title: str):
    """Список литературы по ГОСТ: номер прямо в тексте, без висячего отступа."""
    add_service_heading(doc, sources_title)

    for i, src in enumerate(sources):
        src = src.strip()
        if not src:
            continue
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p.paragraph_format.first_line_indent = Cm(0)
        p.paragraph_format.left_indent       = Cm(0)
        p.paragraph_format.line_spacing      = Pt(21)
        p.paragraph_format.space_before      = Pt(0)
        p.paragraph_format.space_after       = Pt(6)
        # Явный сброс w:ind через XML — перекрывает наследование от стиля Normal
        _pPr = p._p.get_or_add_pPr()
        _ind = _pPr.find(qn("w:ind"))
        if _ind is None:
            _ind = OxmlElement("w:ind")
            _pPr.append(_ind)
        _ind.set(qn("w:left"),      "0")
        _ind.set(qn("w:firstLine"), "0")
        _ind.set(qn("w:hanging"),   "0")
        # Убираем уже существующий "N. " префикс если он есть в src
        import re as _re
        src_clean = _re.sub(r'^\d+\.\s+', '', src)
        run(p, f"{i + 1}. {src_clean}", size=14)


# ── Сочинение / Эссе — без титульника, оглавления, списка литературы ─────────

def create_essay_docx(referat_data: dict) -> bytes:
    """Создаёт DOCX для сочинения или эссе: только заголовок и текст."""
    work_type = referat_data.get("meta", {}).get("Тип работы", "Сочинение")
    raw_title = referat_data["title"]
    topic = raw_title
    for prefix in (f"{work_type} на тему: «", f"{work_type} на тему:"):
        if raw_title.startswith(prefix):
            topic = raw_title[len(prefix):]
            break
    topic = topic.strip("«» ")

    doc = Document()
    doc.styles["Normal"].paragraph_format.space_before = Pt(0)
    doc.styles["Normal"].paragraph_format.space_after  = Pt(0)

    sec = doc.sections[0]
    setup_margins(sec)
    sec.right_margin = Cm(1.5)

    # Заголовок по центру
    p = doc.add_paragraph()
    fmt(p, WD_ALIGN_PARAGRAPH.CENTER, 0, 21, 0, 12)
    run(p, f"{work_type} на тему «{topic}»", bold=True, size=14)

    # Текст без заголовков разделов
    table_counter = [0]
    for section_name in referat_data["structure"]:
        text = referat_data["content"].get(section_name, "")
        if text:
            add_body(doc, text, table_counter)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.getvalue()


# ── Главная функция ──────────────────────────────────────────────────────────

def create_docx(referat_data: dict) -> bytes:
    from generator import WORK_RULES

    work_type = referat_data.get("meta", {}).get("Тип работы", "Реферат")
    doc_lang = referat_data.get("meta", {}).get("doc_lang", "ru")
    labels = _doc_labels(doc_lang)

    # Сочинение и Эссе — особая логика без титульника/оглавления
    if work_type in ("Сочинение", "Эссе"):
        return create_essay_docx(referat_data)

    doc = Document()

    rules = WORK_RULES.get(work_type, WORK_RULES["Реферат"])

    TOC_TITLES = {"ВКР": "ОГЛАВЛЕНИЕ"}
    RIGHT_MARGINS = {"Доклад": 1.5, "Эссе": 1.5, "Сочинение": 1.5}

    # Сбрасываем дефолтные отступы
    doc.styles["Normal"].paragraph_format.space_before = Pt(0)
    doc.styles["Normal"].paragraph_format.space_after  = Pt(0)

    # Настраиваем стили заголовков
    setup_heading_styles(doc)

    # Поля и нумерация
    sec = doc.sections[0]
    setup_margins(sec)
    sec.right_margin = Cm(RIGHT_MARGINS.get(work_type, 1.0))
    add_page_numbers(sec)
    if rules["has_title_page"]:
        no_number_on_title(doc)

    # Тема — убираем префикс любого типа работы
    raw_title = referat_data["title"]
    topic = raw_title
    for prefix in ("Реферат на тему: «", "Курсовая на тему: «", "ВКР на тему: «",
                   "Доклад на тему: «", "Эссе на тему: «", "Сочинение на тему: «",
                   "Реферат на тему:", "Курсовая на тему:", "ВКР на тему:",
                   "Доклад на тему:", "Эссе на тему:", "Сочинение на тему:"):
        if raw_title.startswith(prefix):
            topic = raw_title[len(prefix):]
            break
    topic = topic.strip("«» ")

    # ── Предварительный расчёт оглавления ────────────────────────────────────
    toc_entries = []
    if rules["has_toc"]:
        # Страница 1 — титульник, страница 2 — оглавление,
        # содержательные разделы начинаются со страницы 3
        cur_page = 3
        for name in referat_data["structure"]:
            if _canonical_service_key(name) in ("sources", "appendix"):
                continue
            text = referat_data["content"].get(name, "")
            level = 2 if is_subheading(name) else 1
            toc_entries.append((name.rstrip("."), level, cur_page))
            words = _count_words(text)
            pages_used = max(1, (words + _WORDS_PER_PAGE - 1) // _WORDS_PER_PAGE)
            cur_page += pages_used

        if rules["has_sources"] and referat_data.get("sources"):
            toc_entries.append((labels["sources"], 1, cur_page))

    # 1. Титульная страница — только для Реферат/Курсовая/ВКР
    if rules["has_title_page"]:
        profile = referat_data.get("profile", {}) or {}
        add_title_page(doc, topic, profile, work_type)

    # 2. Оглавление — только для Реферат/Курсовая/ВКР
    if rules["has_toc"]:
        toc_title = labels["toc"] if doc_lang != "ru" else TOC_TITLES.get(work_type, "СОДЕРЖАНИЕ")
        add_toc(doc, toc_entries, title=toc_title)

    # Счётчик таблиц — сквозная нумерация по всему документу
    table_counter = [0]

    # 3. Разделы
    for name in referat_data["structure"]:
        canonical = _canonical_service_key(name)
        if canonical in ("sources", "appendix"):
            continue

        text = referat_data["content"].get(name, "")

        if canonical in ("intro", "conclusion"):
            add_service_heading(doc, labels[canonical])
        elif is_subheading(name):
            add_subchapter_heading(doc, name)
        else:
            add_chapter_heading(doc, name)

        if text:
            add_body(doc, text, table_counter)

    # 4. Список литературы — только для Реферат/Курсовая/ВКР
    if rules["has_sources"] and referat_data.get("sources"):
        add_sources(doc, referat_data["sources"], labels["sources"])

    # 5. Приложения (ВКР)
    appendix_name = next(
        (n for n in referat_data["structure"] if _canonical_service_key(n) == "appendix"),
        None,
    )
    if appendix_name:
        add_service_heading(doc, labels["appendix"] if doc_lang != "ru" else "Приложения")
        appendix_text = referat_data["content"].get(appendix_name, "")
        if appendix_text:
            add_body(doc, appendix_text, table_counter)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.getvalue()