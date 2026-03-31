"""
presentation_generator.py — генерация презентации и текста выступления.
Использует тот же Claude-прокси что и generator.py.
"""

import os
import re
import json
import tempfile

import requests as _req

from pptx import Presentation as PPTXPresentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

from docx import Document
from docx.shared import Pt as DocPt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH

from generator import ask as _ask  # GitHub Actions прокси — работает из РФ

# ── Утилиты ──────────────────────────────────────────────────────────────────

def hex_to_rgb(hex_str: str) -> RGBColor:
    r = int(hex_str[0:2], 16)
    g = int(hex_str[2:4], 16)
    b = int(hex_str[4:6], 16)
    return RGBColor(r, g, b)


def _detect_color_scheme(topic: str) -> dict:
    t = topic.lower()
    if any(k in t for k in ['война', 'история', 'революция', 'политика', 'империя', 'средневек']):
        return {"primary": "1E2761", "accent": "C9A84C", "bg": "F4F6FB", "text": "1a1a3e"}
    if any(k in t for k in ['экология', 'природа', 'биология', 'климат', 'окружающ', 'лес', 'животн']):
        return {"primary": "1A4731", "accent": "52B788", "bg": "F0FFF4", "text": "1a3d2b"}
    if any(k in t for k in ['программирован', 'it', 'технологи', 'алгоритм', 'блокчейн', 'компьютер', 'цифров']):
        return {"primary": "0D1117", "accent": "00D9FF", "bg": "F0F4FF", "text": "0d1117"}
    if any(k in t for k in ['экономик', 'финанс', 'бизнес', 'маркетинг', 'банк', 'рынок', 'торговл']):
        return {"primary": "1B3A6B", "accent": "4A90D9", "bg": "F0F7FF", "text": "1b2d4b"}
    if any(k in t for k in ['медицин', 'здоровье', 'биохими', 'анатоми', 'фармако', 'болезн', 'лечени']):
        return {"primary": "7B2D2D", "accent": "E53E3E", "bg": "FFF5F5", "text": "4a1010"}
    if any(k in t for k in ['психологи', 'педагогик', 'воспитани', 'социологи', 'личность', 'поведени']):
        return {"primary": "4A1F6B", "accent": "9B59B6", "bg": "F8F4FF", "text": "2d1a45"}
    return {"primary": "1E3A5F", "accent": "C9A84C", "bg": "F4F6FB", "text": "1a2a40"}


def _fetch_image(topic: str, timeout: int = 10) -> "str | None":
    """Скачивает изображение по теме. Возвращает путь к временному файлу или None."""
    kw = re.sub(r'[^\w\s]', '', topic.lower()).split()[:3]
    query = '+'.join(kw) if kw else 'nature'

    # Пробуем Unsplash Source
    try:
        r = _req.get(
            f"https://source.unsplash.com/1280x720/?{query}",
            timeout=timeout, allow_redirects=True,
        )
        if r.status_code == 200 and len(r.content) > 8_000:
            f = tempfile.NamedTemporaryFile(delete=False, suffix='.jpg')
            f.write(r.content)
            f.close()
            print(f"[extras] Изображение Unsplash: {f.name}")
            return f.name
    except Exception as e:
        print(f"[extras] Unsplash недоступен: {e}")

    # Fallback: Wikipedia API
    try:
        for lang in ('ru', 'en'):
            api = f"https://{lang}.wikipedia.org/w/api.php"
            sr = _req.get(api, params={
                'action': 'opensearch', 'search': topic[:50],
                'limit': 1, 'format': 'json',
            }, timeout=6).json()
            if len(sr) > 1 and sr[1]:
                ir = _req.get(api, params={
                    'action': 'query', 'titles': sr[1][0],
                    'prop': 'pageimages', 'format': 'json', 'pithumbsize': 1280,
                }, timeout=6).json()
                for page in ir.get('query', {}).get('pages', {}).values():
                    img_url = page.get('thumbnail', {}).get('source')
                    if img_url:
                        r2 = _req.get(img_url, timeout=8)
                        if r2.status_code == 200 and len(r2.content) > 1000:
                            suffix = '.png' if 'png' in r2.headers.get('content-type', '') else '.jpg'
                            f = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
                            f.write(r2.content)
                            f.close()
                            print(f"[extras] Изображение Wikipedia ({lang}): {f.name}")
                            return f.name
    except Exception as e:
        print(f"[extras] Wikipedia недоступна: {e}")

    print("[extras] Изображение не найдено, работаем без него")
    return None


