"""
rebuild_examples.py — пересобирает оглавление и список литературы
в примерах DOCX без регенерации контента через AI.

Запуск: python rebuild_examples.py
"""
import sys
import copy
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn

# Добавляем backend/ в путь для импорта formatter
sys.path.insert(0, str(Path(__file__).parent))
import formatter as F


# ─── Утилиты ────────────────────────────────────────────────────────────────

def get_p_left(p):
    """Возвращает значение w:left из w:ind или None."""
    pPr = p._p.find(qn("w:pPr"))
    if pPr is None:
        return None
    ind = pPr.find(qn("w:ind"))
    if ind is None:
        return None
    return ind.get(qn("w:left"))


def is_toc_line(p):
    """True, если параграф — строка оглавления (есть tab stop с dot leader)."""
    pPr = p._p.find(qn("w:pPr"))
    if pPr is None:
        return False
    tabs = pPr.find(qn("w:tabs"))
    return tabs is not None


def extract_toc_entries(paras, start_idx, end_idx):
    """Извлекает записи оглавления из диапазона параграфов."""
    entries = []
    for i in range(start_idx, end_idx):
        p = paras[i]
        text = p.text
        if not text.strip() or not is_toc_line(p):
            continue
        tab_idx = text.find("\t")
        if tab_idx < 0:
            continue
        title = text[:tab_idx].strip()
        page_str = text[tab_idx + 1:].strip()
        try:
            page_num = int(page_str)
        except ValueError:
            page_num = 1
        left = get_p_left(p)
        level = 2 if (left and int(left) > 0) else 1
        entries.append((title, level, page_num))
    return entries


def extract_sources(paras, start_idx):
    """Извлекает список источников начиная с start_idx (после заголовка)."""
    sources = []
    for i in range(start_idx, len(paras)):
        text = paras[i].text.strip()
        if text:
            sources.append(text)
    return sources


def get_paras_from_tmp_doc(tmp_doc, skip=0):
    """
    Возвращает скопированные XML-элементы параграфов из временного документа.
    skip — сколько начальных параграфов пропустить
          (Document() создаёт один пустой параграф по умолчанию).
    """
    body = tmp_doc.element.body
    elements = []
    for child in body:
        tag = child.tag
        if tag.endswith("}p") or tag.endswith("}tbl"):
            elements.append(copy.deepcopy(child))
    return elements[skip:]


def remove_range(body, p_elements):
    """Удаляет переданные XML-элементы из body."""
    for el in p_elements:
        try:
            body.remove(el)
        except ValueError:
            pass


def insert_after(body, anchor_el, new_elements):
    """Вставляет new_elements в body после anchor_el."""
    children = list(body)
    try:
        idx = children.index(anchor_el)
    except ValueError:
        idx = len(children) - 1
    for offset, el in enumerate(new_elements):
        body.insert(idx + 1 + offset, el)


# ─── Основная функция перестройки ─────────────────────────────────────────

