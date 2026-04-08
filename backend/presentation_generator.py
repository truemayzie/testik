"""
presentation_generator.py — генерация презентации и текста выступления.
Редизайн: современный минимализм, чёткая типографика, правильные параграфы.
"""

import os
import re
import json
import tempfile
import random
import subprocess
import tempfile as _tempfile
from lxml import etree

import requests as _req

from pptx import Presentation as PPTXPresentation
from pptx.util import Inches, Pt, Emu, Cm
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.oxml.ns import qn

from docx import Document
from docx.shared import Pt as DocPt, Cm as DocCm
from docx.enum.text import WD_ALIGN_PARAGRAPH

from generator import ask as _ask

# ── Константы дизайна ────────────────────────────────────────────────────────

FONT_DISPLAY = "Calibri Light"   # заголовки
FONT_BODY    = "Calibri"         # текст

# Тёмная тема
DARK_BG      = "080D1A"  # почти чёрно-синий фон
DARK_SURFACE = "111827"  # поверхность карточек
DARK_BORDER  = "1E2D45"  # граница карточек

# Светлая тема
LIGHT_BG     = "F5F7FA"  # фон контентных слайдов
LIGHT_CARD   = "FFFFFF"  # белые карточки
LIGHT_TEXT   = "111827"  # основной текст
MUTED_TEXT   = "6B7280"  # серый текст

# ── Утилиты ──────────────────────────────────────────────────────────────────

def hex_to_rgb(hex_str: str) -> RGBColor:
    r = int(hex_str[0:2], 16)
    g = int(hex_str[2:4], 16)
    b = int(hex_str[4:6], 16)
    return RGBColor(r, g, b)


def _fill_rect(slide, left, top, width, height, hex_color):
    """Заливка прямоугольника."""
    shape = slide.shapes.add_shape(1, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = hex_to_rgb(hex_color)
    shape.line.fill.background()
    return shape


def _add_textbox(slide, left, top, width, height,
                 text, font_name=FONT_BODY, font_size=18,
                 bold=False, color="FFFFFF",
                 align=PP_ALIGN.LEFT, word_wrap=True,
                 space_before=0, space_after=0, line_spacing=None):
    """Добавляет текстовый блок с полным контролем типографики."""
    tb = slide.shapes.add_textbox(left, top, width, height)
    tf = tb.text_frame
    tf.word_wrap = word_wrap
    tf.auto_size = None
    p = tf.paragraphs[0]
    p.alignment = align
    if space_before:
        p.space_before = Pt(space_before)
    if space_after:
        p.space_after = Pt(space_after)
    if line_spacing:
        p.line_spacing = Pt(line_spacing)
    run = p.add_run()
    run.text = text
    run.font.name = font_name
    run.font.size = Pt(font_size)
    run.font.bold = bold
    run.font.color.rgb = hex_to_rgb(color)
    return tb


def _set_transparency(shape, alpha_pct: int):
    """Устанавливает прозрачность заливки (alpha_pct: 0=прозрачный, 100=непрозрачный)."""
    sp = shape._element.spPr
    sf = sp.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}solidFill')
    if sf is None:
        return
    srgb = sf.find('{http://schemas.openxmlformats.org/drawingml/2006/main}srgbClr')
    if srgb is None:
        return
    for old in srgb.findall('{http://schemas.openxmlformats.org/drawingml/2006/main}alpha'):
        srgb.remove(old)
    a = etree.SubElement(srgb, '{http://schemas.openxmlformats.org/drawingml/2006/main}alpha')
    a.set('val', str(int(alpha_pct * 1000)))


def _add_bullets_box(slide, left, top, width, height,
                     points, font_size=19, color=LIGHT_TEXT,
                     bullet_char="→", accent_color=None,
                     line_spacing_pt=28):
    """
    Один textbox с параграфами — правильный способ делать буллеты в pptx.
    Все пункты в одном фрейме, корректные отступы и межстрочный интервал.
    """
    tb = slide.shapes.add_textbox(left, top, width, height)
    tf = tb.text_frame
    tf.word_wrap = True

    for i, point in enumerate(points):
        p = tf.add_paragraph() if i > 0 else tf.paragraphs[0]
        p.alignment = PP_ALIGN.LEFT
        p.space_before = Pt(4)
        p.space_after = Pt(4)
        p.line_spacing = Pt(line_spacing_pt)

        if accent_color:
            run_bullet = p.add_run()
            run_bullet.text = bullet_char + "  "
            run_bullet.font.name = FONT_BODY
            run_bullet.font.size = Pt(font_size)
            run_bullet.font.bold = True
            run_bullet.font.color.rgb = hex_to_rgb(accent_color)

        run_text = p.add_run()
        run_text.text = str(point)
        run_text.font.name = FONT_BODY
        run_text.font.size = Pt(font_size)
        run_text.font.color.rgb = hex_to_rgb(color)

    return tb


def _add_slide_number(slide, W, H, n, accent):
    """Номер слайда — правый нижний угол."""
    _add_textbox(slide, int(W * 0.90), int(H * 0.93), int(W * 0.08), int(H * 0.05),
                 str(n), font_size=11, color=accent, align=PP_ALIGN.RIGHT)


# ── Категории и цветовые схемы ───────────────────────────────────────────────