def _fill_rect(slide, left, top, width, height, hex_color, alpha_override=None):
    """Добавляет закрашенный прямоугольник."""
    shape = slide.shapes.add_shape(1, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = hex_to_rgb(hex_color)
    shape.line.fill.background()
    return shape


def _add_textbox(slide, left, top, width, height,
                 text, font_name="Arial", font_size=18,
                 bold=False, color="FFFFFF",
                 align=PP_ALIGN.LEFT, word_wrap=True):
    """Добавляет текстовый блок."""
    tb = slide.shapes.add_textbox(left, top, width, height)
    tf = tb.text_frame
    tf.word_wrap = word_wrap
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.name = font_name
    run.font.size = Pt(font_size)
    run.font.bold = bold
    run.font.color.rgb = hex_to_rgb(color)
    return tb


# ── Типы слайдов ─────────────────────────────────────────────────────────────

def _slide_title(prs, data, colors, profile, img_path=None):
    """Титульный слайд. Если img_path — полноэкранное фото + тёмный оверлей, иначе декоративные круги."""
    from lxml import etree
    layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(layout)
    W, H = prs.slide_width, prs.slide_height

    if img_path:
        # Фоновое изображение на весь слайд
        try:
            pic = slide.shapes.add_picture(img_path, 0, 0, W, H)
            # Перемещаем картинку на самый зад (z-order)
            slide.shapes._spTree.remove(pic._element)
            slide.shapes._spTree.insert(2, pic._element)
        except Exception as e:
            print(f"[extras] Не удалось вставить фон: {e}")
            img_path = None  # fallback ниже

    if not img_path:
        # Solid-цвет фон (fallback)
        _fill_rect(slide, 0, 0, W, H, colors["primary"])

        # Декоративные круги
        c1 = slide.shapes.add_shape(9, int(W * 0.68), int(-H * 0.12), int(H * 0.85), int(H * 0.85))
        c1.fill.solid()
        c1.fill.fore_color.rgb = hex_to_rgb(colors["accent"])
        c1.line.fill.background()
        spPr = c1._element.spPr
        fmtScheme = spPr.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}solidFill')
        if fmtScheme is not None:
            srgb = fmtScheme.find('{http://schemas.openxmlformats.org/drawingml/2006/main}srgbClr')
            if srgb is not None:
                alpha = etree.SubElement(srgb, '{http://schemas.openxmlformats.org/drawingml/2006/main}alpha')
                alpha.set('val', '18000')

        c2 = slide.shapes.add_shape(9, int(-H * 0.18), int(H * 0.65), int(H * 0.5), int(H * 0.5))
        c2.fill.solid()
        c2.fill.fore_color.rgb = hex_to_rgb(colors["accent"])
        c2.line.fill.background()
        spPr2 = c2._element.spPr
        fmtScheme2 = spPr2.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}solidFill')
        if fmtScheme2 is not None:
            srgb2 = fmtScheme2.find('{http://schemas.openxmlformats.org/drawingml/2006/main}srgbClr')
            if srgb2 is not None:
                alpha2 = etree.SubElement(srgb2, '{http://schemas.openxmlformats.org/drawingml/2006/main}alpha')
                alpha2.set('val', '15000')
    else:
        # Полупрозрачный тёмный оверлей поверх фото
        overlay = slide.shapes.add_shape(1, 0, 0, W, H)
        overlay.fill.solid()
        overlay.fill.fore_color.rgb = RGBColor(0x0D, 0x0B, 0x2E)
        overlay.line.fill.background()
        sp = overlay._element.spPr
        sf = sp.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}solidFill')
        if sf is not None:
            srgb = sf.find('{http://schemas.openxmlformats.org/drawingml/2006/main}srgbClr')
            if srgb is not None:
                a = etree.SubElement(srgb, '{http://schemas.openxmlformats.org/drawingml/2006/main}alpha')
                a.set('val', '60000')  # 60% opacity = 40% прозрачность

        # Цветная полоска снизу
        _fill_rect(slide, 0, int(H * 0.87), W, int(H * 0.13), colors["accent"])
        acc_bar = slide.shapes[-1]
        spb = acc_bar._element.spPr
        sfb = spb.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}solidFill')
        if sfb is not None:
            srgbb = sfb.find('{http://schemas.openxmlformats.org/drawingml/2006/main}srgbClr')
            if srgbb is not None:
                ab = etree.SubElement(srgbb, '{http://schemas.openxmlformats.org/drawingml/2006/main}alpha')
                ab.set('val', '75000')

    # Заголовок
    _add_textbox(slide, int(W*0.07), int(H*0.22), int(W*0.86), int(H*0.38),
                 data.get("title", ""), font_size=38, bold=True)

    # Подзаголовок
    _add_textbox(slide, int(W*0.07), int(H*0.64), int(W*0.66), int(H*0.16),
                 data.get("subtitle", ""), font_size=18, color="D4D4D4")

    # Данные студента
    if profile:
        parts = []
        if profile.get("fullName"): parts.append(str(profile["fullName"]))
        if profile.get("university"): parts.append(str(profile["university"]))
        if profile.get("groupNumber"): parts.append(f"Группа {profile['groupNumber']}")
        if parts:
            _add_textbox(slide, int(W*0.07), int(H*0.82), int(W*0.66), int(H*0.13),
                         " | ".join(parts), font_size=13, color="9A9AB0")


