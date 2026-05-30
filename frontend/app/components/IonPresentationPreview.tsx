"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./IonPresentationPreview.module.css";
import {
  type Bullet,
  type IonSlide,
  slideStructureLabel,
} from "@/lib/presentationSlides";

type Props = {
  slides: IonSlide[];
};

function formatBullet(b: Bullet) {
  if (typeof b === "string") return b;
  const bold = b.bold?.trim();
  const text = b.text?.trim();
  if (bold && text) {
    return (
      <>
        <span className={styles.bulletBold}>{bold}</span> {text}
      </>
    );
  }
  return bold || text || "—";
}

function contentHeading(sl: IonSlide): string {
  const t = (sl.type || "").toUpperCase();
  if (t === "TOC") return "Структура презентации";
  if (t === "CONCLUSION") return sl.heading?.trim() || "Выводы";
  return sl.heading?.trim() || "Слайд";
}

function SlideTitle({ sl }: { sl: IonSlide }) {
  return (
    <div className={styles.slideTitle}>
      <h2 className={styles.slideTitleText}>{sl.title?.trim() || "Тема работы"}</h2>
      <p className={styles.slideTitleSub}>{(sl.work_type || "Учебная работа").toUpperCase()}</p>
    </div>
  );
}

function contentBulletNodes(sl: IonSlide): ReactNode[] {
  const t = (sl.type || "").toUpperCase();
  if (t === "TOC") {
    return (sl.items || [])
      .map((it, i) => (
        <li key={i} className={styles.bulletItem}>
          {typeof it === "string" ? it : it.title || "—"}
        </li>
      ));
  }
  if (t === "CONCLUSION") {
    return (sl.items || []).map((it, i) => {
      let text = "—";
      if (typeof it === "string") text = it;
      else {
        const title = it.title?.trim();
        const body = it.text?.trim();
        if (title && body) text = `${title}: ${body}`;
        else text = title || body || "—";
      }
      return (
        <li key={i} className={styles.bulletItem}>
          {text}
        </li>
      );
    });
  }
  const nodes: ReactNode[] = [];
  for (const b of sl.bullets || []) {
    nodes.push(
      <li key={nodes.length} className={styles.bulletItem}>
        {formatBullet(b)}
      </li>,
    );
  }
  for (const st of sl.stats || []) {
    const num = st.num?.trim();
    const desc = st.desc?.trim();
    if (!num) continue;
    nodes.push(
      <li key={nodes.length} className={styles.bulletItem}>
        {desc ? `${num} — ${desc}` : num}
      </li>,
    );
  }
  return nodes;
}

function SlideContentLike({ sl }: { sl: IonSlide }) {
  const nodes = contentBulletNodes(sl);
  return (
    <div className={styles.slideContent}>
      <div className={styles.slideHeader}>
        <span className={styles.slideHeaderAccent} aria-hidden />
        <h3 className={styles.slideHeaderText}>{contentHeading(sl)}</h3>
      </div>
      <div className={styles.slideBody}>
        <ul className={styles.bulletList}>
          {nodes.length ? nodes : (
            <li className={styles.bulletItem}>—</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function SlideFinal({ sl }: { sl: IonSlide }) {
  const text = sl.topic?.trim() || "Спасибо за внимание!";
  return (
    <div className={styles.slideFinal}>
      <p className={styles.slideFinalText}>{text}</p>
    </div>
  );
}

function renderSlide(sl: IonSlide) {
  const t = (sl.type || "").toUpperCase();
  if (t === "TITLE") return <SlideTitle sl={sl} />;
  if (t === "FINAL") return <SlideFinal sl={sl} />;
  return <SlideContentLike sl={sl} />;
}

export default function IonPresentationPreview({ slides }: Props) {
  const [idx, setIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIdx(0);
  }, [slides]);

  const total = slides.length;
  const current = slides[idx];
  const label = current ? slideStructureLabel(current) : "";

  const goPrev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIdx((i) => Math.min(total - 1, i + 1)), [total]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [goPrev, goNext]);

  if (!total) return null;

  return (
    <div className={styles.root} ref={rootRef} tabIndex={0}>
      <div className={styles.header}>
        <span className={styles.headerBadge}>{total} слайдов</span>
      </div>

      <div className={styles.stageWrap}>
        <div className={styles.stage}>{renderSlide(current)}</div>
      </div>

      <div className={styles.footer}>
        <p className={styles.structureLabel} title={label}>
          {label}
        </p>
        <div className={styles.nav}>
          <button
            type="button"
            className={styles.navBtn}
            onClick={goPrev}
            disabled={idx <= 0}
            aria-label="Предыдущий слайд"
          >
            ‹
          </button>
          <span className={styles.navCounter}>
            {idx + 1} / {total}
          </span>
          <button
            type="button"
            className={styles.navBtn}
            onClick={goNext}
            disabled={idx >= total - 1}
            aria-label="Следующий слайд"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
