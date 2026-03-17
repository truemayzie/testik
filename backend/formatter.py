"""
formatter.py — создание DOCX по ГОСТ 7.32-2017.
Автособираемое оглавление, главы и подглавы.
"""

import re
import json as _json
from docx import Document
from docx.shared import Pt, Mm, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import copy, io


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


def setup_heading_styles(doc):
    """
    Heading 1 — главные разделы (ВВЕДЕНИЕ, ГЛАВА 1, ЗАКЛЮЧЕНИЕ и т.д.)
                с разрывом страницы, по центру, жирный
    Heading 2 — подглавы (1.1. 1.2.) без разрыва, по левому краю
    Heading 3 — используем для подглав чтобы не было разрыва
    """
    # Heading 1 — главные разделы С разрывом страницы
    h1 = doc.styles["Heading 1"]
    h1.font.name      = "Times New Roman"
    h1.font.size      = Pt(14)
    h1.font.bold      = True
    h1.font.color.rgb = RGBColor(0, 0, 0)
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

    # Heading 2 — подглавы БЕЗ разрыва, по левому краю
    h2 = doc.styles["Heading 2"]
    h2.font.name      = "Times New Roman"
    h2.font.size      = Pt(14)
    h2.font.bold      = False
    h2.font.color.rgb = RGBColor(0, 0, 0)
    h2.paragraph_format.alignment         = WD_ALIGN_PARAGRAPH.LEFT
    h2.paragraph_format.space_before      = Pt(12)
    h2.paragraph_format.space_after       = Pt(6)
    h2.paragraph_format.line_spacing      = Pt(21)
    h2.paragraph_format.first_line_indent = Cm(0)
    pPr2 = h2.element.get_or_add_pPr()
    numPr2 = pPr2.find(qn("w:numPr"))
    if numPr2 is not None:
        pPr2.remove(numPr2)


# ── Автособираемое оглавление ────────────────────────────────────────────────

def add_auto_toc(doc, title: str = "СОДЕРЖАНИЕ"):
    """
    Настоящее автособираемое оглавление Word.
    Обновляется при открытии документа (Ctrl+A → F9 в Word).
    Точки заполняют всю ширину страницы автоматически.
    """
    p = doc.add_paragraph()
    fmt(p, WD_ALIGN_PARAGRAPH.CENTER, 0, 21, 0, 12)
    run(p, title, bold=True, size=14)

    # XML поле TOC — автоматически собирает заголовки Heading 1 и Heading 2
    p_toc = doc.add_paragraph()
    p_toc.paragraph_format.space_before = Pt(0)
    p_toc.paragraph_format.space_after  = Pt(0)

    # Начало поля
    r1 = p_toc.add_run()
    set_run_font(r1, size=14)
    fldChar_begin = OxmlElement("w:fldChar")
    fldChar_begin.set(qn("w:fldCharType"), "begin")
    r1._r.append(fldChar_begin)

    # Инструкция TOC: уровни 1-2, с точками-заполнителями, с номерами страниц
    r2 = p_toc.add_run()
    set_run_font(r2, size=14)
    instrText = OxmlElement("w:instrText")
    instrText.set(qn("xml:space"), "preserve")
    instrText.text = ' TOC \\o "1-2" \\h \\z '
    r2._r.append(instrText)

    # Разделитель
    r3 = p_toc.add_run()
    set_run_font(r3, size=14)
    fldChar_sep = OxmlElement("w:fldChar")
    fldChar_sep.set(qn("w:fldCharType"), "separate")
    r3._r.append(fldChar_sep)

    # Заглушка (пока не обновлено)
    r4 = p_toc.add_run()
    set_run_font(r4, size=12)
    r4.text = "Откройте документ в Word и нажмите Ctrl+A, затем F9 для обновления содержания"

    # Конец поля
    r5 = p_toc.add_run()
    set_run_font(r5, size=14)
    fldChar_end = OxmlElement("w:fldChar")
    fldChar_end.set(qn("w:fldCharType"), "end")
    r5._r.append(fldChar_end)

    doc.add_page_break()


# ── Титульная страница ───────────────────────────────────────────────────────

