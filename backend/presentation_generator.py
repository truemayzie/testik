"""
presentation_generator.py — генерация презентации и текста выступления.
Использует тот же Claude-прокси что и generator.py.
"""

import os
import re
import json
import tempfile
import random

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


def _detect_category(topic: str) -> str:
    t = topic.lower()
    if any(k in t for k in ['война', 'история', 'революция', 'политика', 'империя', 'средневек', 'древн', 'цивилизац']):
        return 'history'
    if any(k in t for k in ['экология', 'природа', 'биология', 'климат', 'окружающ', 'лес', 'животн', 'растен']):
        return 'ecology'
    if any(k in t for k in ['программирован', 'it', 'технологи', 'алгоритм', 'блокчейн', 'компьютер', 'цифров', 'искусствен', 'нейронн', 'робот']):
        return 'tech'
    if any(k in t for k in ['экономик', 'финанс', 'бизнес', 'маркетинг', 'банк', 'рынок', 'торговл']):
        return 'economy'
    if any(k in t for k in ['медицин', 'здоровье', 'биохими', 'анатоми', 'фармако', 'болезн', 'лечени']):
        return 'medicine'
    if any(k in t for k in ['физик', 'хими', 'математик', 'астроном', 'квантов', 'молекул', 'атом']):
        return 'science'
    if any(k in t for k in ['психологи', 'педагогик', 'воспитани', 'социологи', 'личность', 'поведени', 'искусств', 'культур', 'архитект', 'живопис']):
        return 'art'
    return 'default'


_CATEGORY_ACCENTS = {
    'tech':     '2196F3',
    'ecology':  '4CAF50',
    'economy':  '1565C0',
    'medicine': '00897B',
    'history':  '795548',
    'science':  '7B1FA2',
    'art':      'E91E63',
    'default':  '3B82F6',
}

_TOPIC_KEYWORDS = {
    'tech':     'technology artificial intelligence digital innovation',
    'ecology':  'nature environment ecology forest',
    'economy':  'business finance economy market',
    'medicine': 'medicine health doctor hospital',
    'history':  'history ancient civilization monument',
    'science':  'science laboratory research experiment',
    'art':      'art museum culture creative',
    'default':  'education knowledge university study',
}


def _detect_color_scheme(topic: str) -> dict:
    cat = _detect_category(topic)
    accent = _CATEGORY_ACCENTS.get(cat, _CATEGORY_ACCENTS['default'])
    return {
        "primary":      "0F172A",  # единый тёмный фон
        "accent":       accent,    # акцент — по категории
        "bg":           "F8FAFC",  # светлый фон контентных слайдов
        "text":         "1E293B",  # тёмный текст на светлом фоне
        "text_on_dark": "E2E8F0",  # светлый текст на тёмном фоне
    }


_IMG_UA = "refai-bot/1.0 (https://ref-ai.ru; support@ref-ai.ru)"


def _save_image(content: bytes, content_type: str) -> str:
    """Сохраняет байты изображения во временный файл, возвращает путь."""
    suffix = '.png' if 'png' in content_type else '.jpg'
    f = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    f.write(content)
    f.close()
    return f.name


def _download_img(url: str, headers: dict, timeout: int) -> "bytes | None":
    """Скачивает URL, возвращает bytes или None."""
    r = _req.get(url, headers=headers, timeout=timeout)
    print(f"[img]   GET {url[:80]} → статус={r.status_code}, размер={len(r.content)} б")
    if r.status_code == 200 and len(r.content) > 2_000:
        return r.content, r.headers.get('content-type', '')
    return None, None


def _wiki_pageimage(api: str, title: str, headers: dict) -> "str | None":
    """Запрашивает thumbnail статьи Wikipedia, возвращает URL или None."""
    ir = _req.get(api, params={
        'action': 'query', 'titles': title,
        'prop': 'pageimages', 'format': 'json', 'pithumbsize': 1280,
    }, headers=headers, timeout=6).json()
    for page in ir.get('query', {}).get('pages', {}).values():
        url = page.get('thumbnail', {}).get('source')
        if url:
            return url
    return None


