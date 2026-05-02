#!/usr/bin/env node
/**
 * Сборка PPTX из формата слайдов Claude (как extras / render_slides.js).
 * Без Puppeteer — стабильно на VPS ~2 GB RAM.
 * Usage: node pptx_from_claude.js <input.json> <output.pptx>
 */
"use strict";

const fs = require("fs");
const pptxgen = require("pptxgenjs");

const PAL = {
  blue: {
    dk: "1E3A5F", md: "2E4F7C", acc: "D97706", bg: "F8FAFC", tx: "1F2937", mut: "64748B", pan: "E2E8F0", wh: "FFFFFF",
  },
  green: {
    dk: "1A3328", md: "2D5F4A", acc: "CA8A04", bg: "F7FDF9", tx: "14532D", mut: "4B5563", pan: "D1FAE5", wh: "FFFFFF",
  },
  bordeaux: {
    dk: "4C0519", md: "881337", acc: "F59E0B", bg: "FFFBFB", tx: "1C1917", mut: "57534E", pan: "FEE2E2", wh: "FFFFFF",
  },
};

function accentKey(raw) {
  const a = String(raw || "").toLowerCase();
  if (a === "green") return "green";
  if (a === "bordeaux" || a === "bordeau") return "bordeaux";
  return "blue";
}

function truncate(t, max) {
  const s = String(t || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function topBand(s, pres, heading, slideNum, total, topic, C) {
  const sub = `${slideNum} / ${total}`;
  s.background = { color: C.wh };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 1.08, fill: { color: C.dk }, line: { color: C.dk } });
  s.addText(truncate(heading, 72), {
    x: 0.5, y: 0.2, w: 7.2, h: 0.7, fontSize: 22, bold: true, color: C.wh, valign: "middle", fontFace: "Calibri",
  });
  s.addText(sub, {
    x: 8.2, y: 0.12, w: 1.5, h: 0.9, fontSize: 42, bold: true, color: "FFFFFF", transparency: 62, valign: "top", align: "right",
  });
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 5.52, w: 10, h: 0.105, fill: { color: C.acc }, line: { color: C.acc } });
  s.addText(truncate(topic, 96), {
    x: 0.45, y: 5.58, w: 9.1, h: 0.35, fontSize: 11, color: C.mut, fontFace: "Calibri",
  });
}

async function slideTitle(pres, slide, C) {
  const s = pres.addSlide();
  s.background = { color: C.bg };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.76, fill: { color: C.dk }, line: { color: C.dk } });
  const wt = truncate(slide.work_type, 42) || "Работа";
  s.addShape(pres.shapes.RECTANGLE, { x: 3.82, y: 1.5, w: 2.36, h: 0.4, fill: { color: C.acc }, line: { color: C.acc } });
  s.addText(wt, {
    x: 3.82, y: 1.5, w: 2.36, h: 0.4, fontSize: 11, bold: true, color: C.dk, align: "center", valign: "middle",
    fontFace: "Calibri",
  });
  s.addText(truncate(slide.title, 180), {
    x: 0.6, y: 2.1, w: 8.8, h: 1.95, fontSize: 26, bold: true, color: C.dk, align: "center", valign: "middle",
    fontFace: "Calibri Light", lineSpacingMultiple: 1.15,
  });
  const lines = [];
  if (slide.university) lines.push(`Учебное заведение: ${slide.university}`);
  if (slide.faculty) lines.push(`Факультет: ${slide.faculty}`);
  if (slide.department) lines.push(`Кафедра: ${slide.department}`);
  if (slide.group) lines.push(`Группа: ${slide.group}`);
  if (slide.full_name) lines.push(`Выполнил(а): ${slide.full_name}`);
  if (slide.teacher) lines.push(`Руководитель: ${slide.teacher}`);
  const cityY = `${slide.city || ""}${slide.city && slide.year ? " · " : ""}${slide.year || ""}`;
  if (cityY.trim()) lines.push(cityY);
  s.addShape(pres.shapes.RECTANGLE, { x: 0.85, y: 4.2, w: 8.3, h: 0.035, fill: { color: C.acc }, line: { color: C.acc } });
  s.addText(lines.map((ln) => ({ text: ln, options: { breakLine: true, fontSize: 12.5, color: C.tx, fontFace: "Calibri", paraSpaceBefore: 2, paraSpaceAfter: 4 } })), {
    x: 1, y: 4.38, w: 8.0, h: 1.1, valign: "top",
  });
}