def add_title_page(doc, topic, profile: dict = {}, work_type: str = "Реферат"):
    from datetime import datetime
    year = datetime.now().year

    university  = (profile.get("university")  or "").strip()
    faculty     = (profile.get("faculty")     or "").strip()
    department  = (profile.get("department")  or "").strip()
    speciality  = (profile.get("speciality")  or "").strip()
    full_name   = (profile.get("fullName")    or "").strip()
    course      = (profile.get("course")      or "").strip()
    group       = (profile.get("groupNumber") or "").strip()
    teacher     = (profile.get("teacherName") or "").strip()
    city        = (profile.get("city")        or "Москва").strip()

    # Шапка — название ВУЗа
    if university:
        center(doc, university.upper(), bold=True, size=12)
    else:
        center(doc, "МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ РОССИЙСКОЙ ФЕДЕРАЦИИ",
               bold=True, size=12)
        center(doc, "Федеральное государственное бюджетное образовательное учреждение", size=12)
        center(doc, "высшего образования", size=12)

    blank(doc)

    # Факультет, направление, кафедра — по центру
    if faculty:
        center(doc, f"Факультет / Институт: {faculty}", size=12)
    else:
        center(doc, "Факультет / Институт: ____________________________________", size=12)

    if speciality:
        center(doc, f"Направление подготовки: {speciality}", size=12)
    else:
        center(doc, "Направление подготовки: __________________________________", size=12)

    if department:
        center(doc, f"Кафедра: {department}", size=12)
    else:
        center(doc, "Кафедра: _________________________________________________", size=12)

    blank(doc); blank(doc); blank(doc)

    # Тип работы и тема — по центру
    if work_type == "ВКР":
        title_label = "ВЫПУСКНАЯ КВАЛИФИКАЦИОННАЯ РАБОТА"
    elif work_type == "Курсовая":
        title_label = "КУРСОВАЯ РАБОТА"
    else:
        title_label = work_type.upper()
    center(doc, title_label, bold=True, size=16)
    center(doc, "на тему:", size=14)
    center(doc, f"«{topic}»", bold=True, size=14)

    blank(doc); blank(doc); blank(doc)

    def author_line(text):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.left_indent       = Cm(8)
        p.paragraph_format.first_line_indent = Cm(0)
        p.paragraph_format.space_before      = Pt(0)
        p.paragraph_format.space_after       = Pt(3)
        p.paragraph_format.line_spacing      = Pt(18)
        r = p.add_run(text)
        set_run_font(r, size=12)

    # Блок студента
    course_group = ""
    if course and group:
        course_group = f"{course} курс, группа {group}"
    elif course:
        course_group = f"{course} курс"
    elif group:
        course_group = f"группа: {group}"
    else:
        course_group = "группа: _________________________"

    author_line(f"Выполнил(а): {full_name or '___________________________'}")
    author_line(course_group)

    blank(doc)

    # Блок преподавателя
    author_line("Научный руководитель:")
    author_line(teacher or "___________________________")

    blank(doc)
    author_line("Оценка: _________________________")
    author_line("Дата сдачи: _____________________")

    blank(doc); blank(doc); blank(doc)
    center(doc, f"{city}, {year}", size=12)
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


# ── Заголовки глав и подглав ─────────────────────────────────────────────────

def is_subheading(title):
    """1.1. Название → True, 1. Название → False."""
    parts = title.split(".")
    return len(parts) >= 3 and parts[0].isdigit() and parts[1].isdigit()


def add_chapter_heading(doc, title):
    """
    ГЛАВА (1. 2. 3.) — Heading 1, разрыв страницы, жирный, по центру.
    """
    p = doc.add_paragraph(style="Heading 1")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.first_line_indent = Cm(0)
    r = p.add_run(title.rstrip("."))
    set_run_font(r, bold=True, size=14)