def _fetch_image(topic: str, timeout: int = 8) -> "str | None":
    """
    Скачивает изображение по теме. Возвращает путь к временному файлу или None.

    Цепочка источников:
      1. Unsplash Source  (часто 503 из РФ — короткий таймаут 5 с)
      2. Wikipedia RU     (opensearch + pageimages + langlinks→EN в одном запросе)
         2а. Если у RU-статьи есть thumbnail — используем его
         2б. Если нет thumbnail, но есть EN interwiki — берём EN thumbnail
      3. Wikipedia EN     (opensearch с ключевыми словами темы — работает для латиницы)
    """
    H = {'User-Agent': _IMG_UA}
    kw = re.sub(r'[^\w\s]', '', topic.lower()).split()[:3]

    # ── 1. Unsplash Source ────────────────────────────────────────────────────
    try:
        query = '+'.join(kw) if kw else 'education'
        url = f"https://source.unsplash.com/1280x720/?{query}"
        print(f"[img] 1/3 Unsplash: {url}")
        r = _req.get(url, timeout=5, allow_redirects=True)
        print(f"[img]   статус={r.status_code}, размер={len(r.content)} б")
        if r.status_code == 200 and len(r.content) > 8_000:
            path = _save_image(r.content, r.headers.get('content-type', ''))
            print(f"[img] ✓ Unsplash OK → {path}")
            return path
        print(f"[img]   Unsplash не подошёл")
    except Exception as e:
        print(f"[img]   Unsplash недоступен: {type(e).__name__}: {e}")

    # ── 2. Wikipedia RU (pageimages + langlinks одним запросом) ──────────────
    try:
        api_ru = "https://ru.wikipedia.org/w/api.php"
        print(f"[img] 2/3 Wikipedia RU: ищем '{topic[:50]}'")

        sr = _req.get(api_ru, params={
            'action': 'opensearch', 'search': topic[:60],
            'limit': 1, 'format': 'json',
        }, headers=H, timeout=6).json()

        if len(sr) > 1 and sr[1]:
            ru_title = sr[1][0]
            print(f"[img]   статья RU → '{ru_title}'")

            # Запрашиваем thumbnail и EN langlink одним запросом
            ir = _req.get(api_ru, params={
                'action': 'query', 'titles': ru_title,
                'prop': 'pageimages|langlinks', 'format': 'json',
                'pithumbsize': 1280, 'lllang': 'en', 'lllimit': 1,
            }, headers=H, timeout=6).json()

            for page in ir.get('query', {}).get('pages', {}).values():
                ru_thumb = page.get('thumbnail', {}).get('source')
                en_title = None
                ll = page.get('langlinks')
                if ll:
                    en_title = ll[0].get('*')

                if ru_thumb:
                    print(f"[img]   RU thumbnail найден: {ru_thumb[:70]}")
                    content, ct = _download_img(ru_thumb, H, timeout)
                    if content:
                        path = _save_image(content, ct)
                        print(f"[img] ✓ Wikipedia RU OK → {path}")
                        return path

                if en_title:
                    print(f"[img]   RU thumbnail нет, пробуем EN: '{en_title}'")
                    en_thumb = _wiki_pageimage(
                        "https://en.wikipedia.org/w/api.php", en_title, H)
                    if en_thumb:
                        print(f"[img]   EN thumbnail: {en_thumb[:70]}")
                        content, ct = _download_img(en_thumb, H, timeout)
                        if content:
                            path = _save_image(content, ct)
                            print(f"[img] ✓ Wikipedia EN (via langlink) OK → {path}")
                            return path

                print(f"[img]   RU: нет thumbnail и нет EN langlink")
        else:
            print(f"[img]   RU: статья не найдена")

    except Exception as e:
        print(f"[img]   Wikipedia RU ошибка: {type(e).__name__}: {e}")

    # ── 3. Wikipedia EN напрямую (для тем с латиницей / числами) ─────────────
    try:
        api_en = "https://en.wikipedia.org/w/api.php"
        search_en = ' '.join(kw)
        print(f"[img] 3/3 Wikipedia EN: ищем '{search_en}'")

        sr = _req.get(api_en, params={
            'action': 'opensearch', 'search': search_en,
            'limit': 1, 'format': 'json',
        }, headers=H, timeout=6).json()

        if len(sr) > 1 and sr[1]:
            en_title = sr[1][0]
            print(f"[img]   статья EN → '{en_title}'")
            en_thumb = _wiki_pageimage(api_en, en_title, H)
            if en_thumb:
                print(f"[img]   EN thumbnail: {en_thumb[:70]}")
                content, ct = _download_img(en_thumb, H, timeout)
                if content:
                    path = _save_image(content, ct)
                    print(f"[img] ✓ Wikipedia EN OK → {path}")
                    return path
            print(f"[img]   EN: статья '{en_title}' без thumbnail")
        else:
            print(f"[img]   EN: статья не найдена")

    except Exception as e:
        print(f"[img]   Wikipedia EN ошибка: {type(e).__name__}: {e}")

    # ── 4. Pixabay (запасной вариант, требует API-ключ) ───────────────────────
    pixabay_key = os.environ.get("PIXABAY_API_KEY", "")
    if pixabay_key:
        try:
            cat = _detect_category(topic)
            query_en = _TOPIC_KEYWORDS.get(cat, _TOPIC_KEYWORDS['default'])
            print(f"[img] 4/4 Pixabay: ищем '{query_en}' (категория: {cat})")
            r = _req.get("https://pixabay.com/api/", params={
                'key': pixabay_key,
                'q': query_en,
                'image_type': 'photo',
                'orientation': 'horizontal',
                'min_width': 1280,
                'per_page': 3,
                'safesearch': 'true',
                'editors_choice': 'true',
            }, timeout=8)
            print(f"[img]   Pixabay: статус={r.status_code}")
            if r.status_code == 200:
                hits = r.json().get('hits', [])
                if hits:
                    chosen = random.choice(hits)
                    img_url = chosen.get('largeImageURL') or chosen.get('webformatURL')
                    print(f"[img]   Pixabay: URL={img_url[:70]}")
                    content, ct = _download_img(img_url, H, timeout)
                    if content:
                        path = _save_image(content, ct)
                        print(f"[img] ✓ Pixabay OK → {path}")
                        return path
                else:
                    print(f"[img]   Pixabay: нет результатов editors_choice, пробуем без фильтра")
                    # Повторный запрос без editors_choice
                    r2 = _req.get("https://pixabay.com/api/", params={
                        'key': pixabay_key,
                        'q': query_en,
                        'image_type': 'photo',
                        'orientation': 'horizontal',
                        'min_width': 1280,
                        'per_page': 3,
                        'safesearch': 'true',
                    }, timeout=8)
                    hits2 = r2.json().get('hits', []) if r2.status_code == 200 else []
                    if hits2:
                        chosen2 = random.choice(hits2)
                        img_url2 = chosen2.get('largeImageURL') or chosen2.get('webformatURL')
                        content2, ct2 = _download_img(img_url2, H, timeout)
                        if content2:
                            path = _save_image(content2, ct2)
                            print(f"[img] ✓ Pixabay (no filter) OK → {path}")
                            return path
        except Exception as e:
            print(f"[img]   Pixabay ошибка: {type(e).__name__}: {e}")

    print("[img] Все источники исчерпаны — презентация без фонового изображения")
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
    """Титульный слайд: тёмный фон, левая колонка (60%) — текст, правая (40%) — фото или декор."""
    from lxml import etree
    layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(layout)
    W, H = prs.slide_width, prs.slide_height

    # Тёмный фон на весь слайд
    _fill_rect(slide, 0, 0, W, H, colors["primary"])

    left_w  = int(W * 0.60)
    right_x = int(W * 0.61)
    right_w = int(W * 0.39)

    # Правая панель: фото или акцентный декоративный блок
    if img_path:
        try:
            slide.shapes.add_picture(img_path, right_x, 0, right_w, H)
        except Exception as e:
            print(f"[extras] Не удалось вставить фото в титульник: {e}")
            img_path = None

    if not img_path:
        # Декоративный блок — акцентный цвет с низкой прозрачностью
        deco = _fill_rect(slide, right_x, 0, right_w, H, colors["accent"])
        spPr = deco._element.spPr
        sf = spPr.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}solidFill')
        if sf is not None:
            srgb = sf.find('{http://schemas.openxmlformats.org/drawingml/2006/main}srgbClr')
            if srgb is not None:
                a = etree.SubElement(srgb, '{http://schemas.openxmlformats.org/drawingml/2006/main}alpha')
                a.set('val', '22000')  # ~22% непрозрачность

    # Тонкая вертикальная разделительная полоска (акцент)
    _fill_rect(slide, left_w, 0, int(W * 0.006), H, colors["accent"])

    # Подзаголовок / категория (маленький, акцентный цвет)
    subtitle = data.get("subtitle", "")
    if subtitle:
        _add_textbox(slide, int(W*0.07), int(H*0.18), int(left_w * 0.88), int(H*0.09),
                     subtitle, font_size=14, color=colors["accent"])

    # Горизонтальная разделительная линия под подзаголовком
    _fill_rect(slide, int(W*0.07), int(H*0.30), int(left_w * 0.72), int(H * 0.005), colors["accent"])

    # Заголовок (крупный, белый)
    _add_textbox(slide, int(W*0.07), int(H*0.33), int(left_w * 0.90), int(H*0.40),
                 data.get("title", ""), font_size=36, bold=True, color="E2E8F0")

    # Данные студента
    if profile:
        parts = []
        if profile.get("fullName"):    parts.append(str(profile["fullName"]))
        if profile.get("university"):  parts.append(str(profile["university"]))
        if profile.get("groupNumber"): parts.append(f"Группа {profile['groupNumber']}")
        if parts:
            _add_textbox(slide, int(W*0.07), int(H*0.76), int(left_w * 0.88), int(H*0.14),
                         " | ".join(parts), font_size=13, color="94A3B8")


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
        p.space_before = Pt(8)
        run = p.add_run()
        run.text = f"▸  {point}"
        run.font.name = "Arial"
        run.font.size = Pt(20)
        run.font.color.rgb = hex_to_rgb(colors["text"])