async function slideToc(pres, slide, C) {
  const s = pres.addSlide();
  const total = slide.total || 10;
  const sn = slide.slide_num || 2;
  topBand(s, pres, slide.heading || "Содержание", sn, total, slide.topic || "", C);
  const items = (slide.items || []).map(String);
  const lh = Math.min(0.36, Math.max(0.28, 3.95 / Math.max(items.length, 6)));
  let y = 1.42;
  for (let i = 0; i < items.length && i < 16; i++) {
    const t = `${i + 1}. ${truncate(items[i], 110)}`;
    s.addShape(pres.shapes.OVAL, { x: 0.62, y: y + 0.04, w: 0.28, h: 0.28, fill: { color: C.dk }, line: { color: C.dk } });
    s.addText(`${i + 1}`, {
      x: 0.62, y: y + 0.03, w: 0.28, h: 0.29, fontSize: 11, bold: true, color: C.wh, align: "center", valign: "middle",
    });
    s.addText(t, { x: 1.04, y, w: 8.6, h: lh + 0.06, fontSize: 13.5, color: C.tx, fontFace: "Calibri", valign: "middle" });
    y += lh + 0.14;
    if (y > 5.15) break;
  }
}

async function slideContent(pres, slide, C) {
  const s = pres.addSlide();
  const total = slide.total || 8;
  const sn = slide.slide_num || 1;
  topBand(s, pres, truncate(slide.heading || "Слайд", 80), sn, total, slide.topic || "", C);
  const bullets = (slide.bullets || []).slice(0, 6);
  let y = 1.32;
  for (const b of bullets) {
    const bold = typeof b === "string" ? b : (b.bold || "");
    const txt = typeof b === "string" ? "" : (b.text || "");
    const row = truncate(bold + (bold && txt ? " " : "") + txt, 200);
    s.addShape(pres.shapes.RECTANGLE, { x: 0.55, y: y + 0.06, w: 0.12, h: 0.12, fill: { color: C.dk }, line: { color: C.dk } });
    s.addText(row, {
      x: 0.82, y, w: slide.has_image || (slide.stats && slide.stats.length) ? 5.15 : 8.95, h: 0.48, fontSize: 14,
      color: C.tx, fontFace: "Calibri", lineSpacingMultiple: 1.2,
    });
    y += 0.55;
    if (y > 5) break;
  }
  const hasSplit = !!(slide.has_image || (slide.stats && slide.stats.length));
  if (hasSplit) {
    s.addShape(pres.shapes.RECTANGLE, {
      x: 6.08, y: 1.2, w: 3.5, h: 3.92, fill: { color: C.pan }, line: { color: C.acc, width: 1 },
    });
    const stats = (slide.stats || []).filter((st) => st && st.num).slice(0, 3);
    if (stats.length) {
      let sy = 1.42;
      for (const st of stats) {
        s.addText(truncate(String(st.num), 12), {
          x: 6.25, y: sy, w: 3.2, h: 0.55, fontSize: 38, bold: true, color: C.acc, align: "center",
        });
        s.addText(truncate(st.desc, 140), {
          x: 6.25, y: sy + 0.54, w: 3.2, h: 0.82, fontSize: 11, color: C.mut, align: "center", lineSpacingMultiple: 1.2,
        });
        sy += 1.32;
      }
    } else {
      s.addText("Иллюстрация не загружена\n(нет картинки в данных работы)", {
        x: 6.2, y: 2.5, w: 3.35, h: 1.2, fontSize: 12, color: C.mut, align: "center", valign: "middle",
      });
    }
  }
}