def _detect_category(topic: str) -> str:
    t = topic.lower()
    if any(k in t for k in ['война', 'история', 'революция', 'политика', 'империя',
                              'средневек', 'древн', 'цивилизац']):
        return 'history'
    if any(k in t for k in ['экология', 'природа', 'биология', 'климат', 'окружающ',
                              'лес', 'животн', 'растен']):
        return 'ecology'
    if any(k in t for k in ['программирован', 'it', 'технологи', 'алгоритм', 'блокчейн',
                              'компьютер', 'цифров', 'искусствен', 'нейронн', 'робот']):
        return 'tech'
    if any(k in t for k in ['экономик', 'финанс', 'бизнес', 'маркетинг', 'банк',
                              'рынок', 'торговл']):
        return 'economy'
    if any(k in t for k in ['медицин', 'здоровье', 'биохими', 'анатоми', 'фармако',
                              'болезн', 'лечени']):
        return 'medicine'
    if any(k in t for k in ['физик', 'хими', 'математик', 'астроном', 'квантов',
                              'молекул', 'атом']):
        return 'science'
    if any(k in t for k in ['психологи', 'педагогик', 'воспитани', 'социологи',
                              'личность', 'поведени', 'искусств', 'культур',
                              'архитект', 'живопис']):
        return 'art'
    return 'default'


_ACCENTS = {
    'tech':     '3B82F6',
    'ecology':  '22C55E',
    'economy':  'F59E0B',
    'medicine': '06B6D4',
    'history':  'D97706',
    'science':  'A855F7',
    'art':      'EC4899',
    'default':  '6366F1',
}

_TOPIC_KEYWORDS = {
    'tech':     'technology digital innovation',
    'ecology':  'nature environment ecology',
    'economy':  'business finance economy',
    'medicine': 'medicine health science',
    'history':  'history ancient monument',
    'science':  'science research laboratory',
    'art':      'art museum culture creative',
    'default':  'education university knowledge',
}


def _detect_color_scheme(topic: str) -> dict:
    cat = _detect_category(topic)
    accent = _ACCENTS.get(cat, _ACCENTS['default'])
    return {
        "primary":  DARK_BG,
        "surface":  DARK_SURFACE,
        "accent":   accent,
        "bg":       LIGHT_BG,
        "card":     LIGHT_CARD,
        "text":     LIGHT_TEXT,
        "muted":    MUTED_TEXT,
        "on_dark":  "E8ECF4",
        "cat":      cat,
    }


# ── Загрузка изображений ─────────────────────────────────────────────────────

_IMG_UA = "refai-bot/1.0 (https://ref-ai.ru)"

_RU_TO_EN = {
    'история': 'history', 'война': 'war battle', 'революция': 'revolution',
    'империя': 'empire ancient', 'средневек': 'medieval castle',
    'древн': 'ancient civilization', 'цивилизац': 'civilization ruins',
    'рим': 'ancient rome colosseum', 'греци': 'ancient greece',
    'египет': 'ancient egypt pyramid', 'монгол': 'mongol steppe',
    'программирован': 'programming code', 'алгоритм': 'algorithm data',
    'нейронн': 'neural network ai', 'искусствен': 'artificial intelligence',
    'блокчейн': 'blockchain technology', 'компьютер': 'computer technology',
    'робот': 'robotics automation', 'цифров': 'digital technology',
    'интернет': 'internet network', 'кибербезопасн': 'cybersecurity',
    'экологи': 'ecology nature', 'природа': 'nature landscape',
    'климат': 'climate change', 'лес': 'forest trees',
    'океан': 'ocean sea', 'животн': 'wildlife animals',
    'загрязнен': 'pollution environment', 'зелен': 'green sustainable',
    'экономик': 'economy finance', 'финанс': 'finance money',
    'бизнес': 'business corporate', 'маркетинг': 'marketing strategy',
    'банк': 'banking finance', 'рынок': 'stock market trading',
    'торговл': 'trade commerce', 'инвестиц': 'investment growth',
    'медицин': 'medicine hospital', 'здоровье': 'health wellness',
    'биохими': 'biochemistry laboratory', 'анатоми': 'anatomy medical',
    'болезн': 'disease medical research', 'фармако': 'pharmacy medicine',
    'вирус': 'virus microscope', 'хирурги': 'surgery medical',
    'физик': 'physics science', 'хими': 'chemistry laboratory',
    'математик': 'mathematics geometry', 'астроном': 'astronomy space',
    'квантов': 'quantum physics', 'биологи': 'biology science',
    'геологи': 'geology earth', 'молекул': 'molecule structure',
    'искусств': 'art museum', 'культур': 'culture heritage',
    'архитект': 'architecture building', 'живопис': 'painting art',
    'музык': 'music concert', 'кино': 'cinema film',
    'театр': 'theater performance', 'литератур': 'literature books',
    'психологи': 'psychology mind', 'педагогик': 'education teaching',
    'социологи': 'society community', 'личность': 'personality human',
    'образован': 'education university', 'политик': 'politics government',
    'право': 'law justice', 'спорт': 'sport athletic',
    'город': 'city urban', 'транспорт': 'transport infrastructure',
    'энергетик': 'energy power', 'сельск': 'agriculture farm',
}


def _topic_to_english(topic: str) -> list:
    t = topic.lower()
    matched = []
    for ru_kw, en_kw in _RU_TO_EN.items():
        if ru_kw in t:
            matched.append(en_kw)
        if len(matched) >= 4:
            break

    if not matched:
        matched = ['education university', 'knowledge study', 'academic research']

    queries = [matched[0]]
    if len(matched) >= 2:
        queries.append(matched[1])
    else:
        queries.append(f"{matched[0].split()[0]} background")
    if len(matched) >= 3:
        queries.append(matched[2])
    else:
        cat = _detect_category(topic)
        queries.append(_TOPIC_KEYWORDS.get(cat, 'knowledge wisdom'))

    print(f"[img] Запросы для Pixabay: {queries}")
    return queries