def _slide_image_bullets(prs, data, colors, img_path=None):
    """Слайд: буллеты слева 58% + изображение справа 36%. Без placeholder если нет фото."""
    if not img_path:
        _slide_bullets(prs, data, colors)
        return

    slide, W, H = _content_base(prs, colors, data.get("title", ""))
    points = data.get("points", [])

    text_w = int(W * 0.54)
    tb = slide.shapes.add_textbox(int(W*0.06), int(H*0.2), text_w, int(H*0.76))
    tf = tb.text_frame
    tf.word_wrap = True

    for i, point in enumerate(points[:6]):
        p = tf.add_paragraph() if i > 0 else tf.paragraphs[0]
        p.space_before = Pt(8)
        run = p.add_run()
        run.text = f"▸  {point}"
        run.font.name = "Arial"
        run.font.size = Pt(18)
        run.font.color.rgb = hex_to_rgb(colors["text"])

    try:
        img_left   = int(W * 0.63)
        img_top    = int(H * 0.19)
        img_width  = int(W * 0.34)
        img_height = int(H * 0.73)
        slide.shapes.add_picture(img_path, img_left, img_top, img_width, img_height)
    except Exception as e:
        print(f"[extras] Не удалось вставить изображение в слайд: {e}")


def _slide_stats(prs, data, colors):
    """Слайд статистики: тёмный фон, карточки 1E3A5F, крупные акцентные числа."""
    layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(layout)
    W, H = prs.slide_width, prs.slide_height

    # Тёмный фон
    _fill_rect(slide, 0, 0, W, H, colors["primary"])
    # Тонкая акцентная полоска сверху
    _fill_rect(slide, 0, 0, W, int(H * 0.008), colors["accent"])

    # Заголовок
    _add_textbox(slide, int(W*0.06), int(H*0.06), int(W*0.88), int(H*0.14),
                 data.get("title", ""), font_size=26, bold=True, color="E2E8F0")

    stats = data.get("stats", [])[:4]
    if not stats:
        return

    n = len(stats)
    padding = int(W * 0.05)
    gap = int(W * 0.025)
    card_w = int((W - 2 * padding - gap * (n - 1)) / n)
    card_h = int(H * 0.54)
    card_top = int(H * 0.28)

    for i, stat in enumerate(stats):
        x = padding + i * (card_w + gap)
        # Карточка (тёмно-синий фон)
        _fill_rect(slide, x, card_top, card_w, card_h, "1E3A5F")
        # Левая акцентная полоска карточки
        _fill_rect(slide, x, card_top, int(W * 0.005), card_h, colors["accent"])

        # Крупная цифра
        tb_num = slide.shapes.add_textbox(x, card_top + int(card_h * 0.10),
                                           card_w, int(card_h * 0.52))
        tf = tb_num.text_frame
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        run = p.add_run()
        run.text = str(stat.get("num", "—"))
        run.font.name = "Arial"
        run.font.bold = True
        run.font.size = Pt(52)
        run.font.color.rgb = hex_to_rgb(colors["accent"])

        # Подпись
        tb_lbl = slide.shapes.add_textbox(x, card_top + int(card_h * 0.65),
                                           card_w, int(card_h * 0.32))
        tf2 = tb_lbl.text_frame
        tf2.word_wrap = True
        p2 = tf2.paragraphs[0]
        p2.alignment = PP_ALIGN.CENTER
        run2 = p2.add_run()
        run2.text = str(stat.get("label", ""))
        run2.font.name = "Arial"
        run2.font.size = Pt(14)
        run2.font.color.rgb = hex_to_rgb("94A3B8")


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


