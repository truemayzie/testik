#!/usr/bin/env node
/**
 * pptx_builder.js — Node.js builder для презентаций.
 * Usage: node pptx_builder.js <input.json> <output.pptx> [pixabay_key]
 */
"use strict";

const pptxgen  = require("pptxgenjs");
const React    = require("react");
const ReactDOM = require("react-dom/server");
const sharp    = require("sharp");
const https    = require("https");
const http     = require("http");
const fs       = require("fs");
const url      = require("url");

const [,, INPUT_FILE, OUTPUT_FILE, PIXABAY_KEY] = process.argv;
if (!INPUT_FILE || !OUTPUT_FILE) {
  console.error("Usage: node pptx_builder.js <input.json> <output.pptx> [pixabay_key]");
  process.exit(1);
}

const data   = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));
const slides = data.slides;

// ─── Палитры по типу работы ──────────────────────────────────────────────────
const PALETTES = {
  // Курсовая / ВКР — тёмно-синий + золото (академичность, весомость)
  dark_gold: {
    dark: "0D1B2A", navy: "162032", mid: "1E3048", panel: "1A2D45",
    gold: "C9963A", goldL: "E8B84B",
    light: "F4F2ED", white: "FFFFFF", gray: "7A8FA6", grayL: "B0BEC5",
    text: "1A1A2E", muted: "4A5568",
  },
  // Реферат / Доклад — глубокий синий + голубой акцент (нейтральность, информативность)
  blue_academic: {
    dark: "0F1F3D", navy: "1A3260", mid: "24478A", panel: "1E3A70",
    gold: "4A9EDB", goldL: "72B8F0",
    light: "F0F4FA", white: "FFFFFF", gray: "6B82A0", grayL: "9BB0C8",
    text: "0F1F3D", muted: "3D5275",
  },
  // Эссе / Сочинение — тёмно-бордовый + тёплый акцент (гуманитарность, творчество)
  burgundy_warm: {
    dark: "1A0A0F", navy: "2D1020", mid: "4A1835", panel: "3D1228",
    gold: "C0784A", goldL: "D99060",
    light: "FDF6F0", white: "FFFFFF", gray: "8A7070", grayL: "B8A0A0",
    text: "1A0A0F", muted: "5C3A3A",
  },
};

// Маппинг типа работы → палитра
const WORK_TYPE_PALETTE = {
  "ВКР":       "dark_gold",
  "Курсовая":  "dark_gold",
  "Реферат":   "blue_academic",
  "Доклад":    "blue_academic",
  "Эссе":      "burgundy_warm",
  "Сочинение": "burgundy_warm",
};

const paletteName = data.palette
  || WORK_TYPE_PALETTE[data.work_type]
  || "dark_gold";
const C = PALETTES[paletteName] || PALETTES.dark_gold;

const mkSh  = () => ({ type:"outer", blur:10, offset:3, angle:135, color:"000000", opacity:0.18 });
const mkShS = () => ({ type:"outer", blur:5,  offset:2, angle:135, color:"000000", opacity:0.13 });

// ─── Иконки (react-icons/fa) ─────────────────────────────────────────────────
const FA = require("react-icons/fa");
const ICON_MAP = {
  FaSearch:FA.FaSearch, FaChartLine:FA.FaChartLine, FaChartBar:FA.FaChartBar,
  FaCogs:FA.FaCogs, FaCog:FA.FaCog, FaLightbulb:FA.FaLightbulb,
  FaUsers:FA.FaUsers, FaUser:FA.FaUser, FaGlobe:FA.FaGlobe,
  FaArrowUp:FA.FaArrowUp, FaArrowDown:FA.FaArrowDown,
  FaCheckCircle:FA.FaCheckCircle, FaExclamationTriangle:FA.FaExclamationTriangle,
  FaBookOpen:FA.FaBookOpen, FaUniversity:FA.FaUniversity, FaIndustry:FA.FaIndustry,
  FaLeaf:FA.FaLeaf, FaMicroscope:FA.FaMicroscope, FaFlask:FA.FaFlask,
  FaBrain:FA.FaBrain, FaHeart:FA.FaHeart, FaBalanceScale:FA.FaBalanceScale,
  FaShieldAlt:FA.FaShieldAlt, FaCity:FA.FaCity, FaTree:FA.FaTree,
  FaWater:FA.FaWater, FaStar:FA.FaStar, FaCrown:FA.FaCrown,
  FaCalendar:FA.FaCalendar, FaCalendarAlt:FA.FaCalendarAlt,
  FaHistory:FA.FaHistory, FaLandmark:FA.FaLandmark, FaScroll:FA.FaScroll,
  FaGavel:FA.FaGavel, FaHandshake:FA.FaHandshake,
  FaMoneyBillWave:FA.FaMoneyBillWave, FaPercent:FA.FaPercent,
  FaRecycle:FA.FaRecycle, FaBolt:FA.FaBolt, FaRocket:FA.FaRocket,
  FaGraduationCap:FA.FaGraduationCap, FaBook:FA.FaBook,
  FaClipboardList:FA.FaClipboardList, FaTasks:FA.FaTasks,
  FaLayerGroup:FA.FaLayerGroup, FaNetworkWired:FA.FaNetworkWired,
  FaSkull:FA.FaSkull, FaCoins:FA.FaCoins,
};