def _save_image(content: bytes, content_type: str) -> str:
    suffix = '.png' if 'png' in content_type else '.jpg'
    f = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    f.write(content)
    f.close()
    return f.name


def _download_img(url: str, headers: dict, timeout: int = 10):
    try:
        r = _req.get(url, headers=headers, timeout=timeout)
        if r.status_code == 200 and len(r.content) > 5_000:
            return r.content, r.headers.get('content-type', 'image/jpeg')
    except Exception:
        pass
    return None, None


def _fetch_pixabay(query: str, api_key: str, used_ids: set, timeout: int = 10):
    H = {'User-Agent': _IMG_UA}
    base_params = {
        'key':         api_key,
        'q':           query,
        'image_type':  'photo',
        'orientation': 'horizontal',
        'min_width':   1280,
        'min_height':  720,
        'safesearch':  'true',
        'per_page':    15,
        'lang':        'en',
    }
    for attempt, extra in enumerate([
        {'editors_choice': 'true'},
        {'order': 'popular'},
    ]):
        try:
            r = _req.get("https://pixabay.com/api/",
                         params={**base_params, **extra}, timeout=timeout)
            print(f"[img] Pixabay '{query}' (попытка {attempt+1}) → {r.status_code}")
            if r.status_code != 200:
                continue
            hits = r.json().get('hits', [])
            if not hits:
                continue
            random.shuffle(hits)
            for hit in hits:
                pid = hit.get('id')
                if pid in used_ids:
                    continue
                url = hit.get('largeImageURL') or hit.get('webformatURL')
                if not url:
                    continue
                content, ct = _download_img(url, H, timeout)
                if content:
                    used_ids.add(pid)
                    path = _save_image(content, ct)
                    print(f"[img] ✓ Pixabay '{query}' → {path} (id={pid})")
                    return path
        except Exception as e:
            print(f"[img] Pixabay ошибка (попытка {attempt+1}): {e}")
    return None


def _fetch_wiki_image(query: str, H: dict, timeout: int = 8):
    try:
        api_ru = "https://ru.wikipedia.org/w/api.php"
        sr = _req.get(api_ru, params={
            'action': 'opensearch', 'search': query[:60], 'limit': 1, 'format': 'json',
        }, headers=H, timeout=6).json()
        if len(sr) > 1 and sr[1]:
            ru_title = sr[1][0]
            ir = _req.get(api_ru, params={
                'action': 'query', 'titles': ru_title,
                'prop': 'pageimages|langlinks', 'format': 'json',
                'pithumbsize': 1280, 'lllang': 'en', 'lllimit': 1,
            }, headers=H, timeout=6).json()
            for page in ir.get('query', {}).get('pages', {}).values():
                thumb = page.get('thumbnail', {}).get('source')
                if thumb:
                    content, ct = _download_img(thumb, H, timeout)
                    if content:
                        return _save_image(content, ct)
                en_title = (page.get('langlinks') or [{}])[0].get('*')
                if en_title:
                    api_en = "https://en.wikipedia.org/w/api.php"
                    ir2 = _req.get(api_en, params={
                        'action': 'query', 'titles': en_title,
                        'prop': 'pageimages', 'format': 'json', 'pithumbsize': 1280,
                    }, headers=H, timeout=6).json()
                    for p2 in ir2.get('query', {}).get('pages', {}).values():
                        t2 = p2.get('thumbnail', {}).get('source')
                        if t2:
                            content, ct = _download_img(t2, H, timeout)
                            if content:
                                return _save_image(content, ct)
    except Exception:
        pass
    return None


def _fetch_unsplash(query_en: str, timeout: int = 6):
    try:
        q = query_en.replace(' ', ',')
        r = _req.get(f"https://source.unsplash.com/1280x720/?{q}",
                     timeout=timeout, allow_redirects=True)
        if r.status_code == 200 and len(r.content) > 8_000:
            return _save_image(r.content, r.headers.get('content-type', 'image/jpeg'))
    except Exception:
        pass
    return None


def fetch_presentation_images(topic: str, timeout: int = 10) -> list:
    """Скачивает до 3 изображений по теме. Возвращает список путей."""
    H = {'User-Agent': _IMG_UA}
    pixabay_key = os.environ.get("PIXABAY_API_KEY", "")
    queries_en  = _topic_to_english(topic)
    results     = []
    used_ids    = set()

    print(f"[img] Загружаем 3 изображения для темы: '{topic}'")

    for i, query_en in enumerate(queries_en):
        print(f"[img] --- Картинка {i+1}/3, запрос: '{query_en}' ---")
        path = None

        if pixabay_key:
            path = _fetch_pixabay(query_en, pixabay_key, used_ids, timeout)

        if not path:
            wiki_query = topic if i == 0 else query_en
            path = _fetch_wiki_image(wiki_query, H, timeout)
            if path:
                print(f"[img] ✓ Wikipedia → {path}")

        if not path:
            path = _fetch_unsplash(query_en, timeout)
            if path:
                print(f"[img] ✓ Unsplash → {path}")

        if path:
            results.append(path)
        else:
            print(f"[img] ✗ Картинка {i+1} не найдена — слайд без фото")

    print(f"[img] Итого загружено: {len(results)}/3 изображений")
    return results


