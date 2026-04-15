"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import styles from "./PresentationViewer.module.css";
import { accentColor, panelBg, borderColor } from "./slideStyles";

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

export type PresentationData = { accent: string; slides: Slide[] };

// ─── EditableSpan ─────────────────────────────────────────────────────────────
function Editable({
  value,
  onChange,
  accent,
  className,
  style,
  tag: Tag = "span",
}: {
  value: string;
  onChange: (v: string) => void;
  accent: string;
  className?: string;
  style?: React.CSSProperties;
  tag?: keyof React.JSX.IntrinsicElements;
}) {
  const ref = useRef<HTMLElement>(null);
  const ac = accentColor(accent);

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

function SlideTitle({
  sl, accent, onUpdate,
}: {
  sl: Slide; accent: string; slideIdx: number;
  onUpdate: (field: string, val: string) => void;
}) {
  const ac = accentColor(accent);
  const bc = borderColor(accent);

  // Безопасное получение строкового значения поля (никогда не возвращает "None"/"null"/"undefined")
  const v = (field: keyof Slide) => {
    const val = sl[field];
    if (val === null || val === undefined || val === "None" || val === "null" || val === "undefined") return "";
    return String(val);
  };

  // Мета-блок: первые 3 поля всегда (с тире если пусто), кафедра — только если есть
  const alwaysItems = [
    { label: "ВЫПОЛНИЛ",     field: "full_name"  as keyof Slide },
    { label: "ГРУППА",       field: "group"      as keyof Slide },
    { label: "ПРЕПОДАВАТЕЛЬ",field: "teacher"    as keyof Slide },
  ];
  const deptVal = v("department");

  const footLeft = [v("faculty"), v("university")].filter(Boolean).join(" · ");

  return (
    <div className={styles.slide}>
      <div className={`${styles.topBar} ${styles.topBarBig}`} style={{ background: ac }}>
        <Editable value={v("university")} onChange={v2 => onUpdate("university", v2)} accent={accent}
          style={{ color: "#fff", fontSize: 18, fontWeight: 700, letterSpacing: 0.3 }} />
      </div>
      <div className={styles.titleBody}>
        <div className={styles.badge} style={{ background: ac }}>
          <Editable value={v("work_type")} onChange={v2 => onUpdate("work_type", v2)} accent={accent}
            style={{ color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }} />
        </div>
        <Editable value={v("title")} onChange={v2 => onUpdate("title", v2)} accent={accent}
          style={{ color: ac, fontSize: 36, fontWeight: 800, lineHeight: 1.2, textAlign: "center", display: "block" }} />
        <div className={styles.divider} style={{ background: ac }} />
        <div className={styles.metaRow} style={{ border: `1.5px solid ${bc}` }}>
          {alwaysItems.map((m, i) => (
            <div key={m.field} className={styles.metaItem} style={i > 0 ? { borderLeft: `1.5px solid ${bc}` } : undefined}>
              <span className={styles.metaLabel}>{m.label}</span>
              <Editable value={v(m.field) || "—"} onChange={v2 => onUpdate(m.field as string, v2)} accent={accent}
                style={{ color: ac, fontWeight: 700, fontSize: 14 }} />
            </div>
          ))}
          {deptVal && (
            <div className={styles.metaItem} style={{ borderLeft: `1.5px solid ${bc}` }}>
              <span className={styles.metaLabel}>КАФЕДРА</span>
              <Editable value={deptVal} onChange={v2 => onUpdate("department", v2)} accent={accent}
                style={{ color: ac, fontWeight: 700, fontSize: 14 }} />
            </div>
          )}
        </div>
      </div>
      <div className={`${styles.footer} ${styles.footerLarge}`}>
        <span className={styles.footerText}>{footLeft}</span>
        <span className={styles.footerText}>
          <Editable value={v("city")} onChange={v2 => onUpdate("city", v2)} accent={accent} style={{ color: "#9CA3AF", fontSize: 11 }} />
          {v("city") && v("year") ? ", " : ""}
          <Editable value={v("year")} onChange={v2 => onUpdate("year", v2)} accent={accent} style={{ color: "#9CA3AF", fontSize: 11 }} />
        </span>
      </div>
    </div>
  );
}

function SlideToc({
  sl, accent, onUpdate,
}: {
  sl: Slide; accent: string;
  onUpdate: (field: string, val: string) => void;
  onUpdateItem?: (i: number, val: string) => void;
}) {
  const ac = accentColor(accent);
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

  return (
    <div className={styles.slide}>
      <div className={`${styles.topBar} ${styles.topBarTitle}`} style={{ background: ac }}>
        <Editable value={sl.heading || "Содержание"} onChange={v => onUpdate("heading", v)} accent={accent}
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
  sl, accent, slideIdx, images, onImageChange, onUpdate, onUpdateBullet, onUpdateStat,
}: {
  sl: Slide; accent: string; slideIdx: number;
  images: Record<number, string>;
  onImageChange: (i: number, data: string | null) => void;
  onUpdate: (field: string, val: string) => void;
  onUpdateBullet: (bi: number, field: "bold" | "text", val: string) => void;
  onUpdateStat: (si: number, field: "num" | "desc", val: string) => void;
}) {
  const ac = accentColor(accent);
  const pb = panelBg(accent);
  const bc = borderColor(accent);

  const bullets  = (sl.bullets || []).slice(0, 5);
  const stats    = (sl.stats   || []).filter(s => s.num).slice(0, 3);
  const hasImage = !!sl.has_image;
  const hasStats = !hasImage && stats.length > 0;
  const hasSplit = hasImage || hasStats;

  const fontSize = hasSplit ? 15 : 17;
  const gap      = hasSplit ? 22 : 28;

  return (
    <div className={styles.slide}>
      <div className={`${styles.topBar} ${styles.topBarTitle}`} style={{ background: ac }}>
        <Editable value={sl.heading || ""} onChange={v => onUpdate("heading", v)} accent={accent}
          style={{ color: "#fff", fontSize: 24, fontWeight: 700 }} />
        <span className={styles.slideNum}>{String(sl.slide_num || 1).padStart(2, "0")}</span>
      </div>

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
                    <><Editable value={bold} onChange={v => onUpdateBullet(i, "bold", v)} accent={accent}
                      style={{ color: ac, fontWeight: 700 }} />{" "}</>
                  )}
                  <Editable value={text} onChange={v => onUpdateBullet(i, "text", v)} accent={accent} />
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
                  <Editable value={s.num} onChange={v => onUpdateStat(i, "num", v)} accent={accent}
                    className={styles.statNum} style={{ color: ac }} />
                  <Editable value={s.desc} onChange={v => onUpdateStat(i, "desc", v)} accent={accent}
                    className={styles.statDesc} />
                </div>
              </>
            ))}
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <span className={styles.footerText}>{sl.topic || ""}</span>
        <span className={styles.footerText}>{sl.slide_num} / {sl.total}</span>
      </div>
    </div>
  );
}