def _content_base(prs, colors, title_text):
    """Базовый контентный слайд: светлый фон + цветная шапка + боковой акцент."""
    layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(layout)
    W, H = prs.slide_width, prs.slide_height

    # Фон
    _fill_rect(slide, 0, 0, W, H, colors["bg"])
    # Шапка
    _fill_rect(slide, 0, 0, W, int(H * 0.165), colors["primary"])
    # Левый акцент
    _fill_rect(slide, 0, int(H*0.165), int(W*0.013), int(H*0.835), colors["accent"])

    # Заголовок
    _add_textbox(slide, int(W*0.04), int(H*0.025), int(W*0.92), int(H*0.13),
                 title_text, font_size=24, bold=True)

    return slide, W, H


def _slide_bullets(prs, data, colors):
    slide, W, H = _content_base(prs, colors, data.get("title", ""))
    points = data.get("points", [])

    tb = slide.shapes.add_textbox(int(W*0.06), int(H*0.2), int(W*0.9), int(H*0.76))
    tf = tb.text_frame
    tf.word_wrap = True

    for i, point in enumerate(points[:7]):
        p = tf.add_paragraph() if i > 0 else tf.paragraphs[0]
        p.space_before = Pt(7)
        run = p.add_run()
        run.text = f"▸  {point}"
        run.font.name = "Arial"
        run.font.size = Pt(19)
        run.font.color.rgb = hex_to_rgb(colors["text"])


def _slide_image_bullets(prs, data, colors, img_path=None):
    """Слайд: буллеты слева 58% + изображение справа 36%. Fallback на обычные буллеты."""
    slide, W, H = _content_base(prs, colors, data.get("title", ""))
    points = data.get("points", [])

    text_w = int(W * 0.56)
    tb = slide.shapes.add_textbox(int(W*0.06), int(H*0.2), text_w, int(H*0.76))
    tf = tb.text_frame
    tf.word_wrap = True

    for i, point in enumerate(points[:6]):
        p = tf.add_paragraph() if i > 0 else tf.paragraphs[0]
        p.space_before = Pt(7)
        run = p.add_run()
        run.text = f"▸  {point}"
        run.font.name = "Arial"
        run.font.size = Pt(18)
        run.font.color.rgb = hex_to_rgb(colors["text"])

    if img_path:
        try:
            img_left  = int(W * 0.64)
            img_top   = int(H * 0.20)
            img_width = int(W * 0.32)
            img_height = int(H * 0.72)
            pic = slide.shapes.add_picture(img_path, img_left, img_top, img_width, img_height)
            # Скруглённые края через XML
            from lxml import etree
            sp = pic._element
            spPr = sp.find('{http://schemas.openxmlformats.org/drawingml/2006/main}spPr')
            if spPr is not None:
                prstGeom = spPr.find('{http://schemas.openxmlformats.org/drawingml/2006/main}prstGeom')
                if prstGeom is not None:
                    prstGeom.set('prst', 'roundRect')
        except Exception as e:
            print(f"[extras] Не удалось вставить изображение в слайд: {e}")