async function renderIcon(name, hexColor="#FFFFFF", size=512) {
  const Comp = ICON_MAP[name] || FA.FaStar;
  const svg  = ReactDOM.renderToStaticMarkup(
    React.createElement(Comp, { color: hexColor, size: String(size) })
  );
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

// ─── Загрузка изображений ─────────────────────────────────────────────────────
function fetchUrl(rawUrl, timeoutMs=12000, extraHeaders={}) {
  return new Promise((resolve, reject) => {
    const parsed  = url.parse(rawUrl);
    const lib     = parsed.protocol === "https:" ? https : http;
    const options = {
      timeout: timeoutMs,
      headers: {
        "User-Agent": "RefAI-PptxBuilder/1.0 (https://ref-ai.ru; support@ref-ai.ru)",
        ...extraHeaders,
      },
    };
    const req = lib.get(rawUrl, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302)
        return fetchUrl(res.headers.location, timeoutMs, extraHeaders).then(resolve).catch(reject);
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end",  () => resolve(Buffer.concat(chunks)));
    });
    req.on("error",   reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

const usedPixabayIds = new Set();

// Слова настолько общие, что совпадение с ними ничего не значит
const SCORE_STOPWORDS = new Set([
  "the","and","for","with","from","that","this","are","was","were","been",
  "flag","map","old","new","big","small","top","view","man","men","woman","women",
  "people","person","group","team","hands","hand","face","eye","head",
  "light","dark","night","day","sun","sky","water","sea","land","city","town",
  "street","road","building","house","wall","door","window","room","table",
  "white","black","red","blue","green","color","photo","image","picture",
  "background","texture","pattern","design","concept","idea","symbol",
  "history","historical","old","ancient","heritage","culture","traditional",
]);

// Считаем релевантность хита по тегам относительно запроса
function scoreHit(hit, queryWords) {
  const haystack = (hit.tags || "").toLowerCase();

  // Чёрный список — картинки которые точно не подходят для серьёзных тем
  const BLACKLIST = [
    "heart","love","flower","floral","cute","toy","doll","baby","wedding",
    "valentine","romantic","cartoon","emoji","funny","smile","happy face",
    "gift","birthday","party","balloon","cake","candy","sweet",
    "background texture","pattern","wallpaper","abstract",
  ];
  for (const bad of BLACKLIST) {
    if (haystack.includes(bad)) return -1;
  }

  // Считаем совпадения НЕ-стоп-слов запроса в тегах
  let score = 0;
  for (const word of queryWords) {
    if (word.length < 4) continue;
    if (SCORE_STOPWORDS.has(word)) continue; // пропускаем общие слова
    if (haystack.includes(word)) score += 2;
  }
  // Бонус за популярность (нормализованный)
  score += Math.min((hit.likes || 0) / 500, 1);
  return score;
}

async function fetchPixabay(query, fallbackQuery) {
  if (!PIXABAY_KEY) return null;

  const queries = [query, fallbackQuery].filter(Boolean);

  for (const q of queries) {
    const queryWords = q.toLowerCase().split(/\s+/);

    for (const extra of [{ editors_choice: "true" }, { order: "popular" }]) {
      try {
        const params = new URLSearchParams({
          key: PIXABAY_KEY, q, image_type: "photo",
          orientation: "horizontal", min_width: 1280, min_height: 720,
          safesearch: "true", per_page: "20", lang: "en", ...extra,
        });
        const raw  = await fetchUrl(`https://pixabay.com/api/?${params}`);
        const json = JSON.parse(raw.toString());

        // Фильтруем уже использованные и считаем скор
        const MIN_SCORE = 2; // минимум одно смысловое совпадение слова запроса
        const scored = (json.hits || [])
          .filter(h => !usedPixabayIds.has(h.id))
          .map(h => ({ h, score: scoreHit(h, queryWords) }))
          .filter(({ score }) => score >= MIN_SCORE) // только релевантные
          .sort((a, b) => b.score - a.score);

        if (!scored.length) {
          console.log(`[img] Pixabay q="${q}" extra=${JSON.stringify(extra)}: нет релевантных (score<${MIN_SCORE}), пробуем Wikipedia`);
          continue;
        }

        const best = scored[0].h;
        console.log(`[img] Pixabay ✓ score=${scored[0].score.toFixed(1)} tags="${best.tags?.slice(0,60)}"`);
        usedPixabayIds.add(best.id);
        const imgBuf = await fetchUrl(best.webformatURL);
        return "image/jpeg;base64," + imgBuf.toString("base64");

      } catch (e) {
        console.log(`[img] Pixabay error q="${q}": ${e.message}`);
      }
    }
  }
  return null;
}

async function fetchWikipedia(query) {
  try {
    const raw   = await fetchUrl(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`);
    const title = JSON.parse(raw.toString())?.query?.search?.[0]?.title;
    if (!title) return null;
    const raw2  = await fetchUrl(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&pithumbsize=1200&format=json`);
    const src   = Object.values(JSON.parse(raw2.toString())?.query?.pages||{})[0]?.thumbnail?.source;
    if (!src) return null;
    console.log(`[img] Wikipedia ✓ title="${title}"`);
    const buf = await fetchUrl(src);
    return "image/jpeg;base64," + buf.toString("base64");
  } catch (e) {
    console.log(`[img] Wikipedia error q="${query}": ${e.message}`);
    return null;
  }
}

// Запрос похож на именную сущность (историческая личность, страна, событие)?
// Если да — Wikipedia точнее Pixabay
function looksLikeNamedEntity(q) {
  // Признаки: слова с большой буквы, числа-годы, известные маркеры
  return /[A-Z][a-z]/.test(q) || /\b(19|20)\d{2}\b/.test(q);
}

async function getImage(query, fallback) {
  // Защита от "undefined" строк из AI
  const q1 = (query   && query   !== "undefined") ? query   : null;
  const q2 = (fallback && fallback !== "undefined") ? fallback : null;
  if (!q1) return null;

  if (looksLikeNamedEntity(q1)) {
    // Именная сущность → Wikipedia первой, Pixabay запасной
    return await fetchWikipedia(q1)
        || (q2 ? await fetchWikipedia(q2) : null)
        || await fetchPixabay(q1, q2)
        || null;
  } else {
    // Общий контент → Pixabay первой, Wikipedia запасной
    return await fetchPixabay(q1, q2)
        || await fetchWikipedia(q1)
        || null;
  }
}

async function makePlaceholder(accent) {
  const a = accent || C.gold;
  const svg = `<svg width="800" height="500" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#${C.dark}"/>
      <stop offset="100%" style="stop-color:#${C.mid}"/>
    </linearGradient></defs>
    <rect width="800" height="500" fill="url(#g)"/>
    <circle cx="650" cy="80"  r="200" fill="#${a}" opacity="0.07"/>
    <circle cx="100" cy="420" r="140" fill="#${a}" opacity="0.05"/>
    <rect x="340" y="240" width="120" height="4" rx="2" fill="#${a}" opacity="0.25"/>
  </svg>`;
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality:88 }).toBuffer();
  return "image/jpeg;base64," + buf.toString("base64");
}

// ─── Заголовок слайда ─────────────────────────────────────────────────────────
function addHeader(pres, s, title) {
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:10, h:0.85, fill:{color:C.dark}, line:{color:C.dark} });
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0.835, w:10, h:0.055, fill:{color:C.gold}, line:{color:C.gold} });
  s.addText(title, { x:0.42, y:0, w:9.2, h:0.84, fontSize:23, bold:true, color:C.white, fontFace:"Calibri", valign:"middle", margin:0 });
}