def _slide_final(prs, data, colors, profile=None):
    """Финальный слайд: тёмный фон, белый крупный текст, акцентный подзаголовок, ФИО снизу."""
    layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(layout)
    W, H = prs.slide_width, prs.slide_height

    # Тёмный фон
    _fill_rect(slide, 0, 0, W, H, colors["primary"])

    # Горизонтальная акцентная линия (по центру, выше заголовка)
    _fill_rect(slide, int(W*0.30), int(H*0.34), int(W*0.40), int(H*0.005), colors["accent"])

    # Основной текст
    _add_textbox(slide, int(W*0.06), int(H*0.37), int(W*0.88), int(H*0.30),
                 data.get("title", "Спасибо за внимание!"),
                 font_size=48, bold=True, color="E2E8F0", align=PP_ALIGN.CENTER)

    # Подзаголовок (акцентный цвет)
    subtitle = data.get("subtitle", "")
    if subtitle:
        _add_textbox(slide, int(W*0.10), int(H*0.67), int(W*0.80), int(H*0.12),
                     subtitle, font_size=18, color=colors["accent"], align=PP_ALIGN.CENTER)

    # ФИО студента
    if profile and profile.get("fullName"):
        _add_textbox(slide, int(W*0.06), int(H*0.84), int(W*0.88), int(H*0.10),
                     str(profile["fullName"]),
                     font_size=14, color="64748B", align=PP_ALIGN.CENTER)


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
        "final":      lambda d: _slide_final(prs, d, colors, profile),
    }

    # Реальные источники из реферата (до 6 штук, иначе не влезут на слайд)
    real_sources = [s for s in result.get("sources", []) if isinstance(s, str) and s.strip()][:6]

    for slide_info in slides:
        stype = slide_info.get("type", "bullets")
        # Слайд sources: подставляем реальные источники или пропускаем
        if stype == "sources":
            if len(real_sources) < 2:
                continue  # не генерируем слайд без источников
            slide_info = dict(slide_info, sources=real_sources)
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

    # Собираем заголовки слайдов для передачи в generate_speech
    slide_titles = [
        s.get("title", "")
        for s in slides
        if s.get("type") not in ("sources", "final") and s.get("title")
    ]
    print(f"[extras] Презентация сохранена: {output} ({len(slides)} слайдов)")
    return output, slide_titles