def _slide_stats(prs, data, colors):
    slide, W, H = _content_base(prs, colors, data.get("title", ""))
    stats = data.get("stats", [])[:4]
    if not stats:
        return

    n = len(stats)
    col_w = int(W * 0.88 / n)
    start_x = int(W * 0.06)

    for i, stat in enumerate(stats):
        x = start_x + i * col_w
        # Big number
        tb_num = slide.shapes.add_textbox(x, int(H*0.28), col_w, int(H*0.32))
        tf = tb_num.text_frame
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        run = p.add_run()
        run.text = str(stat.get("num", "—"))
        run.font.name = "Arial"
        run.font.bold = True
        run.font.size = Pt(46)
        run.font.color.rgb = hex_to_rgb(colors["accent"])

        # Label
        tb_lbl = slide.shapes.add_textbox(x, int(H*0.6), col_w, int(H*0.28))
        tf2 = tb_lbl.text_frame
        tf2.word_wrap = True
        p2 = tf2.paragraphs[0]
        p2.alignment = PP_ALIGN.CENTER
        run2 = p2.add_run()
        run2.text = str(stat.get("label", ""))
        run2.font.name = "Arial"
        run2.font.size = Pt(15)
        run2.font.color.rgb = hex_to_rgb(colors["text"])


def _slide_columns(prs, data, colors):
    slide, W, H = _content_base(prs, colors, data.get("title", ""))
    columns = data.get("columns", [])[:3]
    if not columns:
        return

    n = len(columns)
    col_w = int(W * 0.9 / n)
    start_x = int(W * 0.05)

    for i, col in enumerate(columns):
        x = start_x + i * col_w
        # Column title
        tb_title = slide.shapes.add_textbox(x, int(H*0.2), col_w - int(W*0.015), int(H*0.1))
        tf = tb_title.text_frame
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = str(col.get("title", ""))
        run.font.name = "Arial"
        run.font.bold = True
        run.font.size = Pt(16)
        run.font.color.rgb = hex_to_rgb(colors["accent"])

        # Items
        tb_items = slide.shapes.add_textbox(x, int(H*0.32), col_w - int(W*0.015), int(H*0.62))
        tf2 = tb_items.text_frame
        tf2.word_wrap = True
        for j, item in enumerate(col.get("items", [])[:5]):
            p2 = tf2.add_paragraph() if j > 0 else tf2.paragraphs[0]
            p2.space_before = Pt(5)
            run2 = p2.add_run()
            run2.text = f"• {item}"
            run2.font.name = "Arial"
            run2.font.size = Pt(15)
            run2.font.color.rgb = hex_to_rgb(colors["text"])


def _slide_timeline(prs, data, colors):
    slide, W, H = _content_base(prs, colors, data.get("title", ""))
    events = data.get("events", [])[:6]

    tb = slide.shapes.add_textbox(int(W*0.06), int(H*0.2), int(W*0.9), int(H*0.76))
    tf = tb.text_frame
    tf.word_wrap = True

    for i, ev in enumerate(events):
        p = tf.add_paragraph() if i > 0 else tf.paragraphs[0]
        p.space_before = Pt(8)
        run = p.add_run()
        date_str = ev.get("date", "")
        text_str = ev.get("text", "")
        run.text = f"{date_str}  —  {text_str}" if date_str else text_str
        run.font.name = "Arial"
        run.font.size = Pt(17)
        run.font.color.rgb = hex_to_rgb(colors["text"])