// ════════════════════════════════════════════════════════════════════════════
// РЕНДЕРЕРЫ СЛАЙДОВ
// ════════════════════════════════════════════════════════════════════════════

async function renderTitle(pres, slide) {
  const s   = pres.addSlide();
  const img = await getImage(slide.image_query, slide.image_query2) || await makePlaceholder();

  // Правая половина — картинка
  s.addImage({ data:img, x:4.0, y:0, w:6.0, h:5.625, sizing:{type:"cover",w:6.0,h:5.625} });
  s.addShape(pres.shapes.RECTANGLE, { x:4.0, y:0, w:6.0, h:5.625, fill:{color:C.dark, transparency:55}, line:{color:C.dark} });
  // Левая тёмная панель
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:4.25, h:5.625, fill:{color:C.dark}, line:{color:C.dark} });
  s.addShape(pres.shapes.RECTANGLE, { x:4.18, y:0, w:0.07, h:5.625, fill:{color:C.gold}, line:{color:C.gold} });
  // Декор
  s.addShape(pres.shapes.RECTANGLE, { x:0.5, y:1.2, w:2.9, h:0.045, fill:{color:C.gold}, line:{color:C.gold} });
  s.addText(slide.title||"", { x:0.5, y:1.35, w:3.55, h:2.1, fontSize:28, bold:true, color:C.white, fontFace:"Calibri", margin:0, lineSpacingMultiple:1.2 });
  if (slide.subtitle) {
    s.addShape(pres.shapes.RECTANGLE, { x:0.5, y:3.55, w:2.9, h:0.04, fill:{color:C.gold}, line:{color:C.gold} });
    s.addText(slide.subtitle, { x:0.5, y:3.65, w:3.55, h:0.9, fontSize:12.5, color:C.grayL, fontFace:"Calibri", margin:0, lineSpacingMultiple:1.3 });
  }
  // Нижняя полоса с мета-данными
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:5.05, w:4.25, h:0.575, fill:{color:C.panel}, line:{color:C.panel} });
  s.addText(slide.meta||"", { x:0.5, y:5.08, w:3.6, h:0.48, fontSize:11.5, color:C.gold, fontFace:"Calibri", valign:"middle", margin:0 });
}

