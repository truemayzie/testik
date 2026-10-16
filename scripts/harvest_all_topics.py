import requests
import re
import json
import time
import os
import sys
import html
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.stdout.reconfigure(encoding='utf-8')

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
os.makedirs(DATA_DIR, exist_ok=True)

OUT_FILE = os.path.join(DATA_DIR, 'topics_ready.jsonl')
CHECKPOINT_FILE = os.path.join(DATA_DIR, 'harvest_checkpoint.json')

session = requests.Session()
adapter = requests.adapters.HTTPAdapter(pool_connections=40, pool_maxsize=40, max_retries=2)
session.mount('https://', adapter)
session.mount('http://', adapter)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9',
}

WORK_NAMES_RU = {
    'referat': 'реферат',
    'kursovaya': 'курсовая работа',
    'doklad': 'доклад',
    'esse': 'эссе',
    'vkr': 'дипломная работа (ВКР)',
    'sochinenie': 'сочинение',
}

SUBJECT_KEYWORDS = [
    (r'(?i)(?:литератур|пушкин|толстой|достоевск|чехов|лермонтов|поэзи|поэм|произведен|гоголь|стихотвор)', 'Литература'),
    (r'(?i)(?:эконом|предприят|финанс|инфляц|банк|налог|бухгалтер|бюджет|деньг|рынок|менеджмент|маркетинг|логистик)', 'Экономика'),
    (r'(?i)(?:прав[ао]|закон|суд|кодекс|юриспруд|преступл|конституц|нормативн|правонаруш|договор|государств)', 'Юриспруденция'),
    (r'(?i)(?:истори|войн[аы]|революц|ссср|древн|импери|век[а-я]*|правител|романов)', 'История'),
    (r'(?i)(?:психолог|тревожн|эмоци|личность|стресс|характер|поведен|мотивац|отношен)', 'Психология'),
    (r'(?i)(?:педагог|воспитани|обучени|школ[а-я]*|ученик|студент|методик[а-я]*|дидактик)', 'Педагогика'),
    (r'(?i)(?:философ|быти[ея]|сознани|этик[а-я]*|морал|смысл|познани)', 'Философия'),
    (r'(?i)(?:информатик|искусственн[а-я]* интеллект|нейросет|программ|алгоритм|компьютер|баз[а-я]* данн|it|веб|сайт)', 'Информатика'),
    (r'(?i)(?:физик|квантов|энерги|термодинамик|механик|оптик|электрич)', 'Физика'),
    (r'(?i)(?:хими[яи]|реакци|веществ|элемент|молекул|раствор|соединени)', 'Химия'),
    (r'(?i)(?:биолог|генет|эволюц|клетк[а-я]*|организ|растени|животн|ботаник|зоолог)', 'Биология'),
    (r'(?i)(?:медицин|болезн|лечени|травм|диагностик|вирус|патолог|здоровь|цитокин|анатоми)', 'Медицина'),
    (r'(?i)(?:эколог|окружающ|загрязнен|биосфер|природ|климат|отход)', 'Экология'),
    (r'(?i)(?:социолог|обществ|социальн|семь[яи]|молодеж|культури|населен)', 'Социология'),
    (r'(?i)(?:язык|лингвистик|грамматик|лексик|перевод|английск|русск[а-я]* язык)', 'Лингвистика'),
    (r'(?i)(?:строительств|здани|сооружен|архитектур|материал[а-я]*|конструкц)', 'Строительство'),
    (r'(?i)(?:бпла|дрон|робот|машиностроен|автоматизац|техник|инженери)', 'Технические науки'),
    (r'(?i)(?:культуролог|искусств|живопис|музе[йя]|театр|кино|музык)', 'Культурология'),
]

def detect_subject(title, default='Общие дисциплины'):
    for pattern, subj in SUBJECT_KEYWORDS:
        if re.search(pattern, title):
            return subj
    return default

def clean_title(title):
    if not title:
        return ''
    title = html.unescape(title)
    title = re.sub(r'[\r\n\t]+', ' ', title).strip()
    title = re.sub(r'\s*/\s*Studgen.*$', '', title, flags=re.IGNORECASE)
    title = re.sub(r'^(?:Реферат|Курсовая работа|Курсовая|Дипломная работа|Диплом|ВКР|Эссе|Доклад|Сочинение|Научный реферат)\s+(?:на тему\s+|по теме\s+|по\s+[а-яА-ЯёЁ\s]+:\s+)?', '', title, flags=re.IGNORECASE)
    title = title.strip('«»"\' .;:,')
    if title:
        title = title[0].upper() + title[1:]
    return title

