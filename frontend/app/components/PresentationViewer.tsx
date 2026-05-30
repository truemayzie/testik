"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import styles from "./PresentationViewer.module.css";
import { accentColor, panelBg, borderColor } from "./slideStyles";
import {
  getPresentonThemeColors,
  type PresentonTemplateId,
  type PresentonThemeColors,
  type PresentonThemeId,
} from "@/lib/presentonOptions";

function resolveSlideColors(presentonTheme?: PresentonThemeId, accentKey = "blue"): PresentonThemeColors {
  if (presentonTheme) return getPresentonThemeColors(presentonTheme);
  return {
    primary: accentColor(accentKey),
    panel: panelBg(accentKey),
    border: borderColor(accentKey),
  };
}

function layoutFlags(layout: PresentonTemplateId) {
  return {
    modernTitle: layout !== "general",
    modernHeader: layout !== "general",
    modernConclusion: layout === "modern" || layout === "swift",
    swift: layout === "swift",
  };
}

// ─── Типы ────────────────────────────────────────────────────────────────────
export type Bullet = { bold?: string; text?: string } | string;
export type StatItem = { num: string; desc: string };
export type ConclusionItem = { title: string; text?: string } | string;

export type Slide = {
  type: "TITLE" | "TOC" | "CONTENT" | "CONCLUSION" | "FINAL" | string;
  title?: string;
  work_type?: string;
  university?: string;
  faculty?: string;
  department?: string;
  full_name?: string;
  group?: string;
  teacher?: string;
  city?: string;
  year?: string;
  heading?: string;
  items?: (string | ConclusionItem)[];
  slide_num?: number;
  total?: number;
  topic?: string;
  has_image?: boolean;
  bullets?: Bullet[];
  stats?: StatItem[];
};

export type PresentationData = {
  accent: string;
  slides: Slide[];
  presentonTheme?: string;
  presentonTemplate?: PresentonTemplateId;
};

// ─── EditableSpan ─────────────────────────────────────────────────────────────
function Editable({
  value,
  onChange,
  accentHex,
  className,
  style,
  tag: Tag = "span",
}: {
  value: string;
  onChange: (v: string) => void;
  accentHex: string;
  className?: string;
  style?: React.CSSProperties;
  tag?: keyof React.JSX.IntrinsicElements;
}) {
  const ref = useRef<HTMLElement>(null);
  const ac = accentHex;

  // Sync external value changes to DOM (e.g. from titleForm)
  useEffect(() => {
    if (ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value;
    }
  });

  const El = Tag as "span";
  return (
    <El
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      contentEditable
      suppressContentEditableWarning
      className={className}
      style={{
        outline: "none",
        borderRadius: "4px",
        cursor: "text",
        transition: "outline 0.1s",
        display: "inline",
        minWidth: "1ch",
        ...style,
      }}
      onInput={() => onChange(ref.current?.textContent || "")}
      onBlur={() => onChange(ref.current?.textContent || "")}
      onFocus={e => { (e.currentTarget as HTMLElement).style.outline = `2px solid ${ac}`; }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        if (document.activeElement !== el) el.style.outline = `2px dashed ${ac}66`;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        if (document.activeElement !== el) el.style.outline = "none";
      }}
    />
  );
}