async function renderRelevance(pres, slide) {
  const s = pres.addSlide();
  s.background = { color: C.light };
  addHeader(pres, s, slide.title||"Актуальность и цели исследования");

  // Левый блок — цель и задачи
  s.addShape(pres.shapes.RECTANGLE, { x:0.28, y:1.02, w:5.8, h:4.4, fill:{color:C.white}, line:{color:"E2E8F0",width:1}, shadow:mkSh() });
  s.addShape(pres.shapes.RECTANGLE, { x:0.28, y:1.02, w:5.8, h:0.55, fill:{color:C.dark}, line:{color:C.dark} });
  s.addText("Цель и задачи", { x:0.5, y:1.04, w:5.5, h:0.5, fontSize:14, bold:true, color:C.gold, fontFace:"Calibri", valign:"middle", margin:0 });

  s.addShape(pres.shapes.RECTANGLE, { x:0.42, y:1.68, w:0.055, h:0.75, fill:{color:C.gold}, line:{color:C.gold} });
  s.addText("Цель:", { x:0.58, y:1.68, w:1.1, h:0.32, fontSize:12, bold:true, color:C.text, fontFace:"Calibri", margin:0 });
  s.addText(slide.goal||"", { x:0.58, y:1.98, w:5.32, h:0.52, fontSize:12, color:C.muted, fontFace:"Calibri", margin:0, lineSpacingMultiple:1.25 });
  s.addShape(pres.shapes.RECTANGLE, { x:0.42, y:2.62, w:5.5, h:0.03, fill:{color:"E2E8F0"}, line:{color:"E2E8F0"} });
  s.addText("Задачи:", { x:0.58, y:2.72, w:1.5, h:0.32, fontSize:12, bold:true, color:C.text, fontFace:"Calibri", margin:0 });
  const tasks = (slide.tasks||[]).slice(0,5);
  s.addText(tasks.map((t,i)=>({ text:t, options:{bullet:true, breakLine:i<tasks.length-1, color:C.muted, fontSize:12} })),
    { x:0.58, y:3.08, w:5.32, h:2.2, fontFace:"Calibri", margin:0, paraSpaceAfter:6 });

  // Правый блок — объект / предмет
  s.addShape(pres.shapes.RECTANGLE, { x:6.38, y:1.02, w:3.35, h:2.0, fill:{color:C.dark}, line:{color:C.gold,width:1.5}, shadow:mkShS() });
  s.addText("Объект исследования", { x:6.5, y:1.1, w:3.1, h:0.42, fontSize:11.5, bold:true, color:C.gold, fontFace:"Calibri", margin:0 });
  s.addShape(pres.shapes.RECTANGLE, { x:6.5, y:1.54, w:3.05, h:0.03, fill:{color:C.panel}, line:{color:C.panel} });
  s.addText(slide.object||"", { x:6.5, y:1.62, w:3.1, h:1.25, fontSize:12, color:C.white, fontFace:"Calibri", margin:0, lineSpacingMultiple:1.3 });

  s.addShape(pres.shapes.RECTANGLE, { x:6.38, y:3.2, w:3.35, h:2.22, fill:{color:C.panel}, line:{color:C.mid}, shadow:mkShS() });
  s.addText("Предмет исследования", { x:6.5, y:3.28, w:3.1, h:0.42, fontSize:11.5, bold:true, color:C.gold, fontFace:"Calibri", margin:0 });
  s.addShape(pres.shapes.RECTANGLE, { x:6.5, y:3.72, w:3.05, h:0.03, fill:{color:C.mid}, line:{color:C.mid} });
  s.addText(slide.subject||"", { x:6.5, y:3.82, w:3.1, h:1.45, fontSize:12, color:C.grayL, fontFace:"Calibri", margin:0, lineSpacingMultiple:1.3 });
}