def add_subchapter_heading(doc, title):
    """
    ПОДГЛАВА (1.1. 1.2.) — Heading 2, БЕЗ разрыва страницы, по левому краю.
    """
    p = doc.add_paragraph(style="Heading 2")
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.first_line_indent = Cm(0)
    r = p.add_run(title.rstrip("."))
    set_run_font(r, bold=False, size=14)


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

    # Небольшой отступ сверху перед таблицей
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_before = Pt(6)
    spacer.paragraph_format.space_after  = Pt(0)

    # Создаём таблицу: строка-подпись + строка-заголовок + строки данных
    table = doc.add_table(rows=2 + len(rows), cols=len(headers))
    table.style = "Table Grid"

    from docx.oxml import OxmlElement as _OE
    from docx.oxml.ns import qn as _qn

    def mark_tbl_header(row):
        """Помечает строку как повторяемый заголовок при переносе."""
        trPr = row._tr.get_or_add_trPr()
        tblHeader = _OE("w:tblHeader")
        trPr.append(tblHeader)

    # ── Строка 0: подпись таблицы (слитая ячейка на всю ширину) ──
    caption_row = table.rows[0]
    mark_tbl_header(caption_row)

    # Объединяем все ячейки в одну
    if len(headers) > 1:
        caption_row.cells[0].merge(caption_row.cells[-1])

    cap_cell = caption_row.cells[0]
    cap_cell.text = ""
    cp = cap_cell.paragraphs[0]
    cp.alignment = WD_ALIGN_PARAGRAPH.LEFT
    cp.paragraph_format.space_before = Pt(3)
    cp.paragraph_format.space_after  = Pt(3)
    r_cap = cp.add_run(caption)
    set_run_font(r_cap, bold=True, size=12)

    # ── Строка 1: заголовки столбцов ──
    hdr_row = table.rows[1]
    mark_tbl_header(hdr_row)

    for i, header in enumerate(headers):
        cell = hdr_row.cells[i]
        cell.text = ""
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after  = Pt(3)
        r = p.add_run(str(header))
        set_run_font(r, bold=True, size=12)

    # Строки данных
    for ri, row_data in enumerate(rows):
        row = table.rows[ri + 2]

        # Запрещаем разрыв строки между страницами
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

def add_sources(doc, sources):
    """По левому краю, висячий отступ, пустая строка между источниками."""
    add_service_heading(doc, "Список литературы")

    for src in sources:
        src = src.strip()
        if not src:
            continue
        p = doc.add_paragraph()
        fmt(p, WD_ALIGN_PARAGRAPH.LEFT, None, 21, 0, 0)
        p.paragraph_format.left_indent       = Cm(1.25)
        p.paragraph_format.first_line_indent = Cm(-1.25)
        run(p, src, size=14)
        blank(doc)  # пустая строка между источниками


# ── Главная функция ──────────────────────────────────────────────────────────

def create_docx(referat_data: dict) -> bytes:
    from generator import WORK_RULES

    doc = Document()

    work_type = referat_data.get("meta", {}).get("Тип работы", "Реферат")
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

    # 1. Титульная страница — только для Реферат/Курсовая/ВКР
    if rules["has_title_page"]:
        profile = referat_data.get("profile", {}) or {}
        add_title_page(doc, topic, profile, work_type)

    # 2. Оглавление — только для Реферат/Курсовая/ВКР
    if rules["has_toc"]:
        toc_title = TOC_TITLES.get(work_type, "СОДЕРЖАНИЕ")
        add_auto_toc(doc, title=toc_title)

    # Счётчик таблиц — сквозная нумерация по всему документу
    table_counter = [0]

    SERVICE_HEADINGS = {"Введение", "Заключение", "Вступление"}

    # 3. Разделы
    for name in referat_data["structure"]:
        if name in ("Список литературы", "Приложения"):
            continue

        text = referat_data["content"].get(name, "")

        if name in SERVICE_HEADINGS:
            add_service_heading(doc, name)
        elif is_subheading(name):
            add_subchapter_heading(doc, name)
        else:
            add_chapter_heading(doc, name)

        if text:
            add_body(doc, text, table_counter)

    # 4. Список литературы — только для Реферат/Курсовая/ВКР
    if rules["has_sources"] and referat_data.get("sources"):
        add_sources(doc, referat_data["sources"])

    # 5. Приложения (ВКР)
    if "Приложения" in referat_data["structure"]:
        add_service_heading(doc, "Приложения")
        appendix_text = referat_data["content"].get("Приложения", "")
        if appendix_text:
            add_body(doc, appendix_text, table_counter)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.getvalue()