// ─── ImageHolder ──────────────────────────────────────────────────────────────
function ImageHolder({
  slideIdx, images, onImageChange,
}: {
  slideIdx: number;
  images: Record<number, string>;
  onImageChange: (i: number, data: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const img = images[slideIdx];

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onImageChange(slideIdx, ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  if (img) return (
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 12, overflow: "hidden" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      <button
        onClick={() => onImageChange(slideIdx, null)}
        style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.5)", color: "#fff", border: "none", borderRadius: "50%", width: 24, height: 24, cursor: "pointer", fontSize: 12, lineHeight: "24px", padding: 0 }}
      >✕</button>
    </div>
  );

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
      <div
        onClick={() => fileRef.current?.click()}
        style={{ width: "100%", height: "100%", minHeight: 120, borderRadius: 12, border: "2px dashed #CBD5E1", background: "#F8FAFC", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}
      >
        <span style={{ fontSize: 28 }}>🖼</span>
        <span style={{ color: "#9CA3AF", fontSize: 13 }}>Нажмите чтобы добавить фото</span>
      </div>
    </>
  );
}

// ─── Slide components ─────────────────────────────────────────────────────────

function ModernHeader({
  heading, slideNum, total, colors, onHeadingChange,
}: {
  heading: string;
  slideNum?: number;
  total?: number;
  colors: PresentonThemeColors;
  onHeadingChange?: (v: string) => void;
}) {
  const ac = colors.primary;
  const badge = slideNum && total ? `${slideNum} / ${total}` : "";
  return (
    <div className={styles.modernHeader} style={{ borderBottomColor: ac }}>
      {onHeadingChange ? (
        <Editable
          value={heading}
          onChange={onHeadingChange}
          accentHex={colors.primary}
          className={styles.modernHeaderTitle}
          style={{ color: "#111827" }}
        />
      ) : (
        <span className={styles.modernHeaderTitle}>{heading}</span>
      )}
      {badge ? <span className={styles.modernSlideBadge}>{badge}</span> : null}
    </div>
  );
}

function SlideTitle({
  sl, colors, onUpdate, layout = "modern",
}: {
  sl: Slide; colors: PresentonThemeColors; slideIdx: number;
  onUpdate: (field: string, val: string) => void;
  layout?: PresentonTemplateId;
}) {
  const ac = colors.primary;
  const bc = colors.border;

  const v = (field: keyof Slide) => {
    const val = sl[field];
    if (val === null || val === undefined || val === "None" || val === "null" || val === "undefined") return "";
    return String(val);
  };

  const alwaysItems = [
    { label: "Выполнил", field: "full_name" as keyof Slide },
    { label: "Группа", field: "group" as keyof Slide },
    { label: "Преподаватель", field: "teacher" as keyof Slide },
  ];
  const deptVal = v("department");
  const footLeft = [v("faculty"), v("university")].filter(Boolean).join(" · ");

  if (layoutFlags(layout).modernTitle) {
    return (
      <div className={styles.slide}>
        <div className={styles.modernTitleSplit}>
          <div
            className={styles.modernTitleLeft}
            style={{ background: `linear-gradient(145deg, ${ac} 0%, ${ac}cc 55%, ${ac}99 100%)` }}
          >
            <div className={styles.badge} style={{ background: "rgba(255,255,255,0.18)", alignSelf: "flex-start" }}>
              <Editable
                value={v("work_type")}
                onChange={v2 => onUpdate("work_type", v2)}
                accentHex={colors.primary}
                style={{ color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}
              />
            </div>
            <Editable
              value={v("title")}
              onChange={v2 => onUpdate("title", v2)}
              accentHex={colors.primary}
              style={{ color: "#fff", fontSize: 34, fontWeight: 800, lineHeight: 1.15, display: "block" }}
            />
            {v("university") && (
              <Editable
                value={v("university")}
                onChange={v2 => onUpdate("university", v2)}
                accentHex={colors.primary}
                style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, fontWeight: 600 }}
              />
            )}
          </div>
          <div className={styles.modernTitleRight}>
            <div className={styles.modernMetaGrid}>
              {alwaysItems.map(m => (
                <div key={m.field} className={styles.modernMetaCard}>
                  <span className={styles.metaLabel}>{m.label}</span>
                  <Editable
                    value={v(m.field) || "—"}
                    onChange={v2 => onUpdate(m.field as string, v2)}
                    accentHex={colors.primary}
                    style={{ color: ac, fontWeight: 700, fontSize: 14, display: "block", marginTop: 4 }}
                  />
                </div>
              ))}
              {deptVal && (
                <div className={styles.modernMetaCard} style={{ gridColumn: "1 / -1" }}>
                  <span className={styles.metaLabel}>Кафедра</span>
                  <Editable
                    value={deptVal}
                    onChange={v2 => onUpdate("department", v2)}
                    accentHex={colors.primary}
                    style={{ color: ac, fontWeight: 700, fontSize: 14, display: "block", marginTop: 4 }}
                  />
                </div>
              )}
            </div>
            <span style={{ color: "#9CA3AF", fontSize: 12 }}>
              {footLeft}
              {(footLeft && (v("city") || v("year"))) ? " · " : ""}
              {v("city")}{v("city") && v("year") ? ", " : ""}{v("year")}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.slide}>
      <div className={`${styles.topBar} ${styles.topBarBig}`} style={{ background: ac }}>
        <Editable value={v("university")} onChange={v2 => onUpdate("university", v2)} accentHex={colors.primary}
          style={{ color: "#fff", fontSize: 18, fontWeight: 700, letterSpacing: 0.3 }} />
      </div>
      <div className={styles.titleBody}>
        <div className={styles.badge} style={{ background: ac }}>
          <Editable value={v("work_type")} onChange={v2 => onUpdate("work_type", v2)} accentHex={colors.primary}
            style={{ color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }} />
        </div>
        <Editable value={v("title")} onChange={v2 => onUpdate("title", v2)} accentHex={colors.primary}
          style={{ color: ac, fontSize: 36, fontWeight: 800, lineHeight: 1.2, textAlign: "center", display: "block" }} />
        <div className={styles.divider} style={{ background: ac }} />
        <div className={styles.metaRow} style={{ border: `1.5px solid ${bc}` }}>
          {alwaysItems.map((m, i) => (
            <div key={m.field} className={styles.metaItem} style={i > 0 ? { borderLeft: `1.5px solid ${bc}` } : undefined}>
              <span className={styles.metaLabel}>{m.label}</span>
              <Editable value={v(m.field) || "—"} onChange={v2 => onUpdate(m.field as string, v2)} accentHex={colors.primary}
                style={{ color: ac, fontWeight: 700, fontSize: 14 }} />
            </div>
          ))}
          {deptVal && (
            <div className={styles.metaItem} style={{ borderLeft: `1.5px solid ${bc}` }}>
              <span className={styles.metaLabel}>КАФЕДРА</span>
              <Editable value={deptVal} onChange={v2 => onUpdate("department", v2)} accentHex={colors.primary}
                style={{ color: ac, fontWeight: 700, fontSize: 14 }} />
            </div>
          )}
        </div>
      </div>
      <div className={`${styles.footer} ${styles.footerLarge}`}>
        <span className={styles.footerText}>{footLeft}</span>
        <span className={styles.footerText}>
          <Editable value={v("city")} onChange={v2 => onUpdate("city", v2)} accentHex={colors.primary} style={{ color: "#9CA3AF", fontSize: 11 }} />
          {v("city") && v("year") ? ", " : ""}
          <Editable value={v("year")} onChange={v2 => onUpdate("year", v2)} accentHex={colors.primary} style={{ color: "#9CA3AF", fontSize: 11 }} />
        </span>
      </div>
    </div>
  );
}

function SlideToc({
  sl, colors, onUpdate, layout = "modern",
}: {
  sl: Slide; colors: PresentonThemeColors;
  onUpdate: (field: string, val: string) => void;
  onUpdateItem?: (i: number, val: string) => void;
  layout?: PresentonTemplateId;
}) {
  const ac = colors.primary;
  const items = (sl.items || []).map(String);
  const half = Math.ceil(items.length / 2);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function TocCol({ arr, startIdx }: { arr: string[]; startIdx: number }) {
    return (
      <div className={styles.tocCol}>
        {arr.map((it, i) => (
          <div key={i} className={styles.tocItem}>
            <div className={styles.tocNum} style={{ background: ac }}>{startIdx + i + 1}</div>
            <span className={styles.tocText}>{it}</span>
          </div>
        ))}
      </div>
    );
  }

  const lf = layoutFlags(layout);
  const headerClass = lf.swift ? styles.modernHeaderSwift : styles.modernHeader;

  if (lf.modernHeader) {
    return (
      <div className={styles.slide}>
        <div className={headerClass} style={{ borderBottomColor: ac }}>
          <Editable value={sl.heading || "Содержание"} onChange={v => onUpdate("heading", v)} accentHex={colors.primary}
            className={styles.modernHeaderTitle} style={{ color: "#111827" }} />
          <span className={styles.modernSlideBadge}>{sl.slide_num} / {sl.total}</span>
        </div>
        <div className={styles.tocBody}>
          <TocCol arr={items.slice(0, half)} startIdx={0} />
          <TocCol arr={items.slice(half)} startIdx={half} />
        </div>
        <div className={styles.footer}>
          <span className={styles.footerText}>{sl.topic || ""}</span>
          <span className={styles.footerText}>{sl.slide_num} / {sl.total}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.slide}>
      <div className={`${styles.topBar} ${styles.topBarTitle}`} style={{ background: ac }}>
        <Editable value={sl.heading || "Содержание"} onChange={v => onUpdate("heading", v)} accentHex={colors.primary}
          style={{ color: "#fff", fontSize: 24, fontWeight: 700 }} />
        <span className={styles.slideNum}>{String(sl.slide_num || 1).padStart(2, "0")}</span>
      </div>
      <div className={styles.tocBody}>
        <TocCol arr={items.slice(0, half)} startIdx={0} />
        <TocCol arr={items.slice(half)} startIdx={half} />
      </div>
      <div className={styles.footer}>
        <span className={styles.footerText}>{sl.topic || ""}</span>
        <span className={styles.footerText}>{sl.slide_num} / {sl.total}</span>
      </div>
    </div>
  );
}

function SlideContent({
  sl, colors, slideIdx, images, onImageChange, onUpdate, onUpdateBullet, onUpdateStat, layout = "modern",
}: {
  sl: Slide; colors: PresentonThemeColors; slideIdx: number;
  images: Record<number, string>;
  onImageChange: (i: number, data: string | null) => void;
  onUpdate: (field: string, val: string) => void;
  onUpdateBullet: (bi: number, field: "bold" | "text", val: string) => void;
  onUpdateStat: (si: number, field: "num" | "desc", val: string) => void;
  layout?: PresentonTemplateId;
}) {
  const ac = colors.primary;
  const pb = colors.panel;
  const bc = colors.border;

  const bullets  = (sl.bullets || []).slice(0, 5);
  const stats    = (sl.stats   || []).filter(s => s.num).slice(0, 3);
  const hasImage = !!sl.has_image;
  const hasStats = !hasImage && stats.length > 0;
  const hasSplit = hasImage || hasStats;

  const fontSize = hasSplit ? 15 : 17;
  const gap      = hasSplit ? 22 : 28;

  const body = (
      <div className={styles.contentBody}>
        <div
          className={styles.bulletsCol}
          style={{ padding: hasSplit ? "0 60px" : "0 80px", gap }}
        >
          {bullets.map((b, i) => {
            const bold = typeof b === "string" ? b : (b.bold || "");
            const text = typeof b === "string" ? "" : (b.text || "");
            return (
              <div key={i} className={styles.bullet}>
                <div className={styles.dot} style={{ background: ac, marginTop: hasSplit ? 5 : 6 }} />
                <div className={styles.bulletText} style={{ fontSize }}>
                  {(bold !== undefined) && (
                    <><Editable value={bold} onChange={v => onUpdateBullet(i, "bold", v)} accentHex={colors.primary}
                      style={{ color: ac, fontWeight: 700 }} />{" "}</>
                  )}
                  <Editable value={text} onChange={v => onUpdateBullet(i, "text", v)} accentHex={colors.primary} />
                </div>
              </div>
            );
          })}
        </div>

        {hasImage && (
          <div className={styles.statsPanel} style={{ background: pb, borderLeftColor: bc, padding: "20px" }}>
            <ImageHolder slideIdx={slideIdx} images={images} onImageChange={onImageChange} />
          </div>
        )}

        {hasStats && (
          <div className={styles.statsPanel} style={{ background: pb, borderLeftColor: ac }}>
            {stats.map((s, i) => (
              <>
                {i > 0 && <div key={`d${i}`} className={styles.statDivider} style={{ background: bc }} />}
                <div key={i} className={styles.statItem}>
                  <Editable value={s.num} onChange={v => onUpdateStat(i, "num", v)} accentHex={colors.primary}
                    className={styles.statNum} style={{ color: ac }} />
                  <Editable value={s.desc} onChange={v => onUpdateStat(i, "desc", v)} accentHex={colors.primary}
                    className={styles.statDesc} />
                </div>
              </>
            ))}
          </div>
        )}
      </div>
  );

  const lf = layoutFlags(layout);
  const headerClass = lf.swift ? styles.modernHeaderSwift : styles.modernHeader;

  if (lf.modernHeader) {
    return (
      <div className={styles.slide}>
        <div className={headerClass} style={{ borderBottomColor: ac }}>
          <Editable value={sl.heading || ""} onChange={v => onUpdate("heading", v)} accentHex={colors.primary}
            className={styles.modernHeaderTitle} style={{ color: "#111827" }} />
          <span className={styles.modernSlideBadge}>{sl.slide_num} / {sl.total}</span>
        </div>
        {body}
        <div className={styles.footer}>
          <span className={styles.footerText}>{sl.topic || ""}</span>
          <span className={styles.footerText}>{sl.slide_num} / {sl.total}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.slide}>
      <div className={`${styles.topBar} ${styles.topBarTitle}`} style={{ background: ac }}>
        <Editable value={sl.heading || ""} onChange={v => onUpdate("heading", v)} accentHex={colors.primary}
          style={{ color: "#fff", fontSize: 24, fontWeight: 700 }} />
        <span className={styles.slideNum}>{String(sl.slide_num || 1).padStart(2, "0")}</span>
      </div>
      {body}
      <div className={styles.footer}>
        <span className={styles.footerText}>{sl.topic || ""}</span>
        <span className={styles.footerText}>{sl.slide_num} / {sl.total}</span>
      </div>
    </div>
  );
}

function SlideConclusion({
  sl, colors, onUpdate, onUpdateItem, layout = "modern",
}: {
  sl: Slide; colors: PresentonThemeColors;
  onUpdate: (field: string, val: string) => void;
  onUpdateItem: (i: number, field: "title" | "text", val: string) => void;
  layout?: PresentonTemplateId;
}) {
  const ac = colors.primary;
  const pb = colors.panel;
  const bc = colors.border;
  const items = (sl.items || []).slice(0, 4);
  const lf = layoutFlags(layout);
  const headerClass = lf.swift ? styles.modernHeaderSwift : styles.modernHeader;

  if (lf.modernConclusion) {
    return (
      <div className={styles.slide} style={{ background: "#F8FAFC" }}>
        <div className={headerClass} style={{ borderBottomColor: ac }}>
          <Editable value={sl.heading || "Выводы"} onChange={v => onUpdate("heading", v)} accentHex={colors.primary}
            className={styles.modernHeaderTitle} style={{ color: "#111827" }} />
          <span className={styles.modernSlideBadge}>{sl.slide_num} / {sl.total}</span>
        </div>
        <div className={styles.modernConclusionList}>
          {items.map((it, i) => {
            const title = typeof it === "string" ? it : (it.title || "");
            const text  = typeof it === "string" ? "" : (it.text  || "");
            return (
              <div key={i} className={styles.modernConclusionCard}>
                <div className={styles.modernConclusionStripe} style={{ background: ac }} />
                <div style={{ flex: 1 }}>
                  <Editable value={title} onChange={v => onUpdateItem(i, "title", v)} accentHex={colors.primary}
                    style={{ color: ac, fontWeight: 700, fontSize: 16, display: "block" }} />
                  <Editable value={text} onChange={v => onUpdateItem(i, "text", v)} accentHex={colors.primary}
                    className={styles.conclusionText} style={{ display: "block", marginTop: 8 }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className={styles.footer}>
          <span className={styles.footerText}>{sl.topic || sl.heading || ""}</span>
          <span className={styles.footerText}>{sl.slide_num} / {sl.total}</span>
        </div>
      </div>
    );
  }

  const headerBlock = lf.modernHeader ? (
    <div className={headerClass} style={{ borderBottomColor: ac }}>
      <Editable value={sl.heading || "Выводы"} onChange={v => onUpdate("heading", v)} accentHex={colors.primary}
        className={styles.modernHeaderTitle} style={{ color: "#111827" }} />
      <span className={styles.modernSlideBadge}>{sl.slide_num} / {sl.total}</span>
    </div>
  ) : (
    <div className={`${styles.topBar} ${styles.topBarTitle}`} style={{ background: ac }}>
      <Editable value={sl.heading || "Выводы"} onChange={v => onUpdate("heading", v)} accentHex={colors.primary}
        style={{ color: "#fff", fontSize: 24, fontWeight: 700 }} />
      <span className={styles.slideNum}>{String(sl.slide_num || 1).padStart(2, "0")}</span>
    </div>
  );

  return (
    <div className={styles.slide} style={lf.modernHeader ? { background: "#F8FAFC" } : undefined}>
      {headerBlock}
      <div className={styles.conclusionBody}>
        {items.map((it, i) => {
          const title = typeof it === "string" ? it : (it.title || "");
          const text  = typeof it === "string" ? "" : (it.text  || "");
          return (
            <div key={i} className={styles.conclusionCard} style={{ background: pb, borderColor: bc }}>
              <div className={styles.conclusionCardHeader}>
                <div className={styles.conclusionNum} style={{ background: ac }}>{i + 1}</div>
                <Editable value={title} onChange={v => onUpdateItem(i, "title", v)} accentHex={colors.primary}
                  style={{ color: ac, fontWeight: 700, fontSize: 15 }} />
              </div>
              {(text !== undefined) && (
                <Editable value={text} onChange={v => onUpdateItem(i, "text", v)} accentHex={colors.primary}
                  className={styles.conclusionText} style={{ display: "block" }} />
              )}
            </div>
          );
        })}
      </div>
      <div className={styles.footer}>
        <span className={styles.footerText}>{sl.topic || sl.heading || ""}</span>
        <span className={styles.footerText}>{sl.slide_num} / {sl.total}</span>
      </div>
    </div>
  );
}

function SlideFinal({
  sl, colors, onUpdate, layout = "modern",
}: {
  sl: Slide; colors: PresentonThemeColors;
  onUpdate: (field: string, val: string) => void;
  layout?: PresentonTemplateId;
}) {
  const ac = colors.primary;
  const bc = colors.border;

  if (layoutFlags(layout).modernTitle) {
    return (
      <div className={styles.slide}>
        <div className={styles.modernFinalBg}>
          <div className={styles.finalCircle} style={{ borderColor: ac }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M5 14 L11 20 L23 8" stroke={ac} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className={styles.finalLabel}>Спасибо за внимание</span>
          <Editable value={sl.title || ""} onChange={v => onUpdate("title", v)} accentHex={colors.primary}
            className={styles.finalTitle} style={{ color: ac }} tag="div" />
          {sl.full_name !== undefined && (
            <Editable value={sl.full_name || ""} onChange={v => onUpdate("full_name", v)} accentHex={colors.primary}
              className={styles.finalName} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.slide}>
      <div className={styles.finalAccentBar} style={{ background: ac }} />
      <div className={styles.finalBody}>
        <div className={styles.finalCircle} style={{ borderColor: ac }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M5 14 L11 20 L23 8" stroke={ac} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span className={styles.finalLabel}>Спасибо за внимание</span>
        <Editable value={sl.title || ""} onChange={v => onUpdate("title", v)} accentHex={colors.primary}
          className={styles.finalTitle} style={{ color: ac }} tag="div" />
        <div className={styles.finalDivider} style={{ background: bc }} />
        {sl.full_name !== undefined && (
          <Editable value={sl.full_name || ""} onChange={v => onUpdate("full_name", v)} accentHex={colors.primary}
            className={styles.finalName} />
        )}
      </div>
    </div>
  );
}

// ─── SlideWrapper — масштабирует слайд 1280×720 в контейнер ──────────────────
// При первом монтировании вкладка «Презентация» может быть скрыта (display:none):
// offsetWidth=0 → раньше scale≈1/1280 и слайды становились в ~1px по высоте.
function fallbackEmbedWidthPx(): number {
  if (typeof window === "undefined") return 640;
  return Math.min(900, Math.max(340, Math.round(window.innerWidth * 0.58)));
}

function SlideWrapper({
  children, layoutWidth, isMobile,
}: {
  children: React.ReactNode;
  layoutWidth: number;
  isMobile: boolean;
}) {
  const sidePad = isMobile ? 8 : 16;
  const raw = layoutWidth > 48 ? layoutWidth : fallbackEmbedWidthPx();
  const availableWidth = Math.max(raw - sidePad * 2, 120);
  const scale = availableWidth / 1280;
  const outerHeight = Math.max(Math.round(720 * scale), 80);
  return (
    <div style={{ position: "relative", width: "100%", height: outerHeight, overflow: "hidden", borderRadius: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.4)", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: 1280, height: 720, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}

// ─── Основной компонент ───────────────────────────────────────────────────────
type Props = {
  slides: Slide[];
  /** Тема Presenton — задаёт реальные цвета превью */
  presentonTheme?: PresentonThemeId;
  accent?: string;
  /** Шаблон макета Presenton: general | modern | standard | swift */
  layout?: PresentonTemplateId;
  mode?: "standalone" | "embedded";
  images?: Record<number, string>;
  onSlidesChange?: (slides: Slide[]) => void;
  onImagesChange?: (images: Record<number, string>) => void;
  /** Коллбэк для кнопки "Заказать" в заглушке (только embedded) */
  onOrder?: () => void;
};

export default function PresentationViewer({
  slides: initialSlides,
  presentonTheme = "professional-blue",
  accent = "blue",
  layout = "modern",
  mode = "standalone",
  images: externalImages,
  onSlidesChange,
  onImagesChange,
  onOrder,
}: Props) {
  const [slides, setSlides] = useState<Slide[]>(initialSlides);
  const [images, setImages] = useState<Record<number, string>>(externalImages ?? {});
  const [standaloneIdx, setStandaloneIdx] = useState(0);
  const containerRef  = useRef<HTMLDivElement>(null); // embedded: scroll area; standalone: outer
  const [containerWidth, setContainerWidth] = useState(0);

  /** Реальная ширина скролла; если ещё 0 (скрытый родитель), не ломаем масштаб — см. SlideWrapper fallback */
  const layoutWidth =
    containerWidth > 48 ? containerWidth : fallbackEmbedWidthPx();

  // Sync external slides (from parent titleForm changes)
  useEffect(() => { setSlides(initialSlides); }, [initialSlides]);
  useEffect(() => { if (externalImages) setImages(externalImages); }, [externalImages]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mode !== "embedded") return;

    const measure = () => {
      const w = el.offsetWidth || el.clientWidth || 0;
      if (w > 48) setContainerWidth(w);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [mode, slides.length]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mode !== "standalone") return;
    const measure = () =>
      setContainerWidth(el.offsetWidth || el.clientWidth || 0);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [mode, slides.length]);

  /* После смены display у предка Layout может обновиться позже ResizeObserver — догоняем пару кадров */
  useLayoutEffect(() => {
    if (mode !== "embedded" || slides.length === 0) return;
    const el = containerRef.current;
    if (!el) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      const w = el.offsetWidth || el.clientWidth || 0;
      if (w > 48) setContainerWidth(w);
      raf2 = requestAnimationFrame(() => {
        const w2 = el.offsetWidth || el.clientWidth || 0;
        if (w2 > 48) setContainerWidth(w2);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [mode, slides.length]);

  // Slide update helpers
  const updateSlide = useCallback((idx: number, patch: Partial<Slide>) => {
    setSlides(prev => {
      const next = prev.map((s, i) => i === idx ? { ...s, ...patch } : s);
      onSlidesChange?.(next);
      return next;
    });
  }, [onSlidesChange]);

  const updateBullet = useCallback((slideIdx: number, bi: number, field: "bold" | "text", val: string) => {
    setSlides(prev => {
      const bullets = [...(prev[slideIdx].bullets || [])];
      const old = bullets[bi];
      bullets[bi] = { ...(typeof old === "string" ? { bold: old, text: "" } : old), [field]: val };
      const next = prev.map((s, i) => i === slideIdx ? { ...s, bullets } : s);
      onSlidesChange?.(next);
      return next;
    });
  }, [onSlidesChange]);

  const updateStat = useCallback((slideIdx: number, si: number, field: "num" | "desc", val: string) => {
    setSlides(prev => {
      const stats = [...(prev[slideIdx].stats || [])];
      stats[si] = { ...stats[si], [field]: val };
      const next = prev.map((s, i) => i === slideIdx ? { ...s, stats } : s);
      onSlidesChange?.(next);
      return next;
    });
  }, [onSlidesChange]);

  const updateConclusionItem = useCallback((slideIdx: number, ii: number, field: "title" | "text", val: string) => {
    setSlides(prev => {
      const items = [...(prev[slideIdx].items || [])];
      const old = items[ii];
      items[ii] = { ...(typeof old === "string" ? { title: old, text: "" } : old), [field]: val };
      const next = prev.map((s, i) => i === slideIdx ? { ...s, items } : s);
      onSlidesChange?.(next);
      return next;
    });
  }, [onSlidesChange]);

  const handleImageChange = useCallback((idx: number, data: string | null) => {
    setImages(prev => {
      const next = { ...prev };
      if (data === null) delete next[idx]; else next[idx] = data;
      onImagesChange?.(next);
      return next;
    });
  }, [onImagesChange]);

  const slideColors = resolveSlideColors(presentonTheme, accent);

  function renderSlide(sl: Slide, slideIdx: number) {
    const common = { colors: slideColors, slideIdx, layout };
    switch ((sl.type || "").toUpperCase()) {
      case "TITLE":
        return <SlideTitle sl={sl} {...common}
          onUpdate={(f, v) => updateSlide(slideIdx, { [f]: v })} />;
      case "TOC":
        return <SlideToc sl={sl} {...common}
          onUpdate={(f, v) => updateSlide(slideIdx, { [f]: v })} />;
      case "CONTENT":
        return <SlideContent sl={sl} {...common}
          images={images} onImageChange={handleImageChange}
          onUpdate={(f, v) => updateSlide(slideIdx, { [f]: v })}
          onUpdateBullet={(bi, f, v) => updateBullet(slideIdx, bi, f, v)}
          onUpdateStat={(si, f, v) => updateStat(slideIdx, si, f, v)} />;
      case "CONCLUSION":
        return <SlideConclusion sl={sl} {...common}
          onUpdate={(f, v) => updateSlide(slideIdx, { [f]: v })}
          onUpdateItem={(ii, f, v) => updateConclusionItem(slideIdx, ii, f, v)} />;
      case "FINAL":
        return <SlideFinal sl={sl} {...common}
          onUpdate={(f, v) => updateSlide(slideIdx, { [f]: v })} />;
      default:
        return <SlideContent sl={{ ...sl, type: "CONTENT" }} {...common}
          images={images} onImageChange={handleImageChange}
          onUpdate={(f, v) => updateSlide(slideIdx, { [f]: v })}
          onUpdateBullet={(bi, f, v) => updateBullet(slideIdx, bi, f, v)}
          onUpdateStat={(si, f, v) => updateStat(slideIdx, si, f, v)} />;
    }
  }

  const isMobile = layoutWidth < 600
    || (containerWidth <= 48 && typeof window !== "undefined" && window.innerWidth < 768);

  if (slides.length === 0) return null;

  // ── Embedded mode: all slides in scrollable dark container ──────────────────
  if (mode === "embedded") {
    if (slides.length === 0) {
      return (
        <div className={styles.embeddedViewer}>
          <div className={styles.embeddedPlaceholder}>
            <div className={styles.embeddedPlaceholderCard}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/pptx-icon.svg" alt="" style={{ width: 48, height: 48, opacity: 0.8 }} />
              <p className={styles.embeddedPlaceholderTitle}>Презентация не создана</p>
              <p className={styles.embeddedPlaceholderSub}>Закажите презентацию в разделе дополнительных материалов</p>
              {onOrder && (
                <button className={styles.embeddedPlaceholderBtn} onClick={onOrder}>
                  Заказать презентацию →
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className={styles.embeddedViewer}>
        {!isMobile && (
          <div className={styles.embeddedHeader}>
            <span className={styles.embeddedHeaderBadge}>
              {slides.length} слайдов · наведите мышь на текст для редактирования
            </span>
          </div>
        )}
        <div className={styles.embeddedScroll} ref={containerRef}>
          {slides.map((sl, idx) => (
            <SlideWrapper key={idx} layoutWidth={layoutWidth} isMobile={isMobile}>
              {renderSlide(sl, idx)}
            </SlideWrapper>
          ))}
        </div>
      </div>
    );
  }

  // ── Standalone mode: one slide at a time ────────────────────────────────────
  const total = slides.length;
  const scale = containerWidth > 0 ? containerWidth / 1280 : 1;

  return (
    <div className={styles.viewer} ref={containerRef}>
      <div className={styles.aspectBox}>
        <div className={styles.slideInner} style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
          {renderSlide(slides[standaloneIdx], standaloneIdx)}
        </div>
      </div>
      <div className={styles.nav}>
        <button className={styles.navBtn} onClick={() => setStandaloneIdx(i => Math.max(0, i - 1))}
          disabled={standaloneIdx === 0}>‹</button>
        <span className={styles.navInfo}>{standaloneIdx + 1} / {total}</span>
        <button className={styles.navBtn} onClick={() => setStandaloneIdx(i => Math.min(total - 1, i + 1))}
          disabled={standaloneIdx === total - 1}>›</button>
      </div>
    </div>
  );
}