async function renderOverview(pres, slide) {
  const s = pres.addSlide();
  s.background = { color: C.light };
  addHeader(pres, s, slide.title||"Структура и ключевые аспекты");
  const cards = (slide.cards||[]).slice(0,4);
  const cW=2.22, cH=4.42, gap=0.18, startX=0.28;
  for (let i=0; i<cards.length; i++) {
    const c=cards[i], x=startX+i*(cW+gap), accent=c.accent||C.gold;
    s.addShape(pres.shapes.RECTANGLE, { x, y:1.02, w:cW, h:cH, fill:{color:C.white}, line:{color:"E2E8F0",width:1}, shadow:mkSh() });
    s.addShape(pres.shapes.RECTANGLE, { x, y:1.02, w:cW, h:0.62, fill:{color:accent}, line:{color:accent} });
    const ico = await renderIcon(c.icon||"FaStar","#FFFFFF");
    s.addImage({ data:ico, x:x+cW/2-0.25, y:1.09, w:0.5, h:0.5 });
    s.addText(c.title||"", { x, y:1.70, w:cW, h:0.4, fontSize:13.5, bold:true, color:C.text, fontFace:"Calibri", align:"center", margin:0 });
    s.addShape(pres.shapes.RECTANGLE, { x:x+0.25, y:2.14, w:cW-0.5, h:0.025, fill:{color:"E2E8F0"}, line:{color:"E2E8F0"} });
    const pts=(c.points||[]).slice(0,5);
    s.addText(pts.map((p,pi)=>({ text:p, options:{bullet:true, breakLine:pi<pts.length-1, color:C.muted, fontSize:11.5} })),
      { x:x+0.15, y:2.22, w:cW-0.25, h:3.1, fontFace:"Calibri", margin:0, paraSpaceAfter:9, valign:"top" });
  }
}

async function renderBulletsImage(pres, slide) {
  const s = pres.addSlide();
  s.background = { color: C.light };
  addHeader(pres, s, slide.title||"");
  const img = await getImage(slide.image_query, slide.image_query2) || await makePlaceholder();
  s.addImage({ data:img, x:5.62, y:0.92, w:4.18, h:4.5, sizing:{type:"cover",w:4.18,h:4.5} });
  s.addShape(pres.shapes.RECTANGLE, { x:5.62, y:0.92, w:4.18, h:4.5, fill:{color:"FFFFFF",transparency:100}, line:{color:C.gold,width:1.2} });
  const points=(slide.points||[]).slice(0,4);
  points.forEach((p,i)=>{
    const y=1.05+i*1.1;
    s.addShape(pres.shapes.RECTANGLE, { x:0.28, y, w:5.1, h:0.96, fill:{color:C.white}, line:{color:"E2E8F0",width:1}, shadow:mkShS() });
    s.addShape(pres.shapes.RECTANGLE, { x:0.28, y, w:0.055, h:0.96, fill:{color:C.gold}, line:{color:C.gold} });
    s.addText(p.heading||"", { x:0.44, y:y+0.06, w:4.82, h:0.32, fontSize:12.5, bold:true, color:C.text, fontFace:"Calibri", margin:0 });
    s.addText(p.text||"",    { x:0.44, y:y+0.38, w:4.82, h:0.5,  fontSize:11.5, color:C.muted, fontFace:"Calibri", margin:0, lineSpacingMultiple:1.2 });
  });
}