function SlideConclusion({
  sl, accent, onUpdate, onUpdateItem,
}: {
  sl: Slide; accent: string;
  onUpdate: (field: string, val: string) => void;
  onUpdateItem: (i: number, field: "title" | "text", val: string) => void;
}) {
  const ac = accentColor(accent);
  const pb = panelBg(accent);
  const bc = borderColor(accent);
  const items = (sl.items || []).slice(0, 4);

  return (
    <div className={styles.slide}>
      <div className={`${styles.topBar} ${styles.topBarTitle}`} style={{ background: ac }}>
        <Editable value={sl.heading || "Выводы"} onChange={v => onUpdate("heading", v)} accent={accent}
          style={{ color: "#fff", fontSize: 24, fontWeight: 700 }} />
        <span className={styles.slideNum}>{String(sl.slide_num || 1).padStart(2, "0")}</span>
      </div>
      <div className={styles.conclusionBody}>
        {items.map((it, i) => {
          const title = typeof it === "string" ? it : (it.title || "");
          const text  = typeof it === "string" ? "" : (it.text  || "");
          return (
            <div key={i} className={styles.conclusionCard} style={{ background: pb, borderColor: bc }}>
              <div className={styles.conclusionCardHeader}>
                <div className={styles.conclusionNum} style={{ background: ac }}>{i + 1}</div>
                <Editable value={title} onChange={v => onUpdateItem(i, "title", v)} accent={accent}
                  style={{ color: ac, fontWeight: 700, fontSize: 15 }} />
              </div>
              {(text !== undefined) && (
                <Editable value={text} onChange={v => onUpdateItem(i, "text", v)} accent={accent}
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
  sl, accent, onUpdate,
}: {
  sl: Slide; accent: string;
  onUpdate: (field: string, val: string) => void;
}) {
  const ac = accentColor(accent);
  const bc = borderColor(accent);

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
        <Editable value={sl.title || ""} onChange={v => onUpdate("title", v)} accent={accent}
          className={styles.finalTitle} style={{ color: ac }} tag="div" />
        <div className={styles.finalDivider} style={{ background: bc }} />
        {sl.full_name !== undefined && (
          <Editable value={sl.full_name || ""} onChange={v => onUpdate("full_name", v)} accent={accent}
            className={styles.finalName} />
        )}
      </div>
    </div>
  );
}

// ─── SlideWrapper — масштабирует слайд 1280×720 в контейнер ──────────────────
// containerWidth — ширина скролл-контейнера (offsetWidth, включает его padding)
function SlideWrapper({
  children, containerWidth, isMobile,
}: {
  children: React.ReactNode;
  containerWidth: number;
  isMobile: boolean;
}) {
  // На мобилке padding embeddedScroll = 8px × 2; на десктопе = 16px × 2
  const sidePad = isMobile ? 8 : 16;
  const availableWidth = Math.max(containerWidth - sidePad * 2, 1);
  const scale = availableWidth / 1280;
  const outerHeight = Math.round(720 * scale);
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
  accent?: string;
  mode?: "standalone" | "embedded";
  images?: Record<number, string>;
  onSlidesChange?: (slides: Slide[]) => void;
  onImagesChange?: (images: Record<number, string>) => void;
  /** Коллбэк для кнопки "Заказать" в заглушке (только embedded) */
  onOrder?: () => void;
};

export default function PresentationViewer({
  slides: initialSlides,
  accent = "blue",
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

  // Sync external slides (from parent titleForm changes)
  useEffect(() => { setSlides(initialSlides); }, [initialSlides]);
  useEffect(() => { if (externalImages) setImages(externalImages); }, [externalImages]);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) setContainerWidth(containerRef.current.offsetWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

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

  function renderSlide(sl: Slide, slideIdx: number) {
    const common = { accent, slideIdx };
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

  const isMobile = containerWidth > 0
    ? containerWidth < 600
    : (typeof window !== "undefined" && window.innerWidth < 768);

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
            <SlideWrapper key={idx} containerWidth={containerWidth} isMobile={isMobile}>
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
