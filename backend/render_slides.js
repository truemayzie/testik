#!/usr/bin/env node
/**
 * render_slides.js — рендерит JSON слайдов в PNG через Puppeteer.
 * Читает JSON из stdin: { accent, slides, images }
 * images: { "0": "data:image/...;base64,...", "3": "..." }
 * Выводит в stdout JSON-массив base64-строк.
 */
"use strict";

const puppeteer = require("puppeteer");

// ─── Цвета (в sync с slideStyles.ts) ────────────────────────────────────────
const ACCENT_COLOR  = { blue: "#1E3A5F", green: "#1A3A2A", bordeaux: "#3B1A1A" };
const PANEL_BG      = { blue: "#F0F4F8", green: "#F0F4F0", bordeaux: "#F8F0F0" };
const BORDER_COLOR  = { blue: "#CBD5E1", green: "#C1D5C1", bordeaux: "#D5C1C1" };

function colors(accent) {
  return {
    accent:      ACCENT_COLOR[accent]  || ACCENT_COLOR.blue,
    panel:       PANEL_BG[accent]      || PANEL_BG.blue,
    border:      BORDER_COLOR[accent]  || BORDER_COLOR.blue,
    footerBg:    "#F8FAFC",
    footerLine:  "#E5E7EB",
  };
}

// ─── Утилиты ──────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function pad2(n) { return String(n).padStart(2, "0"); }

function page(body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 1280px; height: 720px; overflow: hidden;
       font-family: 'Segoe UI', Arial, sans-serif; }
</style></head><body>${body}</body></html>`;
}

function footer(c, left, right) {
  return `<div style="background:${c.footerBg};height:52px;display:flex;
    align-items:center;justify-content:space-between;padding:0 80px;
    border-top:1px solid ${c.footerLine};flex-shrink:0;">
    <div style="color:#9CA3AF;font-size:11px;">${esc(left)}</div>
    <div style="color:#9CA3AF;font-size:11px;">${esc(right)}</div>
  </div>`;
}

function topBar(c, heading, slideNum, height) {
  return `<div style="background:${c.accent};height:${height}px;
    display:flex;align-items:center;padding:0 80px;justify-content:space-between;
    flex-shrink:0;">
    <div style="color:#fff;font-size:24px;font-weight:700;">${esc(heading)}</div>
    <div style="color:rgba(255,255,255,0.2);font-size:52px;font-weight:900;line-height:1;">${pad2(slideNum || 1)}</div>
  </div>`;
}

// ─── TITLE ────────────────────────────────────────────────────────────────────
function renderTitle(sl, c) {
  const metaItems = [
    sl.full_name  ? ["Выполнил",     sl.full_name]  : null,
    sl.group      ? ["Группа",       sl.group]       : null,
    sl.teacher    ? ["Преподаватель",sl.teacher]     : null,
    sl.department ? ["Кафедра",      sl.department]  : null,
  ].filter(Boolean);

  const meta = metaItems.length ? `
    <div style="display:flex;border:1.5px solid ${c.border};border-radius:8px;overflow:hidden;">
      ${metaItems.map(([label, val], i) => `
        <div style="padding:10px 28px;display:flex;flex-direction:column;align-items:center;gap:4px;
          ${i > 0 ? `border-left:1.5px solid ${c.border};` : ""}">
          <div style="color:#9CA3AF;font-size:9px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">${esc(label)}</div>
          <div style="color:${c.accent};font-weight:700;font-size:14px;">${esc(val)}</div>
        </div>`).join("")}
    </div>` : "";

  const footLeft  = [sl.faculty, sl.university].filter(Boolean).join(" · ");
  const footRight = [sl.city, sl.year].filter(Boolean).join(", ");

  return page(`
<div style="width:1280px;height:720px;background:#fff;display:flex;flex-direction:column;">
  <div style="background:${c.accent};height:144px;display:flex;align-items:center;
    padding:0 80px;flex-shrink:0;">
    <div style="color:#fff;font-size:18px;font-weight:700;letter-spacing:0.3px;">${esc(sl.university)}</div>
  </div>
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;
    justify-content:center;gap:20px;padding:0 100px;">
    <div style="background:${c.accent};color:#fff;font-size:12px;font-weight:700;
      letter-spacing:2px;text-transform:uppercase;padding:6px 20px;border-radius:4px;">${esc(sl.work_type || "Работа")}</div>
    <div style="color:${c.accent};font-size:36px;font-weight:800;line-height:1.2;text-align:center;">${esc(sl.title)}</div>
    <div style="width:60px;height:3px;background:${c.accent};border-radius:2px;"></div>
    ${meta}
  </div>
  ${footer(c, footLeft, footRight).replace("height:52px", "height:64px")}