def is_ukrainian_or_invalid(text):
    # Reject texts with Ukrainian letters
    if re.search(r'[іїєґІЇЄҐ]', text):
        return True
    # Must have cyrillic letters
    if not re.search(r'[а-яА-ЯёЁ]', text):
        return True
    return False

def make_slug(raw_slug, title, prefix=''):
    if raw_slug:
        # clean slug
        s = re.sub(r'[^a-zA-Z0-9\-]+', '-', raw_slug).strip('-').lower()
        if len(s) >= 4:
            return f'{prefix}{s}'[:80]
    
    # Transliteration
    tr = {
        'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y',
        'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f',
        'х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
    }
    s = ''.join(tr.get(c, c) for c in title.lower())
    s = re.sub(r'[^a-zA-Z0-9]+', '-', s).strip('-')
    return f'{prefix}{s}'[:80]

def build_record(title, work_type, subject, slug):
    ru_type = WORK_NAMES_RU.get(work_type, 'работа')
    meta_title = f'{title} — {ru_type} по {subject} | Refai'
    if len(meta_title) > 120:
        meta_title = f'{title} | Refai'[:120]
        
    meta_desc = f'Готовая работа на тему «{title}» ({ru_type}, предмет: {subject}). Оформление по ГОСТ 7.32-2017, реальные источники, высокая уникальность текста.'[:250]
    preview_text = f'Тема «{title}» представляет собой актуальное исследование по дисциплине «{subject}». Структура включает введение с обоснованием актуальности, теоретические основы, аналитическую часть и выводы с библиографическим списком литературы по стандарту ГОСТ.'
    
    return {
        'slug': slug,
        'workType': work_type,
        'subject': subject,
        'title': title,
        'metaTitle': meta_title,
        'metaDescription': meta_desc,
        'previewText': preview_text,
        'bodyText': '',
    }

def process_samopisets_item(item):
    url = item['url']
    try:
        r = session.get(url, headers=HEADERS, timeout=8)
        if r.status_code != 200:
            return None
        html_text = r.text
        m_h1 = re.search(r'<h1[^>]*>([^<]+)</h1>', html_text)
        m_title = re.search(r'<title>([^<]+)</title>', html_text)
        h1 = m_h1.group(1).strip() if m_h1 else ''
        title = m_title.group(1).strip() if m_title else ''
        
        raw_topic = h1 or title
        cleaned = clean_title(raw_topic)
        if not cleaned or len(cleaned) < 5 or is_ukrainian_or_invalid(cleaned):
            return None
            
        subject = item.get('subject') or detect_subject(cleaned)
        if subject == 'Общие дисциплины':
            subject = detect_subject(cleaned, default='Общие дисциплины')
            
        slug = make_slug(item.get('slug'), cleaned)
        return build_record(cleaned, item['workType'], subject, slug)
    except Exception:
        return None

def process_studgen_url(url):
    try:
        r = session.get(url, headers=HEADERS, timeout=8)
        if r.status_code != 200:
            return None
        html_text = r.text
        m_h1 = re.search(r'<h1[^>]*>([^<]+)</h1>', html_text)
        m_title = re.search(r'<title>([^<]+)</title>', html_text)
        h1 = m_h1.group(1).strip() if m_h1 else ''
        title = m_title.group(1).strip() if m_title else ''
        
        raw_topic = h1 or title
        cleaned = clean_title(raw_topic)
        if not cleaned or len(cleaned) < 5 or is_ukrainian_or_invalid(cleaned):
            return None
            
        t_lower = (title + ' ' + h1).lower()
        work_type = 'referat'
        if 'курсов' in t_lower:
            work_type = 'kursovaya'
        elif 'диплом' in t_lower or 'вкр' in t_lower or 'бакалавр' in t_lower or 'магистер' in t_lower:
            work_type = 'vkr'
        elif 'эссе' in t_lower:
            work_type = 'esse'
        elif 'доклад' in t_lower or 'научн' in t_lower:
            work_type = 'doklad'
        elif 'сочинен' in t_lower:
            work_type = 'sochinenie'
            
        subject = detect_subject(cleaned, default='Гуманитарные и общественные науки')
        
        page_id = re.search(r'/(\d+)$', url)
        id_suffix = page_id.group(1) if page_id else str(int(time.time()))
        slug = make_slug('', cleaned, prefix=f'sg-{id_suffix}-')
        
        return build_record(cleaned, work_type, subject, slug)
    except Exception:
        return None