async function renderTwoColumns(pres, slide) {
  const s = pres.addSlide();
  s.background = { color: C.light };
  addHeader(pres, s, slide.title||"");
  const renderCol = async (col, x) => {
    const accent = col.accent||C.gold;
    s.addShape(pres.shapes.RECTANGLE, { x, y:1.02, w:4.55, h:4.4, fill:{color:C.white}, line:{color:"E2E8F0",width:1}, shadow:mkSh() });
    s.addShape(pres.shapes.RECTANGLE, { x, y:1.02, w:4.55, h:0.52, fill:{color:accent}, line:{color:accent} });
    s.addText(col.heading||"", { x, y:1.03, w:4.55, h:0.5, fontSize:14, bold:true, color:C.white, fontFace:"Calibri", align:"center", valign:"middle", margin:0 });
    const pts=(col.points||[]).slice(0,6);
    pts.forEach((p,i)=>{
      const y=1.64+i*0.62;
      s.addShape(pres.shapes.RECTANGLE, { x:x+0.18, y, w:0.045, h:0.48, fill:{color:accent}, line:{color:accent} });
      s.addText(p, { x:x+0.34, y:y+0.04, w:4.05, h:0.44, fontSize:12, color:C.text, fontFace:"Calibri", margin:0, lineSpacingMultiple:1.2 });
    });
  };
  await renderCol(slide.col_left||{},  0.28);
  await renderCol(slide.col_right||{}, 5.17);
}

async function renderCards2x2(pres, slide) {
  const s = pres.addSlide();
  s.background = { color: C.light };
  addHeader(pres, s, slide.title||"");
  const cards=(slide.cards||[]).slice(0,4);
  const positions=[{x:0.28,y:1.02},{x:5.14,y:1.02},{x:0.28,y:3.22},{x:5.14,y:3.22}];
  const bW=4.56, bH=2.0;
  for (let i=0; i<cards.length; i++) {
    const c=cards[i], {x,y}=positions[i], accent=c.accent||C.gold;
    s.addShape(pres.shapes.RECTANGLE, { x, y, w:bW, h:bH, fill:{color:C.white}, line:{color:"E2E8F0",width:1}, shadow:mkSh() });
    s.addShape(pres.shapes.RECTANGLE, { x, y, w:0.07, h:bH, fill:{color:accent}, line:{color:accent} });
    s.addShape(pres.shapes.OVAL,      { x:x+0.2, y:y+0.22, w:0.58, h:0.58, fill:{color:accent}, line:{color:accent} });
    const ico = await renderIcon(c.icon||"FaStar","#FFFFFF");
    s.addImage({ data:ico, x:x+0.235, y:y+0.255, w:0.51, h:0.51 });
    s.addText(c.title||"", { x:x+0.9, y:y+0.22, w:bW-1.05, h:0.42, fontSize:13.5, bold:true, color:C.text, fontFace:"Calibri", valign:"middle", margin:0 });
    s.addShape(pres.shapes.RECTANGLE, { x:x+0.9, y:y+0.67, w:bW-1.1, h:0.025, fill:{color:"E8EAED"}, line:{color:"E8EAED"} });
    s.addText(c.text||"", { x:x+0.2, y:y+0.78, w:bW-0.35, h:1.1, fontSize:11.5, color:C.muted, fontFace:"Calibri", margin:0, lineSpacingMultiple:1.25 });
  }
}

async function renderTimeline(pres, slide) {
  const s = pres.addSlide();
  s.background = { color: C.light };
  addHeader(pres, s, slide.title||"");
  const events=(slide.events||[]).slice(0,5);
  s.addShape(pres.shapes.RECTANGLE, { x:0.4, y:3.05, w:9.2, h:0.055, fill:{color:C.navy}, line:{color:C.navy} });
  const nodeW=1.62, xs=[0.42,2.28,4.14,6.0,7.86];
  events.forEach((ev,i)=>{
    const x=xs[i]||0.42+i*1.86, top=i%2===0, nodeY=2.92;
    s.addShape(pres.shapes.OVAL, { x:x+nodeW/2-0.14, y:nodeY, w:0.28, h:0.28, fill:{color:top?C.gold:C.goldL}, line:{color:C.dark,width:1.5} });
    if (top) {
      s.addShape(pres.shapes.RECTANGLE, { x:x+nodeW/2-0.025, y:2.72, w:0.05, h:0.3, fill:{color:C.gold}, line:{color:C.gold} });
      s.addShape(pres.shapes.RECTANGLE, { x, y:1.08, w:nodeW, h:1.6, fill:{color:C.dark}, line:{color:C.gold,width:1}, shadow:mkShS() });
      s.addText(ev.label||"", { x, y:1.1, w:nodeW, h:0.38, fontSize:12.5, bold:true, color:C.gold, fontFace:"Calibri", align:"center", margin:0 });
      s.addShape(pres.shapes.RECTANGLE, { x:x+0.2, y:1.5, w:nodeW-0.4, h:0.03, fill:{color:C.mid}, line:{color:C.mid} });
      s.addText((ev.heading?ev.heading+"\n":"")+(ev.text||""), { x:x+0.1, y:1.56, w:nodeW-0.18, h:1.06, fontSize:10.5, color:C.white, fontFace:"Calibri", align:"center", margin:0, lineSpacingMultiple:1.2 });
    } else {
      s.addShape(pres.shapes.RECTANGLE, { x:x+nodeW/2-0.025, y:3.2, w:0.05, h:0.28, fill:{color:C.goldL}, line:{color:C.goldL} });
      s.addShape(pres.shapes.RECTANGLE, { x, y:3.48, w:nodeW, h:1.86, fill:{color:C.dark}, line:{color:C.goldL,width:1}, shadow:mkShS() });
      s.addText(ev.label||"", { x, y:3.5, w:nodeW, h:0.38, fontSize:12.5, bold:true, color:C.gold, fontFace:"Calibri", align:"center", margin:0 });
      s.addShape(pres.shapes.RECTANGLE, { x:x+0.2, y:3.9, w:nodeW-0.4, h:0.03, fill:{color:C.mid}, line:{color:C.mid} });
      s.addText((ev.heading?ev.heading+"\n":"")+(ev.text||""), { x:x+0.1, y:3.96, w:nodeW-0.18, h:1.3, fontSize:10.5, color:C.white, fontFace:"Calibri", align:"center", margin:0, lineSpacingMultiple:1.2 });
    }
  });
}