# ── Строительные блоки слайдов ────────────────────────────────────────────────

def _dark_slide(prs, colors):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    W, H = prs.slide_width, prs.slide_height
    _fill_rect(slide, 0, 0, W, H, colors["primary"])
    return slide, W, H


def _light_slide_base(prs, colors, title_text, slide_num=None):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    W, H = prs.slide_width, prs.slide_height

    _fill_rect(slide, 0, 0, W, H, colors["bg"])

    header_h = int(H * 0.17)
    _fill_rect(slide, 0, 0, W, header_h, colors["primary"])
    _fill_rect(slide, 0, 0, int(W * 0.006), header_h, colors["accent"])

    _add_textbox(slide,
                 int(W * 0.04), int(H * 0.025),
                 int(W * 0.88), int(H * 0.13),
                 title_text,
                 font_name=FONT_DISPLAY, font_size=26,
                 bold=False, color=colors["on_dark"],
                 align=PP_ALIGN.LEFT)

    if slide_num is not None:
        _add_textbox(slide,
                     int(W * 0.88), int(H * 0.025),
                     int(W * 0.10), int(H * 0.13),
                     str(slide_num),
                     font_name=FONT_BODY, font_size=13,
                     color=colors["accent"],
                     align=PP_ALIGN.RIGHT)

    return slide, W, H, header_h


# ── Типы слайдов ──────────────────────────────────────────────────────────────

def _slide_title(prs, data, colors, profile, img_path=None, slide_num=1):
    slide, W, H = _dark_slide(prs, colors)

    LEFT_W  = int(W * 0.58)
    RIGHT_X = int(W * 0.58)
    RIGHT_W = W - RIGHT_X

    if img_path:
        try:
            slide.shapes.add_picture(img_path, RIGHT_X, 0, RIGHT_W, H)
        except Exception:
            img_path = None

    if not img_path:
        deco = _fill_rect(slide, RIGHT_X, 0, RIGHT_W, H, colors["accent"])
        _set_transparency(deco, 15)

    if img_path:
        overlay = _fill_rect(slide, RIGHT_X, 0, int(RIGHT_W * 0.35), H, colors["primary"])
        _set_transparency(overlay, 55)

    _fill_rect(slide, LEFT_W - int(W * 0.003), 0, int(W * 0.004), H, colors["accent"])
    _fill_rect(slide, int(W * 0.07), int(H * 0.32),
               int(LEFT_W * 0.55), int(H * 0.003), colors["accent"])

    subtitle = data.get("subtitle", "")
    if subtitle:
        _add_textbox(slide,
                     int(W * 0.07), int(H * 0.19),
                     int(LEFT_W * 0.88), int(H * 0.10),
                     subtitle.upper(),
                     font_name=FONT_BODY, font_size=11,
                     bold=True, color=colors["accent"],
                     space_after=0)

    _add_textbox(slide,
                 int(W * 0.07), int(H * 0.33),
                 int(LEFT_W * 0.90), int(H * 0.38),
                 data.get("title", ""),
                 font_name=FONT_DISPLAY, font_size=38,
                 bold=False, color=colors["on_dark"],
                 line_spacing=50)

    if profile:
        parts = []
        if profile.get("fullName"):    parts.append(str(profile["fullName"]))
        if profile.get("university"):  parts.append(str(profile["university"]))
        if profile.get("groupNumber"): parts.append(f"Группа {profile['groupNumber']}")
        if parts:
            _add_textbox(slide,
                         int(W * 0.07), int(H * 0.78),
                         int(LEFT_W * 0.90), int(H * 0.12),
                         "  ·  ".join(parts),
                         font_name=FONT_BODY, font_size=12,
                         color="94A3B8")


def _slide_bullets(prs, data, colors, slide_num=None):
    slide, W, H, hdr_h = _light_slide_base(prs, colors, data.get("title", ""), slide_num)
    points = data.get("points", [])
    content_top = hdr_h + int(H * 0.05)
    content_h   = H - hdr_h - int(H * 0.08)
    _add_bullets_box(slide,
                     int(W * 0.05), content_top,
                     int(W * 0.90), content_h,
                     points[:7],
                     font_size=19,
                     color=colors["text"],
                     accent_color=colors["accent"],
                     line_spacing_pt=30)


def _slide_image_bullets(prs, data, colors, img_path=None, slide_num=None):
    if not img_path:
        _slide_bullets(prs, data, colors, slide_num)
        return

    slide, W, H, hdr_h = _light_slide_base(prs, colors, data.get("title", ""), slide_num)
    points = data.get("points", [])

    content_top = hdr_h + int(H * 0.05)
    content_h   = H - hdr_h - int(H * 0.08)
    text_w      = int(W * 0.52)

    _add_bullets_box(slide,
                     int(W * 0.05), content_top,
                     text_w, content_h,
                     points[:6],
                     font_size=18,
                     color=colors["text"],
                     accent_color=colors["accent"])

    img_left   = int(W * 0.60)
    img_top    = hdr_h + int(H * 0.04)
    img_width  = int(W * 0.36)
    img_height = H - hdr_h - int(H * 0.07)

    try:
        pic = slide.shapes.add_picture(img_path, img_left, img_top, img_width, img_height)
        sp = pic._element
        spPr = sp.find(qn('p:spPr'))
        if spPr is None:
            spPr = etree.SubElement(sp, qn('p:spPr'))
        prstGeom = spPr.find(qn('a:prstGeom'))
        if prstGeom is None:
            prstGeom = etree.SubElement(spPr, qn('a:prstGeom'))
        prstGeom.set('prst', 'roundRect')
        avLst = etree.SubElement(prstGeom, qn('a:avLst'))
        gd = etree.SubElement(avLst, qn('a:gd'))
        gd.set('name', 'adj')
        gd.set('fmla', 'val 16667')
    except Exception as e:
        print(f"[pptx] Не удалось вставить изображение: {e}")