def run_harvest(samopisets_limit=17350, studgen_limit=25000):
    processed_urls = set()
    used_slugs = set()
    
    if os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                processed_urls = set(data.get('processed_urls', []))
                used_slugs = set(data.get('used_slugs', []))
                print(f'Loaded checkpoint with {len(processed_urls)} processed URLs and {len(used_slugs)} slugs.')
        except Exception as e:
            print(f'Error reading checkpoint: {e}')

    out_fp = open(OUT_FILE, 'a', encoding='utf-8')
    
    # 1. Samopisets
    sam_items = []
    if os.path.exists('samopisets_urls.jsonl'):
        with open('samopisets_urls.jsonl', 'r', encoding='utf-8') as f:
            for line in f:
                it = json.loads(line)
                if it['url'] not in processed_urls:
                    sam_items.append(it)
                    if len(sam_items) >= samopisets_limit:
                        break

    print(f'\n=== Starting Samopisets harvest: {len(sam_items)} pending items ===')
    saved_count = 0
    t0 = time.time()
    
    with ThreadPoolExecutor(max_workers=30) as ex:
        future_to_url = {ex.submit(process_samopisets_item, it): it['url'] for it in sam_items}
        for i, fut in enumerate(as_completed(future_to_url), 1):
            url = future_to_url[fut]
            processed_urls.add(url)
            rec = fut.result()
            if rec:
                slug = rec['slug']
                # ensure uniqueness
                base_slug = slug
                counter = 2
                while slug in used_slugs:
                    slug = f'{base_slug}-{counter}'
                    counter += 1
                rec['slug'] = slug
                used_slugs.add(slug)
                
                out_fp.write(json.dumps(rec, ensure_ascii=False) + '\n')
                out_fp.flush()
                saved_count += 1
                
            if i % 100 == 0 or i == len(sam_items):
                elapsed = time.time() - t0
                speed = i / max(elapsed, 0.001)
                print(f'[Samopisets] Processed {i}/{len(sam_items)} | Saved: {saved_count} | Speed: {speed:.1f} req/s')

    # 2. Studgen
    sg_urls = []
    if os.path.exists('studgen_urls.jsonl'):
        with open('studgen_urls.jsonl', 'r', encoding='utf-8') as f:
            for line in f:
                u = json.loads(line)['url']
                if u not in processed_urls:
                    sg_urls.append(u)
                    if len(sg_urls) >= studgen_limit:
                        break

    print(f'\n=== Starting Studgen harvest: {len(sg_urls)} pending URLs ===')
    sg_saved = 0
    t0 = time.time()
    
    with ThreadPoolExecutor(max_workers=20) as ex:
        future_to_url = {ex.submit(process_studgen_url, u): u for u in sg_urls}
        for i, fut in enumerate(as_completed(future_to_url), 1):
            url = future_to_url[fut]
            processed_urls.add(url)
            rec = fut.result()
            if rec:
                slug = rec['slug']
                base_slug = slug
                counter = 2
                while slug in used_slugs:
                    slug = f'{base_slug}-{counter}'
                    counter += 1
                rec['slug'] = slug
                used_slugs.add(slug)
                
                out_fp.write(json.dumps(rec, ensure_ascii=False) + '\n')
                out_fp.flush()
                sg_saved += 1
                
            if i % 100 == 0 or i == len(sg_urls):
                elapsed = time.time() - t0
                speed = i / max(elapsed, 0.001)
                print(f'[Studgen] Processed {i}/{len(sg_urls)} | Saved: {sg_saved} | Speed: {speed:.1f} req/s')

    out_fp.close()
    
    # Save checkpoint
    with open(CHECKPOINT_FILE, 'w', encoding='utf-8') as f:
        json.dump({
            'processed_urls': list(processed_urls),
            'used_slugs': list(used_slugs),
            'total_saved': len(used_slugs)
        }, f)
        
    print(f'\nHarvest finished! Total saved records in {OUT_FILE}: {len(used_slugs)}')

if __name__ == '__main__':
    run_harvest()