async function renderStats(pres, slide) {
  const s = pres.addSlide();
  s.background = { color: C.dark };
  addHeader(pres, s, slide.title||"Ключевые показатели");
  const img = await getImage(slide.image_query, slide.image_query2) || await makePlaceholder();
  s.addImage({ data:img, x:5.0, y:0.92, w:4.85, h:4.5, sizing:{type:"cover",w:4.85,h:4.5} });
  s.addShape(pres.shapes.RECTANGLE, { x:5.0, y:0.92, w:4.85, h:4.5, fill:{color:C.dark,transparency:40}, line:{color:C.gold,width:1.2} });
  const stats=(slide.stats||[]).slice(0,3);
  for (let i=0; i<stats.length; i++) {
    const st=stats[i], y=1.05+i*1.45;
    s.addShape(pres.shapes.RECTANGLE, { x:0.28, y, w:4.5, h:1.3, fill:{color:C.panel}, line:{color:C.mid}, shadow:mkShS() });
    s.addShape(pres.shapes.RECTANGLE, { x:0.28, y, w:0.06, h:1.3, fill:{color:C.gold}, line:{color:C.gold} });
    const ico = await renderIcon(st.icon||"FaStar","#"+C.gold);
    s.addImage({ data:ico, x:0.46, y:y+0.38, w:0.52, h:0.52 });
    s.addText(st.value||"", { x:1.15, y:y+0.08, w:1.7, h:0.75, fontSize:42, bold:true, color:C.gold, fontFace:"Calibri", valign:"middle", margin:0 });
    s.addText(st.label||"", { x:2.9, y:y+0.1, w:1.75, h:1.1, fontSize:12, color:C.grayL, fontFace:"Calibri", valign:"middle", margin:0, lineSpacingMultiple:1.2 });
  }
}

async function renderConclusion(pres, slide) {
  const s = pres.addSlide();
  s.background = { color: C.dark };
  addHeader(pres, s, slide.title||"Выводы");
  const checkIco = await renderIcon("FaCheckCircle","#"+C.gold);
  const points=(slide.points||[]).slice(0,4);
  points.forEach((p,i)=>{
    const y=1.02+i*1.0;
    s.addShape(pres.shapes.RECTANGLE, { x:0.28, y, w:9.44, h:0.84, fill:{color:C.panel}, line:{color:C.mid}, shadow:mkShS() });
    s.addShape(pres.shapes.RECTANGLE, { x:0.28, y, w:0.055, h:0.84, fill:{color:C.gold}, line:{color:C.gold} });
    s.addImage({ data:checkIco, x:0.42, y:y+0.18, w:0.46, h:0.46 });
    s.addText(p.label||"", { x:1.02, y:y+0.1, w:2.1, h:0.62, fontSize:12.5, bold:true, color:C.gold, fontFace:"Calibri", valign:"middle", margin:0 });
    s.addShape(pres.shapes.RECTANGLE, { x:3.12, y:y+0.18, w:0.04, h:0.48, fill:{color:C.mid}, line:{color:C.mid} });
    s.addText(p.text||"", { x:3.28, y:y+0.1, w:6.3, h:0.62, fontSize:12, color:C.white, fontFace:"Calibri", valign:"middle", margin:0, lineSpacingMultiple:1.2 });
  });
  if (slide.quote) {
    s.addShape(pres.shapes.RECTANGLE, { x:0.28, y:5.08, w:9.44, h:0.38, fill:{color:C.gold}, line:{color:C.gold} });
    s.addText(slide.quote, { x:0.28, y:5.08, w:9.44, h:0.38, margin:0, fontSize:12, bold:true, italic:true, color:C.dark, fontFace:"Calibri", align:"center", valign:"middle" });
  }
}