def _slide_stats(prs, data, colors, slide_num=None):
    slide, W, H = _dark_slide(prs, colors)
    _fill_rect(slide, 0, 0, W, int(H * 0.006), colors["accent"])

    _add_textbox(slide,
                 int(W * 0.06), int(H * 0.07),
                 int(W * 0.80), int(H * 0.13),
                 data.get("title", ""),
                 font_name=FONT_DISPLAY, font_size=28,
                 bold=False, color=colors["on_dark"])

    if slide_num:
        _add_textbox(slide, int(W*0.88), int(H*0.07), int(W*0.10), int(H*0.10),
                     str(slide_num), font_size=13, color=colors["accent"], align=PP_ALIGN.RIGHT)

    stats = data.get("stats", [])[:4]
    if not stats:
        return

    n      = len(stats)
    pad    = int(W * 0.05)
    gap    = int(W * 0.022)
    card_w = int((W - 2 * pad - gap * (n - 1)) / n)
    card_h = int(H * 0.52)
    card_y = int(H * 0.30)

    for i, stat in enumerate(stats):
        x = pad + i * (card_w + gap)
        _fill_rect(slide, x, card_y, card_w, card_h, colors["surface"])
        _fill_rect(slide, x, card_y, card_w, int(H * 0.005), colors["accent"])
        _add_textbox(slide,
                     x, card_y + int(card_h * 0.12),
                     card_w, int(card_h * 0.50),
                     str(stat.get("num", "—")),
                     font_name=FONT_DISPLAY, font_size=52,
                     bold=False, color=colors["accent"],
                     align=PP_ALIGN.CENTER)
        _add_textbox(slide,
                     x, card_y + int(card_h * 0.64),
                     card_w, int(card_h * 0.32),
                     str(stat.get("label", "")),
                     font_name=FONT_BODY, font_size=14,
                     color="94A3B8",
                     align=PP_ALIGN.CENTER,
                     word_wrap=True)


def _slide_columns(prs, data, colors, slide_num=None):
    slide, W, H, hdr_h = _light_slide_base(prs, colors, data.get("title", ""), slide_num)
    columns = data.get("columns", [])[:3]
    if not columns:
        return

    n      = len(columns)
    pad    = int(W * 0.04)
    gap    = int(W * 0.02)
    card_w = int((W - 2 * pad - gap * (n - 1)) / n)
    card_y = hdr_h + int(H * 0.05)
    card_h = H - card_y - int(H * 0.06)

    for i, col in enumerate(columns):
        x = pad + i * (card_w + gap)
        _fill_rect(slide, x, card_y, card_w, card_h, colors["card"])
        _fill_rect(slide, x, card_y, card_w, int(H * 0.006), colors["accent"])
        _add_textbox(slide,
                     x + int(W * 0.015), card_y + int(H * 0.03),
                     card_w - int(W * 0.02), int(H * 0.09),
                     str(col.get("title", "")),
                     font_name=FONT_DISPLAY, font_size=16,
                     bold=False, color=colors["accent"])
        _add_bullets_box(slide,
                         x + int(W * 0.015),
                         card_y + int(H * 0.14),
                         card_w - int(W * 0.02),
                         card_h - int(H * 0.17),
                         col.get("items", [])[:5],
                         font_size=14,
                         color=colors["text"],
                         accent_color=colors["accent"],
                         bullet_char="·",
                         line_spacing_pt=22)


def _slide_timeline(prs, data, colors, slide_num=None):
    slide, W, H = _dark_slide(prs, colors)
    _fill_rect(slide, 0, 0, W, int(H * 0.17), colors["surface"])
    _fill_rect(slide, 0, 0, int(W * 0.006), int(H * 0.17), colors["accent"])

    _add_textbox(slide,
                 int(W * 0.04), int(H * 0.025),
                 int(W * 0.88), int(H * 0.13),
                 data.get("title", ""),
                 font_name=FONT_DISPLAY, font_size=26,
                 color=colors["on_dark"])

    if slide_num:
        _add_textbox(slide, int(W*0.88), int(H*0.025), int(W*0.10), int(H*0.13),
                     str(slide_num), font_size=13, color=colors["accent"], align=PP_ALIGN.RIGHT)

    events = data.get("events", [])[:6]
    if not events:
        return

    line_x = int(W * 0.18)
    line_y = int(H * 0.20)
    line_h = int(H * 0.72)
    _fill_rect(slide, line_x, line_y, int(W * 0.003), line_h, colors["accent"])
    row_h = line_h // max(len(events), 1)

    for i, ev in enumerate(events):
        y = line_y + i * row_h + int(row_h * 0.12)
        dot_size = int(W * 0.018)
        _fill_rect(slide, line_x - dot_size // 2, y + int(H * 0.01),
                   dot_size, dot_size, colors["accent"])
        date_str = str(ev.get("date", ""))
        if date_str:
            _add_textbox(slide, int(W * 0.02), y, int(W * 0.13), int(row_h * 0.7),
                         date_str, font_name=FONT_BODY, font_size=12,
                         bold=True, color=colors["accent"], align=PP_ALIGN.RIGHT)
        _add_textbox(slide, line_x + int(W * 0.03), y, int(W * 0.75), int(row_h * 0.75),
                     str(ev.get("text", "")), font_name=FONT_BODY, font_size=15,
                     color=colors["on_dark"], word_wrap=True)