</div>`);
}

// ─── TOC ──────────────────────────────────────────────────────────────────────
function renderToc(sl, c) {
  const items = (sl.items || []).map(String);
  const half  = Math.ceil(items.length / 2);

  function col(arr, start) {
    return arr.map((it, i) => `
    <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:18px;">
      <div style="width:30px;height:30px;border-radius:50%;background:${c.accent};
        display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;
        color:#fff;flex-shrink:0;">${start + i + 1}</div>
      <div style="font-size:15px;color:#1F2937;line-height:1.5;padding-top:5px;">${esc(it)}</div>
    </div>`).join("");
  }

  return page(`
<div style="width:1280px;height:720px;background:#fff;display:flex;flex-direction:column;">
  ${topBar(c, sl.heading || "Содержание", sl.slide_num, 130)}
  <div style="flex:1;display:flex;padding:40px 80px;gap:60px;">
    <div style="flex:1;">${col(items.slice(0, half), 0)}</div>
    <div style="flex:1;">${col(items.slice(half), half)}</div>
  </div>
  ${footer(c, sl.topic || "", `${sl.slide_num} / ${sl.total}`)}
</div>`);
}

// ─── CONTENT ──────────────────────────────────────────────────────────────────
function renderContent(sl, c, image) {
  const bullets  = (sl.bullets || []).slice(0, 5);
  const stats    = (sl.stats   || []).filter(s => s.num).slice(0, 3);
  const hasImage = !!sl.has_image;
  const hasStats = !hasImage && stats.length > 0;
  const hasSplit = hasImage || hasStats;

  const fontSize = hasSplit ? "15px" : "17px";
  const gap      = hasSplit ? "22px" : "28px";
  const pad      = hasSplit ? "0 60px" : "0 80px";

  const bulletsHtml = bullets.map(b => {
    const bold = typeof b === "string" ? b : (b.bold || "");
    const text = typeof b === "string" ? "" : (b.text || "");
    return `
    <div style="display:flex;align-items:flex-start;gap:14px;">
      <div style="width:10px;height:10px;border-radius:50%;background:${c.accent};
        flex-shrink:0;margin-top:${hasSplit ? 5 : 6}px;"></div>
      <div style="font-size:${fontSize};line-height:1.6;color:#1F2937;">
        ${bold ? `<strong style="color:${c.accent};font-weight:700;">${esc(bold)}</strong> ` : ""}${esc(text)}
      </div>
    </div>`;
  }).join("");

  let rightHtml = "";
  if (hasImage) {
    if (image) {
      rightHtml = `<div style="width:380px;overflow:hidden;flex-shrink:0;">
        <img src="${image}" style="width:100%;height:100%;object-fit:cover;" />
      </div>`;
    } else {
      rightHtml = `<div style="width:380px;background:${c.panel};border-left:4px solid ${c.border};
        display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;flex-shrink:0;">
        <div style="font-size:32px;">🖼</div>
        <div style="color:#9CA3AF;font-size:13px;">Изображение</div>
      </div>`;
    }
  } else if (hasStats) {
    rightHtml = `<div style="width:380px;background:${c.panel};border-left:4px solid ${c.accent};
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      padding:30px 20px;gap:0;flex-shrink:0;">
      ${stats.map((s, i) => `
        ${i > 0 ? `<div style="width:60px;height:1px;background:${c.border};margin:0 auto;"></div>` : ""}
        <div style="text-align:center;padding:20px 0;width:100%;">
          <div style="color:${c.accent};font-size:48px;font-weight:900;line-height:1;">${esc(s.num)}</div>
          <div style="color:#6B7280;font-size:12px;margin-top:6px;line-height:1.4;">${esc(s.desc)}</div>
        </div>`).join("")}
    </div>`;
  }

  return page(`
<div style="width:1280px;height:720px;background:#fff;display:flex;flex-direction:column;">
  ${topBar(c, sl.heading, sl.slide_num, 130)}
  <div style="flex:1;display:flex;">
    <div style="flex:1;padding:${pad};display:flex;flex-direction:column;
      justify-content:center;gap:${gap};">
      ${bulletsHtml}
    </div>
    ${rightHtml}
  </div>
  ${footer(c, sl.topic || "", `${sl.slide_num} / ${sl.total}`)}