async function renderSources(pres, slide) {
  const s = pres.addSlide();
  s.background = { color: C.light };
  addHeader(pres, s, slide.title||"Список использованной литературы");
  const sources=(slide.sources||[]);
  const half=Math.ceil(sources.length/2);
  const renderCol=(list,x,w)=>{
    s.addShape(pres.shapes.RECTANGLE, { x, y:1.0, w, h:4.45, fill:{color:C.white}, line:{color:"E2E8F0",width:1}, shadow:mkShS() });
    s.addText(list.map((src,i)=>({ text:src, options:{breakLine:i<list.length-1, color:C.muted, fontSize:11} })),
      { x:x+0.18, y:1.1, w:w-0.3, h:4.25, fontFace:"Calibri", margin:0, paraSpaceAfter:8, valign:"top", lineSpacingMultiple:1.3 });
  };
  if (sources.length > 5) {
    renderCol(sources.slice(0,half), 0.28, 4.55);
    renderCol(sources.slice(half),   5.17, 4.55);
  } else {
    renderCol(sources, 0.28, 9.44);
  }
}

async function renderFinal(pres, slide) {
  const s = pres.addSlide();
  const img = await getImage(slide.image_query, slide.image_query2) || await makePlaceholder();
  s.addImage({ data:img, x:0, y:0, w:10, h:5.625, sizing:{type:"cover",w:10,h:5.625} });
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:10, h:5.625, fill:{color:C.dark,transparency:30}, line:{color:C.dark} });
  s.addShape(pres.shapes.RECTANGLE, { x:1.4, y:1.45, w:7.2, h:2.9, fill:{color:C.dark,transparency:25}, line:{color:C.gold,width:1.5}, shadow:mkSh() });
  s.addText(slide.title||"Спасибо за внимание!", { x:1.4, y:1.65, w:7.2, h:1.0, margin:0, fontSize:38, bold:true, color:C.white, fontFace:"Calibri", align:"center" });
  s.addShape(pres.shapes.RECTANGLE, { x:3.5, y:2.78, w:3.0, h:0.05, fill:{color:C.gold}, line:{color:C.gold} });
  s.addText(slide.subtitle||"Готов(а) ответить на ваши вопросы", { x:1.4, y:2.92, w:7.2, h:0.6, margin:0, fontSize:17, color:C.gold, fontFace:"Calibri", align:"center" });
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:5.15, w:10, h:0.475, fill:{color:C.dark}, line:{color:C.dark} });
  s.addText(slide.topic||"", { x:0.3, y:5.17, w:9.4, h:0.42, margin:0, fontSize:11, color:C.gray, fontFace:"Calibri", align:"center", valign:"middle" });
}

// ─── Диспетчер ───────────────────────────────────────────────────────────────
async function renderSlide(pres, slide) {
  switch (slide.type) {
    case "TITLE":      return renderTitle(pres, slide);
    case "RELEVANCE":  return renderRelevance(pres, slide);
    case "OVERVIEW":   return renderOverview(pres, slide);
    case "STATS":      return renderStats(pres, slide);
    case "CONCLUSION": return renderConclusion(pres, slide);
    case "SOURCES":    return renderSources(pres, slide);
    case "FINAL":      return renderFinal(pres, slide);
    case "CONTENT":
      switch (slide.layout) {
        case "two_columns": return renderTwoColumns(pres, slide);
        case "cards_2x2":   return renderCards2x2(pres, slide);
        case "timeline":    return renderTimeline(pres, slide);
        default:            return renderBulletsImage(pres, slide);
      }
    default: console.warn("Unknown slide type:", slide.type);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[pptx_builder] Slides: ${slides.length} → ${OUTPUT_FILE}`);
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  for (let i=0; i<slides.length; i++) {
    console.log(`  [${i+1}/${slides.length}] ${slides[i].type} ${slides[i].layout||""}`);
    await renderSlide(pres, slides[i]);
  }
  await pres.writeFile({ fileName: OUTPUT_FILE });
  console.log("[pptx_builder] Done:", OUTPUT_FILE);
}

main().catch(err => { console.error(err); process.exit(1); });