def _slide_conclusion(prs, data, colors, slide_num=None):
    slide, W, H = _dark_slide(prs, colors)
    _fill_rect(slide, 0, 0, W, int(H * 0.17), colors["surface"])
    _fill_rect(slide, 0, 0, int(W * 0.006), int(H * 0.17), colors["accent"])

    _add_textbox(slide,
                 int(W * 0.04), int(H * 0.025),
                 int(W * 0.88), int(H * 0.13),
                 data.get("title", "Выводы"),
                 font_name=FONT_DISPLAY, font_size=26,
                 color=colors["on_dark"])

    if slide_num:
        _add_textbox(slide, int(W*0.88), int(H*0.025), int(W*0.10), int(H*0.13),
                     str(slide_num), font_size=13, color=colors["accent"], align=PP_ALIGN.RIGHT)

    points = data.get("points", [])[:6]
    tb = slide.shapes.add_textbox(int(W * 0.06), int(H * 0.22), int(W * 0.88), int(H * 0.72))
    tf = tb.text_frame
    tf.word_wrap = True

    for i, point in enumerate(points):
        p = tf.add_paragraph() if i > 0 else tf.paragraphs[0]
        p.alignment = PP_ALIGN.LEFT
        p.space_before = Pt(6)
        p.space_after  = Pt(6)
        p.line_spacing = Pt(26)

        r1 = p.add_run()
        r1.text = f"{i + 1:02d}  "
        r1.font.name  = FONT_DISPLAY
        r1.font.size  = Pt(20)
        r1.font.bold  = True
        r1.font.color.rgb = hex_to_rgb(colors["accent"])

        r2 = p.add_run()
        r2.text = str(point)
        r2.font.name  = FONT_BODY
        r2.font.size  = Pt(18)
        r2.font.color.rgb = hex_to_rgb(colors["on_dark"])


def _slide_sources(prs, data, colors, slide_num=None):
    slide, W, H, hdr_h = _light_slide_base(prs, colors,
                                             data.get("title", "Список источников"),
                                             slide_num)
    sources = data.get("sources", [])[:9]
    tb = slide.shapes.add_textbox(int(W * 0.05), hdr_h + int(H * 0.05),
                                   int(W * 0.90), H - hdr_h - int(H * 0.08))
    tf = tb.text_frame
    tf.word_wrap = True

    for i, src in enumerate(sources):
        p = tf.add_paragraph() if i > 0 else tf.paragraphs[0]
        p.space_before = Pt(4)
        p.space_after  = Pt(4)
        p.line_spacing = Pt(20)

        r1 = p.add_run()
        r1.text = f"{i + 1}.  "
        r1.font.name  = FONT_BODY
        r1.font.size  = Pt(13)
        r1.font.bold  = True
        r1.font.color.rgb = hex_to_rgb(colors["accent"])

        r2 = p.add_run()
        r2.text = str(src)
        r2.font.name  = FONT_BODY
        r2.font.size  = Pt(13)
        r2.font.color.rgb = hex_to_rgb(colors["text"])


def _slide_final(prs, data, colors, profile=None, slide_num=None):
    slide, W, H = _dark_slide(prs, colors)

    _fill_rect(slide, int(W * 0.25), int(H * 0.36),
               int(W * 0.50), int(H * 0.005), colors["accent"])

    dot = int(W * 0.016)
    _fill_rect(slide, W // 2 - dot // 2, int(H * 0.36) - dot // 2,
               dot, dot, colors["accent"])

    _add_textbox(slide,
                 int(W * 0.05), int(H * 0.38),
                 int(W * 0.90), int(H * 0.28),
                 data.get("title", "Спасибо за внимание!"),
                 font_name=FONT_DISPLAY, font_size=52,
                 bold=False, color=colors["on_dark"],
                 align=PP_ALIGN.CENTER)

    subtitle = data.get("subtitle", "")
    if subtitle:
        _add_textbox(slide,
                     int(W * 0.10), int(H * 0.67),
                     int(W * 0.80), int(H * 0.10),
                     subtitle,
                     font_name=FONT_BODY, font_size=16,
                     color=colors["accent"],
                     align=PP_ALIGN.CENTER)

    if profile and profile.get("fullName"):
        _add_textbox(slide,
                     int(W * 0.05), int(H * 0.83),
                     int(W * 0.90), int(H * 0.10),
                     str(profile["fullName"]),
                     font_name=FONT_BODY, font_size=13,
                     color="475569",
                     align=PP_ALIGN.CENTER)


# ── Палитры по типу работы ────────────────────────────────────────────────────

_WORK_TYPE_PALETTE = {
    "ВКР":       "dark_gold",
    "Курсовая":  "dark_gold",
    "Реферат":   "blue_academic",
    "Доклад":    "blue_academic",
    "Эссе":      "burgundy_warm",
    "Сочинение": "burgundy_warm",
}