</div>`);
}

// ─── CONCLUSION ───────────────────────────────────────────────────────────────
function renderConclusion(sl, c) {
  const items = (sl.items || []).slice(0, 4);
  const cards = items.map((it, i) => {
    const title = typeof it === "string" ? it : (it.title || "");
    const text  = typeof it === "string" ? "" : (it.text  || "");
    return `
    <div style="background:${c.panel};border:1.5px solid ${c.border};border-radius:10px;
      padding:24px;display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:30px;height:30px;border-radius:50%;background:${c.accent};
          display:flex;align-items:center;justify-content:center;font-size:13px;
          font-weight:800;color:#fff;flex-shrink:0;">${i + 1}</div>
        <div style="font-size:15px;font-weight:700;color:${c.accent};">${esc(title)}</div>
      </div>
      ${text ? `<div style="font-size:13px;color:#6B7280;line-height:1.5;padding-left:42px;">${esc(text)}</div>` : ""}
    </div>`;
  }).join("");

  return page(`
<div style="width:1280px;height:720px;background:#fff;display:flex;flex-direction:column;">
  ${topBar(c, sl.heading || "Выводы", sl.slide_num, 130)}
  <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:28px 80px;">
    ${cards}
  </div>
  ${footer(c, sl.topic || sl.heading || "", `${sl.slide_num} / ${sl.total}`)}
</div>`);
}

// ─── FINAL ────────────────────────────────────────────────────────────────────
function renderFinal(sl, c) {
  return page(`
<div style="width:1280px;height:720px;background:#fff;display:flex;flex-direction:column;">
  <div style="height:8px;background:${c.accent};flex-shrink:0;"></div>
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;
    justify-content:center;gap:22px;">
    <div style="width:64px;height:64px;border-radius:50%;border:2.5px solid ${c.accent};
      display:flex;align-items:center;justify-content:center;">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M5 14 L11 20 L23 8" stroke="${c.accent}" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <div style="color:#9CA3AF;font-size:12px;font-weight:700;letter-spacing:2.5px;
      text-transform:uppercase;">Спасибо за внимание</div>
    <div style="color:${c.accent};font-size:28px;font-weight:800;line-height:1.25;
      text-align:center;max-width:700px;">${esc(sl.title)}</div>
    <div style="width:80px;height:2px;background:${c.border};border-radius:2px;"></div>
    ${sl.full_name ? `<div style="color:#6B7280;font-size:15px;">${esc(sl.full_name)}</div>` : ""}
  </div>
</div>`);
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────
function buildHtml(sl, accent, image) {
  const c = colors(accent);
  switch ((sl.type || "").toUpperCase()) {
    case "TITLE":      return renderTitle(sl, c);
    case "TOC":        return renderToc(sl, c);
    case "CONTENT":    return renderContent(sl, c, image);
    case "CONCLUSION": return renderConclusion(sl, c);
    case "FINAL":      return renderFinal(sl, c);
    default:           return renderContent({ ...sl, type: "CONTENT" }, c, image);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) raw += chunk;

  const data   = JSON.parse(raw);
  const slides = data.slides || [];
  const accent = data.accent || "blue";
  const images = data.images || {};   // { "0": "data:image/...;base64,...", ... }

  // deviceScaleFactor 2 — качество текста и линий в PPTX (логический 1280×720 → PNG 2560×1440).
  // При нехватке RAM на VPS: RENDER_SLIDES_DSF=1 в окружении процесса backend.
  const dsfRaw = parseInt(process.env.RENDER_SLIDES_DSF || "2", 10);
  const deviceScaleFactor = Number.isFinite(dsfRaw)
    ? Math.min(3, Math.max(1, dsfRaw))
    : 2;

  const browser = await puppeteer.launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-software-rasterizer",
    ],
    headless: true,
  });

  const results = [];
  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor });

    for (let i = 0; i < slides.length; i++) {
      const sl    = slides[i];
      const image = images[String(i)] || null;
      const html  = buildHtml(sl, accent, image);

      await page.setContent(html, { waitUntil: "domcontentloaded" });
      const png = await page.screenshot({ type: "png", fullPage: false, encoding: "base64" });
      results.push(png);
    }
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (_) { /* noop */ }
    }
    await browser.close();
  }

  return results;
}

main()
  .then((results) => {
    process.stdout.write(JSON.stringify(results), () => process.exit(0));
  })
  .catch((err) => {
    process.stderr.write(String(err));
    process.exit(1);
  });