def generate_speech(job_id: str, topic: str, work_type: str, result: dict,
                    slide_titles: "list[str] | None" = None) -> str:
    """Генерирует текст выступления и сохраняет в /tmp/speech_{job_id}.docx."""

    # Собираем краткий текст (лимит GitHub payload ~65KB)
    text_parts = []
    for section in result.get("structure", []):
        content = result.get("content", {}).get(section, "")
        content = re.sub(r'\[TABLE\].*?\[/TABLE\]', '', content, flags=re.DOTALL)
        text_parts.append(f"## {section}\n{content[:400]}")
    full_text = "\n\n".join(text_parts[:6])

    if slide_titles and len(slide_titles) >= 2:
        # Нумерованный список заголовков слайдов для привязки текста
        slides_block = "\n".join(
            f"  Слайд {i+1}: {t}" for i, t in enumerate(slide_titles)
        )
        prompt = f"""Напиши текст выступления для защиты {work_type.lower()} на 3-5 минут (450-600 слов).
Тема: «{topic}»

Структура презентации ({len(slide_titles)} слайдов):
{slides_block}

Требования:
— Текст разбит по слайдам: каждый блок начинается с «Слайд N.» (N — номер)
— Каждый блок: 3-4 конкретных предложения, опираясь на содержание этого слайда
— Переходы конкретные: называй заголовок следующего слайда, например:
  «Переходим к следующему слайду — [заголовок следующего слайда].»
— Используй конкретные факты, цифры и имена из текста работы, не общие фразы
— Академический стиль, уверенный тон
— Только текст, никаких заголовков секций и никакой разметки, кроме «Слайд N.»

Фрагмент работы:
{full_text}"""
    else:
        # Fallback — нет слайдов, генерируем по структуре работы
        prompt = f"""Напиши текст выступления для защиты {work_type.lower()} на 3-5 минут (450-600 слов).
Тема: «{topic}»
Строго следуй структуре работы. Используй конкретные факты и цифры из текста.
Академический стиль, уверенный тон. Только текст — без заголовков и разметки.

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