def _build_slides_prompt(topic: str, work_type: str, full_text: str,
                          real_sources: list) -> str:
    sources_hint = ""
    if real_sources:
        sl = "\n".join(f"  {i+1}. {s}" for i, s in enumerate(real_sources[:5]))
        sources_hint = f"\nИспользуй эти реальные источники для слайда SOURCES:\n{sl}"

    return f"""На основе текста создай JSON-структуру презентации из 10-12 слайдов.
Тема: {topic}
Тип работы: {work_type}
{sources_hint}

Фрагмент текста:
{full_text}

Верни ТОЛЬКО JSON без ```json и без пояснений. Строго соблюдай имена полей — рендерер использует именно эти ключи:

{{
  "slides": [
    {{
      "type": "TITLE",
      "title": "Полное название темы",
      "subtitle": "Аннотация в 1-2 предложения",
      "meta": "{work_type}",
      "image_query": "конкретные английские слова о теме",
      "image_query2": "запасной английский запрос о теме"
    }},
    {{
      "type": "RELEVANCE",
      "title": "Актуальность и цели исследования",
      "goal": "Цель работы — одно предложение",
      "tasks": ["Задача 1", "Задача 2", "Задача 3", "Задача 4"],
      "object": "Объект исследования — 1-2 предложения",
      "subject": "Предмет исследования — 1-2 предложения"
    }},
    {{
      "type": "OVERVIEW",
      "title": "Структура работы",
      "cards": [
        {{"icon": "FaBookOpen",    "title": "Название раздела 1", "points": ["Ключевой аспект 1", "Ключевой аспект 2"], "accent": "C9963A"}},
        {{"icon": "FaChartLine",   "title": "Название раздела 2", "points": ["Ключевой аспект 1", "Ключевой аспект 2"], "accent": "4A9EDB"}},
        {{"icon": "FaCogs",        "title": "Название раздела 3", "points": ["Ключевой аспект 1", "Ключевой аспект 2"], "accent": "C0784A"}},
        {{"icon": "FaCheckCircle", "title": "Название раздела 4", "points": ["Ключевой аспект 1", "Ключевой аспект 2"], "accent": "5B8A3C"}}
      ]
    }},
    {{
      "type": "CONTENT",
      "title": "Заголовок контентного слайда",
      "points": [
        {{"heading": "Краткий заголовок тезиса", "text": "Развёрнутое пояснение в 1-2 предложения с фактами"}},
        {{"heading": "Краткий заголовок тезиса", "text": "Развёрнутое пояснение в 1-2 предложения с фактами"}},
        {{"heading": "Краткий заголовок тезиса", "text": "Развёрнутое пояснение в 1-2 предложения с фактами"}}
      ],
      "image_query": "English keywords about slide title",
      "image_query2": "alternative English query"
    }},
    {{
      "type": "STATS",
      "title": "Ключевые показатели",
      "stats": [
        {{"value": "42%",  "label": "Описание показателя из текста", "icon": "FaChartLine"}},
        {{"value": "2025", "label": "Описание показателя из текста", "icon": "FaCalendarAlt"}},
        {{"value": "150+", "label": "Описание показателя из текста", "icon": "FaUsers"}}
      ],
      "image_query": "English keywords about the statistics topic"
    }},
    {{
      "type": "CONTENT",
      "title": "Заголовок второго контентного слайда",
      "points": [
        {{"heading": "Заголовок", "text": "Пояснение с данными из текста"}},
        {{"heading": "Заголовок", "text": "Пояснение с данными из текста"}},
        {{"heading": "Заголовок", "text": "Пояснение с данными из текста"}}
      ],
      "image_query": "...",
      "image_query2": "..."
    }},
    {{
      "type": "CONTENT",
      "title": "Заголовок третьего контентного слайда",
      "points": [
        {{"heading": "Заголовок", "text": "Пояснение"}},
        {{"heading": "Заголовок", "text": "Пояснение"}},
        {{"heading": "Заголовок", "text": "Пояснение"}}
      ],
      "image_query": "...",
      "image_query2": "..."
    }},
    {{
      "type": "CONCLUSION",
      "title": "Выводы",
      "points": [
        {{"label": "Краткий вывод 1", "text": "Развёрнутое пояснение вывода на основе текста"}},
        {{"label": "Краткий вывод 2", "text": "Развёрнутое пояснение вывода на основе текста"}},
        {{"label": "Краткий вывод 3", "text": "Развёрнутое пояснение вывода на основе текста"}}
      ],
      "quote": "Итоговая мысль или ключевой тезис работы"
    }},
    {{"type": "SOURCES", "title": "Список литературы", "sources": ["Источник 1", "Источник 2", "Источник 3"]}},
    {{"type": "FINAL",   "title": "Спасибо за внимание!", "subtitle": "Готов(а) ответить на ваши вопросы"}}
  ]
}}

Правила по содержанию:
— Используй реальные факты, цифры и данные из фрагмента текста — не придумывай
— Ровно 10-12 слайдов итого; CONTENT-слайды можно повторять
— STATS: только конкретные числа из текста (%, годы, суммы, количества)
— OVERVIEW: ровно 4 карточки с реальными разделами/главами работы
  Иконки только из списка: FaBookOpen, FaChartLine, FaCogs, FaCheckCircle, FaBrain, FaSearch, FaUsers, FaGlobe, FaLightbulb, FaHistory, FaBalanceScale, FaShieldAlt, FaLandmark, FaRocket, FaIndustry
— CONTENT: поле points ОБЯЗАТЕЛЬНО массив объектов {{heading, text}}, НЕ строки
— CONCLUSION: поле points ОБЯЗАТЕЛЬНО массив объектов {{label, text}}, НЕ строки
— SOURCES: реальные источники если даны выше, иначе придумай 3-5 релевантных

Правила для image_query (КРИТИЧНО для релевантных картинок):
— Только АНГЛИЙСКИЙ язык, 2-4 слова, конкретные существительные
— TITLE: строго о теме "{topic}" → пример "кибербезопасность" → "cybersecurity network hacker"
— CONTENT/STATS: строго по заголовку слайда, отражает именно эту тему
— Плохо: "concept people modern history" → Хорошо: "nuclear power plant reactor", "stock market crash trading"
— RELEVANCE, OVERVIEW, SOURCES, FINAL: image_query не нужен"""