async function slideConclusion(pres, slide, C) {
  const s = pres.addSlide();
  const total = slide.total || 8;
  const sn = slide.slide_num || 7;
  topBand(s, pres, truncate(slide.heading || "Выводы", 70), sn, total, slide.topic || "", C);
  let items = slide.items || [];
  items = items.slice(0, 4).map((it) => (
    typeof it === "string" ? { title: it, text: "" } : { title: String(it.title || ""), text: String(it.text || "") }
  ));
  let y = 1.38;
  const boxH = 1.0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.5, y, w: 9.05, h: boxH, fill: { color: C.wh }, line: { color: C.pan, width: 1 },
    });
    s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y, w: 0.085, h: boxH, fill: { color: C.acc }, line: { color: C.acc } });
    s.addText(`${i + 1}`, {
      x: 0.64, y: y + 0.12, w: 0.35, h: 0.35, fontSize: 12, bold: true, color: C.acc, valign: "middle",
    });
    s.addText(truncate(it.title, 120), {
      x: 1.1, y: y + 0.1, w: 8.35, h: 0.36, fontSize: 13, bold: true, color: C.dk, valign: "top",
    });
    s.addText(truncate(it.text, 320), {
      x: 1.1, y: y + 0.42, w: 8.35, h: 0.58, fontSize: 11.5, color: C.mut, valign: "top", lineSpacingMultiple: 1.2,
    });
    y += boxH + 0.1;
    if (y > 5) break;
  }
}

async function slideFinal(pres, slide, C) {
  const s = pres.addSlide();
  s.background = { color: C.dk };
  s.addShape(pres.shapes.RECTANGLE, {
    x: 1.2, y: 1.6, w: 7.65, h: 2.52, fill: { color: C.md, transparency: 25 }, line: { color: C.acc, width: 2 },
  });
  s.addText(truncate(slide.title || "Спасибо за внимание!", 140), {
    x: 1.25, y: 1.9, w: 7.55, h: 0.95, fontSize: 32, bold: true, color: C.wh, align: "center", valign: "middle",
    fontFace: "Calibri Light",
  });
  s.addText(truncate(slide.full_name || "Готов(а) ответить на вопросы", 80), {
    x: 1.25, y: 2.92, w: 7.55, h: 0.55, fontSize: 16, color: C.acc, align: "center",
  });
  if (slide.topic) {
    s.addText(truncate(slide.topic, 100), {
      x: 0.5, y: 5.25, w: 9, h: 0.42, fontSize: 11, color: "9CA3AF", align: "center",
    });
  }
}

async function slideFallback(pres, slide, C) {
  const s = pres.addSlide();
  s.background = { color: C.bg };
  s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: 0.4, w: 9.2, h: 0.72, fill: { color: C.dk }, line: { color: C.dk } });
  s.addText(`Тип слайда: ${slide.type || "?"}`, { x: 0.55, y: 0.48, w: 8.9, h: 0.56, fontSize: 22, bold: true, color: C.wh });
  s.addText(JSON.stringify(slide, null, 1).slice(0, 1200), {
    x: 0.55, y: 1.4, w: 8.9, h: 3.85, fontSize: 10, color: C.tx, fontFace: "Courier New",
    valign: "top",
  });
}

async function main() {
  const [, , inp, outp] = process.argv;
  if (!inp || !outp) {
    console.error("Usage: node pptx_from_claude.js <input.json> <output.pptx>");
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(inp, "utf8"));
  const slides = raw.slides || [];
  let workType = raw.work_type || "";
  if (!workType && slides[0]?.type === "TITLE") workType = slides[0].work_type || "";

  const C = PAL[accentKey(raw.accent)];
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  console.log("[pptx_from_claude] slides:", slides.length);

  for (let i = 0; i < slides.length; i++) {
    const sl = slides[i];
    const t = String(sl.type || "");
    console.log(`  [${ i + 1}/${slides.length}] ${t}`);
    if (t === "TITLE") await slideTitle(pres, sl, C);
    else if (t === "TOC") await slideToc(pres, sl, C);
    else if (t === "CONTENT") await slideContent(pres, sl, C);
    else if (t === "CONCLUSION") await slideConclusion(pres, sl, C);
    else if (t === "FINAL") await slideFinal(pres, sl, C);
    else await slideFallback(pres, sl, C);
  }

  await pres.writeFile({ fileName: outp });
  console.log("[pptx_from_claude] Done:", outp);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