def _slide_conclusion(prs, data, colors):
    slide, W, H = _content_base(prs, colors, data.get("title", "Заключение"))
    points = data.get("points", [])

    tb = slide.shapes.add_textbox(int(W*0.06), int(H*0.2), int(W*0.9), int(H*0.76))
    tf = tb.text_frame
    tf.word_wrap = True

    for i, point in enumerate(points[:6]):
        p = tf.add_paragraph() if i > 0 else tf.paragraphs[0]
        p.space_before = Pt(8)
        run = p.add_run()
        run.text = f"✓  {point}"
        run.font.name = "Arial"
        run.font.size = Pt(19)
        run.font.color.rgb = hex_to_rgb(colors["text"])


def _slide_sources(prs, data, colors):
    slide, W, H = _content_base(prs, colors, data.get("title", "Список источников"))
    sources = data.get("sources", [])[:9]

    tb = slide.shapes.add_textbox(int(W*0.06), int(H*0.2), int(W*0.9), int(H*0.76))
    tf = tb.text_frame
    tf.word_wrap = True

    for i, src in enumerate(sources):
        p = tf.add_paragraph() if i > 0 else tf.paragraphs[0]
        p.space_before = Pt(5)
        run = p.add_run()
        run.text = f"{i+1}. {src}"
        run.font.name = "Arial"
        run.font.size = Pt(14)
        run.font.color.rgb = hex_to_rgb(colors["text"])


def _slide_final(prs, data, colors):
    layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(layout)
    W, H = prs.slide_width, prs.slide_height

    _fill_rect(slide, 0, 0, W, H, colors["primary"])

    c = slide.shapes.add_shape(9, int(W*0.25), int(H*0.05), int(H*0.82), int(H*0.82))
    c.fill.solid()
    c.fill.fore_color.rgb = hex_to_rgb(colors["accent"])
    c.line.fill.background()
    from lxml import etree
    spPr = c._element.spPr
    sf = spPr.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}solidFill')
    if sf is not None:
        srgb = sf.find('{http://schemas.openxmlformats.org/drawingml/2006/main}srgbClr')
        if srgb is not None:
            a = etree.SubElement(srgb, '{http://schemas.openxmlformats.org/drawingml/2006/main}alpha')
            a.set('val', '20000')

    _add_textbox(slide, int(W*0.06), int(H*0.33), int(W*0.88), int(H*0.34),
                 data.get("title", "Спасибо за внимание!"),
                 font_size=42, bold=True, align=PP_ALIGN.CENTER)


# ── Основные функции ──────────────────────────────────────────────────────────