# ── Основная генерация ────────────────────────────────────────────────────────

def generate_presentation(job_id: str, topic: str, work_type: str,
                           profile: dict, result: dict) -> tuple:
    """Генерирует PPTX через pptx_builder.js и сохраняет в /tmp/pptx_{job_id}.pptx."""

    structure = result.get("structure", [])
    # Для длинных работ (курсовая, ВКР) берём больше разделов и символов
    max_sections   = 12 if work_type in ("Курсовая", "ВКР") else 7
    chars_per_sect = 600 if work_type in ("Курсовая", "ВКР") else 400

    text_parts = []
    for section in structure[:max_sections]:
        content = result.get("content", {}).get(section, "")
        content = re.sub(r'\[TABLE\].*?\[/TABLE\]', '', content, flags=re.DOTALL)
        text_parts.append(f"## {section}\n{content[:chars_per_sect]}")
    full_text = "\n\n".join(text_parts)

    real_sources = [s for s in result.get("sources", [])
                    if isinstance(s, str) and s.strip()][:5]

    # 1. Генерируем структуру слайдов через AI
    prompt = _build_slides_prompt(topic, work_type, full_text, real_sources)
    max_tokens = 5000 if work_type in ("Курсовая", "ВКР") else 4000
    raw = _ask(prompt, max_tokens=max_tokens)

    match = re.search(r'\{[\s\S]*\}', raw)
    if not match:
        raise ValueError("AI не вернул JSON для структуры слайдов")
    slides_data = json.loads(match.group())
    slides = slides_data.get("slides", [])
    if not slides:
        raise ValueError("Список слайдов пустой")

    # Нормализация: конвертируем устаревший формат на случай если AI вернул строки
    for sl in slides:
        stype = sl.get("type", "")

        # CONTENT.points: строки → {heading, text}
        if stype == "CONTENT":
            pts = sl.get("points", [])
            sl["points"] = [
                {"heading": p, "text": ""} if isinstance(p, str) else p
                for p in pts
            ]

        # CONCLUSION.points: строки → {label, text}
        elif stype == "CONCLUSION":
            pts = sl.get("points", [])
            sl["points"] = [
                {"label": p, "text": ""} if isinstance(p, str) else p
                for p in pts
            ]

        # STATS.stats: num → value, добавляем icon если нет
        elif stype == "STATS":
            for st in sl.get("stats", []):
                if "num" in st and "value" not in st:
                    st["value"] = st.pop("num")
                st.setdefault("icon", "FaChartLine")

        # OVERVIEW: items[] → cards[] совместимость со старым промптом
        elif stype == "OVERVIEW" and "items" in sl and "cards" not in sl:
            _icons   = ["FaBookOpen", "FaChartLine", "FaCogs", "FaCheckCircle"]
            _accents = ["C9963A", "4A9EDB", "C0784A", "5B8A3C"]
            sl["cards"] = [
                {"icon": _icons[i % 4], "title": (it if isinstance(it, str) else str(it)),
                 "points": [], "accent": _accents[i % 4]}
                for i, it in enumerate(sl.pop("items"))
            ]

    # Если real_sources есть — вставляем в слайд SOURCES
    if real_sources:
        for s in slides:
            if s.get("type") == "SOURCES":
                s["sources"] = real_sources
                break

    # 2. Собираем payload для Node.js
    palette = _WORK_TYPE_PALETTE.get(work_type, "blue_academic")
    pixabay_key = os.environ.get("PIXABAY_API_KEY", "")

    payload = {
        "topic": topic,
        "workType": work_type,
        "palette": palette,
        "slides": slides,
        "pixabayKey": pixabay_key,
    }

    output_path = f"/tmp/pptx_{job_id}.pptx"

    # 3. Записываем input JSON во временный файл
    with _tempfile.NamedTemporaryFile(mode="w", suffix=".json",
                                      delete=False, encoding="utf-8") as fj:
        json.dump(payload, fj, ensure_ascii=False)
        input_json = fj.name

    try:
        builder_path = os.path.join(os.path.dirname(__file__), "pptx_builder.js")
        cmd = ["node", builder_path, input_json, output_path]
        if pixabay_key:
            cmd.append(pixabay_key)
        proc = subprocess.run(
            cmd,
            capture_output=True, text=True, timeout=120,
            cwd=os.path.dirname(__file__),
        )
        if proc.returncode != 0:
            raise RuntimeError(f"pptx_builder.js error:\n{proc.stderr[:1000]}")
        print(f"[extras] pptx_builder.js stdout: {proc.stdout[:500]}")
        print(f"[extras] image_queries: {[(s.get('type'), s.get('image_query')) for s in slides if s.get('image_query')]}")
    finally:
        try:
            os.unlink(input_json)
        except Exception:
            pass

    slide_titles = [
        s.get("title", "")
        for s in slides
        if s.get("type") not in ("SOURCES", "FINAL") and s.get("title")
    ]
    print(f"[extras] Презентация сохранена: {output_path} ({len(slides)} слайдов)")
    return output_path, slide_titles


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