def rebuild_docx(src_path: str, dst_path: str, toc_title: str = "СОДЕРЖАНИЕ"):
    print(f"\n→ Обрабатываю {src_path}")
    doc = Document(src_path)
    paras = doc.paragraphs
    body = doc.element.body

    # ── 1. Найти оглавление ──────────────────────────────────────────────
    toc_heading_idx = None
    for i, p in enumerate(paras):
        if p.text.strip() in ("СОДЕРЖАНИЕ", "ОГЛАВЛЕНИЕ") and p.style.name == "Normal":
            toc_heading_idx = i
            break

    if toc_heading_idx is None:
        print("  ! Заголовок оглавления не найден — пропускаем.")
        return

    # Первый Heading 1 после заголовка оглавления
    first_content_idx = None
    for i in range(toc_heading_idx + 1, len(paras)):
        if paras[i].style.name == "Heading 1":
            first_content_idx = i
            break

    if first_content_idx is None:
        print("  ! Не найдено Heading 1 после оглавления — пропускаем.")
        return

    print(f"  TOC: параграфы [{toc_heading_idx}..{first_content_idx - 1}]")

    # ── 2. Найти список литературы ───────────────────────────────────────
    biblio_heading_idx = None
    for i, p in enumerate(paras):
        if p.style.name == "Heading 1" and "СПИСОК" in p.text.upper():
            biblio_heading_idx = i
            break

    if biblio_heading_idx is None:
        print("  ! Заголовок «СПИСОК ЛИТЕРАТУРЫ» не найден — пропускаем.")
        return

    print(f"  Библиография: параграфы [{biblio_heading_idx}..{len(paras) - 1}]")

    # ── 3. Извлечь данные ────────────────────────────────────────────────
    toc_entries = extract_toc_entries(paras, toc_heading_idx + 1, first_content_idx)
    print(f"  TOC entries: {len(toc_entries)}")

    sources = extract_sources(paras, biblio_heading_idx + 1)
    print(f"  Sources: {len(sources)}")

    # ── 4. Запомнить якорные элементы ───────────────────────────────────
    # Элемент ПЕРЕД оглавлением (последний параграф титульника)
    anchor_before_toc = paras[toc_heading_idx - 1]._p if toc_heading_idx > 0 else None

    # Элемент ПЕРЕД заголовком библиографии
    anchor_before_biblio = paras[biblio_heading_idx - 1]._p

    # ── 5. Собрать XML-элементы для удаления ────────────────────────────
    toc_elements = [paras[i]._p for i in range(toc_heading_idx, first_content_idx)]
    biblio_elements = [paras[i]._p for i in range(biblio_heading_idx, len(paras))]

    # ── 6. Удалить старые секции ─────────────────────────────────────────
    remove_range(body, toc_elements)
    remove_range(body, biblio_elements)

    # ── 7. Пересобрать оглавление во временном документе ────────────────
    tmp_toc = Document()
    tmp_toc.styles["Normal"].paragraph_format.space_before = __import__("docx.shared", fromlist=["Pt"]).Pt(0)
    tmp_toc.styles["Normal"].paragraph_format.space_after = __import__("docx.shared", fromlist=["Pt"]).Pt(0)
    F.setup_heading_styles(tmp_toc)
    F.add_toc(tmp_toc, toc_entries, title=toc_title)
    toc_new_elements = get_paras_from_tmp_doc(tmp_toc, skip=0)

    # ── 8. Пересобрать библиографию во временном документе ──────────────
    tmp_bib = Document()
    tmp_bib.styles["Normal"].paragraph_format.space_before = __import__("docx.shared", fromlist=["Pt"]).Pt(0)
    tmp_bib.styles["Normal"].paragraph_format.space_after = __import__("docx.shared", fromlist=["Pt"]).Pt(0)
    F.setup_heading_styles(tmp_bib)
    F.add_sources(tmp_bib, sources)
    bib_new_elements = get_paras_from_tmp_doc(tmp_bib, skip=0)

    # ── 9. Вставить новые секции ────────────────────────────────────────
    if anchor_before_toc is not None:
        insert_after(body, anchor_before_toc, toc_new_elements)
    else:
        for el in toc_new_elements:
            body.insert(0, el)

    insert_after(body, anchor_before_biblio, bib_new_elements)

    # ── 10. Сохранить ───────────────────────────────────────────────────
    doc.save(dst_path)
    print(f"  ✓ Сохранено: {dst_path}")


# ─── Точка входа ────────────────────────────────────────────────────────────

EXAMPLES_DIR = Path("/var/www/ref-ai/frontend/public/examples")

FILES = [
    ("referat.docx",  "СОДЕРЖАНИЕ"),
    ("doklad.docx",   "СОДЕРЖАНИЕ"),
    ("kursovaya.docx","ОГЛАВЛЕНИЕ"),
]

if __name__ == "__main__":
    for filename, toc_title in FILES:
        src = str(EXAMPLES_DIR / filename)
        dst = str(EXAMPLES_DIR / filename)  # overwrite in place
        rebuild_docx(src, dst, toc_title=toc_title)

    print("\n✓ Готово.")