def generate_presentation(job_id: str, topic: str, work_type: str,
                          profile: dict, result: dict) -> str:
    """Генерирует PPTX-презентацию и сохраняет в /tmp/pptx_{job_id}.pptx."""

    # Собираем краткий текст работы для AI (лимит GitHub payload ~65KB)
    text_parts = []
    for section in result.get("structure", []):
        content = result.get("content", {}).get(section, "")
        content = re.sub(r'\[TABLE\].*?\[/TABLE\]', '', content, flags=re.DOTALL)
        text_parts.append(f"## {section}\n{content[:350]}")
    full_text = "\n\n".join(text_parts[:5])

    colors = _detect_color_scheme(topic)

    # Скачиваем изображение для обложки и первого буллет-слайда
    img_path = _fetch_image(topic)

    # AI — генерируем структуру слайдов
    prompt = f"""На основе этой работы создай структуру презентации из 10-12 слайдов.
Тема: {topic}
Тип работы: {work_type}

Фрагмент текста:
{full_text}

Верни ТОЛЬКО JSON (без ```json, без пояснений):
{{
  "slides": [
    {{"type": "title", "title": "...", "subtitle": "..."}},
    {{"type": "bullets", "title": "...", "points": ["...", "...", "...", "..."]}},
    {{"type": "stats", "title": "...", "stats": [{{"num": "...", "label": "..."}}, {{"num": "...", "label": "..."}}]}},
    {{"type": "bullets", "title": "...", "points": ["...", "...", "..."]}},
    {{"type": "columns", "title": "...", "columns": [{{"title": "...", "items": ["..."]}}, {{"title": "...", "items": ["..."]}}]}},
    {{"type": "timeline", "title": "...", "events": [{{"date": "...", "text": "..."}}, {{"date": "...", "text": "..."}}]}},
    {{"type": "bullets", "title": "...", "points": ["...", "...", "..."]}},
    {{"type": "conclusion", "title": "Выводы", "points": ["...", "...", "..."]}},
    {{"type": "sources", "title": "Список источников", "sources": ["...", "...", "..."]}},
    {{"type": "final", "title": "Спасибо за внимание!"}}
  ]
}}

Используй реальные данные из текста. Создай ровно 10-12 разных слайдов."""

    raw = _ask(prompt, max_tokens=2500)

    # Извлекаем JSON
    match = re.search(r'\{[\s\S]*\}', raw)
    if not match:
        raise ValueError("AI не вернул JSON для структуры слайдов")
    slides_data = json.loads(match.group())
    slides = slides_data.get("slides", [])
    if not slides:
        raise ValueError("Список слайдов пустой")

    # Создаём презентацию
    prs = PPTXPresentation()
    prs.slide_width  = Inches(13.33)
    prs.slide_height = Inches(7.5)

    # Первый bullets-слайд получит изображение, остальные — нет
    _first_bullets_done = [False]

    def _bullets_slide(d):
        if img_path and not _first_bullets_done[0]:
            _first_bullets_done[0] = True
            _slide_image_bullets(prs, d, colors, img_path)
        else:
            _slide_bullets(prs, d, colors)

    dispatch = {
        "title":      lambda d: _slide_title(prs, d, colors, profile or {}, img_path),
        "bullets":    _bullets_slide,
        "stats":      lambda d: _slide_stats(prs, d, colors),
        "columns":    lambda d: _slide_columns(prs, d, colors),
        "timeline":   lambda d: _slide_timeline(prs, d, colors),
        "conclusion": lambda d: _slide_conclusion(prs, d, colors),
        "sources":    lambda d: _slide_sources(prs, d, colors),
        "final":      lambda d: _slide_final(prs, d, colors),
    }

    for slide_info in slides:
        stype = slide_info.get("type", "bullets")
        fn = dispatch.get(stype, _bullets_slide)
        fn(slide_info)

    output = f"/tmp/pptx_{job_id}.pptx"
    prs.save(output)

    # Удаляем временный файл с изображением
    if img_path:
        try:
            os.unlink(img_path)
        except Exception:
            pass
    print(f"[extras] Презентация сохранена: {output} ({len(slides)} слайдов)")
    return output


def generate_speech(job_id: str, topic: str, work_type: str, result: dict) -> str:
    """Генерирует текст выступления и сохраняет в /tmp/speech_{job_id}.docx."""

    # Собираем краткий текст (лимит GitHub payload ~65KB)
    text_parts = []
    for section in result.get("structure", []):
        content = result.get("content", {}).get(section, "")
        content = re.sub(r'\[TABLE\].*?\[/TABLE\]', '', content, flags=re.DOTALL)
        text_parts.append(f"## {section}\n{content[:350]}")
    full_text = "\n\n".join(text_parts[:5])

    prompt = f"""На основе этой работы напиши текст выступления для публичной защиты на 3-5 минут (450-600 слов).
Тема: «{topic}», тип работы: {work_type}.
Строго следуй структуре работы. Начало каждого раздела: «На первом слайде...», «Переходя к следующему слайду...» и т.д.
Академический стиль, уверенный тон. Только текст — без заголовков, без нумерации, без разметки.

Фрагмент работы:
{full_text}"""

    speech_text = _ask(prompt, max_tokens=1400)

    # Создаём DOCX
    doc = Document()
    sec = doc.sections[0]
    sec.left_margin  = Cm(3)
    sec.right_margin = Cm(1.5)
    sec.top_margin   = Cm(2)
    sec.bottom_margin = Cm(2)

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
        p.paragraph_format.first_line_indent = Cm(1.25)
        p.paragraph_format.space_after = DocPt(0)
        run = p.add_run(line)
        run.font.name = "Times New Roman"
        run.font.size = DocPt(14)

    output = f"/tmp/speech_{job_id}.docx"
    doc.save(output)
    print(f"[extras] Текст выступления сохранён: {output}")
    return output
