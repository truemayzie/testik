"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./ExamplesSection.module.css";

type Example = {
  type: string;
  topic: string;
  pages: number;
  hasToc: boolean;
  hasSources: boolean;
  file: string;
  preview: string;
};

const EXAMPLES: Example[] = [
  {
    type: "Реферат",
    topic: "Искусственный интеллект в современном мире",
    pages: 20,
    hasToc: true,
    hasSources: true,
    file: "/examples/referat.docx",
    preview: "Искусственный интеллект — одна из наиболее динамично развивающихся областей науки, оказывающая влияние на трансформацию экономических, социальных и культурных процессов...",
  },
  {
    type: "Доклад",
    topic: "Социальные сети и психология молодёжи",
    pages: 15,
    hasToc: true,
    hasSources: true,
    file: "/examples/doklad.docx",
    preview: "Современная цифровая реальность кардинально изменила способы коммуникации молодого поколения. Социальные сети превратились в полноценную среду социализации...",
  },
  {
    type: "Курсовая",
    topic: "Анализ финансового рынка России",
    pages: 35,
    hasToc: true,
    hasSources: true,
    file: "/examples/kursovaya.docx",
    preview: "Финансовый рынок России является ключевым элементом национальной экономики, обеспечивающим перераспределение капитала между секторами и формирование инвестиционного климата...",
  },
];

const BADGE_COLORS: Record<string, string> = {
  "Реферат":  "#3B82F6",
  "Доклад":   "#8B5CF6",
  "Курсовая": "#F59E0B",
};

const PRICES: Record<string, number> = {
  "Реферат":  299,
  "Доклад":   199,
  "Курсовая": 699,
};

const DOC_WIDTH = 816;

type Props = {
  onSelectWorkType: (type: string) => void;
};

export default function ExamplesSection({ onSelectWorkType }: Props) {
  const [selected, setSelected]     = useState<Example | null>(null);
  const [closing, setClosing]       = useState(false);
  const [docxBuf, setDocxBuf]       = useState<ArrayBuffer | null>(null); // конвертируем в Blob перед renderAsync
  const [prevLoading, setPrevLoading] = useState(false);
  const previewRef                  = useRef<HTMLDivElement>(null);
  const baseScaleRef                = useRef(1);
  const [mounted, setMounted]       = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Загружаем .docx при выборе примера
  useEffect(() => {
    if (!selected) return;
    setDocxBuf(null);
    setPrevLoading(true);
    fetch(selected.file)
      .then(r => r.arrayBuffer())
      .then(buf => setDocxBuf(buf))
      .catch(() => setPrevLoading(false));
  }, [selected]);

  // Рендерим docx-preview когда буфер готов
  useEffect(() => {
    if (!docxBuf || !previewRef.current) return;
    const container = previewRef.current;
    container.innerHTML = "";
    container.style.transform = "";
    container.style.marginBottom = "";

    const parentW = container.parentElement?.clientWidth || window.innerWidth;

    // ignoreWidth: false — нативная ширина документа, правильные tab stops и точки
    container.style.width = `${DOC_WIDTH}px`;

    const blob = new Blob([docxBuf], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    import("docx-preview").then(({ renderAsync }) => {
      renderAsync(blob, container, undefined, {
        className: "docx-viewer",
        inWrapper: true,
        ignoreWidth: false,   // нативная ширина → правильные tab stops
        ignoreHeight: false,  // фиксированная высота страниц как в редакторе
        experimental: true,   // включает расчёт dot leaders в оглавлении
      }).then(() => {
        // На мобилке ставим минимальный масштаб 0.62 — иначе 14pt текст
        // становится нечитаемым (6pt при scale 0.46). Overflow уйдёт в скролл.
        const isMobile = parentW < 600;
        const MIN_MOBILE = 0.62;
        const raw = parentW / DOC_WIDTH;
        const base = Math.min(1, isMobile ? Math.max(MIN_MOBILE, raw) : raw);
        baseScaleRef.current = base;

        // Сохраняем масштаб как CSS-переменную — используется для компенсации
        // толщины бордеров таблиц (при scale 0.46 граница 1px → 0.46px, пропадает).
        container.style.setProperty("--docx-scale", String(base));

        // Делаем контейнер видимым ДО паузы — иначе getBoundingClientRect()
        // вернёт нули (visibility:hidden) и refreshTabStops не рассчитает dot-leaders.
        container.style.visibility = "visible";

        setTimeout(() => {
          // refreshTabStops отработал (t+500мс) — теперь применяем scale
          if (base < 1) {
            container.style.transform = `scale(${base})`;
            container.style.transformOrigin = "top left";
            const h = container.scrollHeight;
            container.style.marginBottom = `${Math.round(h * base - h)}px`;
          }
          setPrevLoading(false);
        }, 600);
      });
    }).catch(() => setPrevLoading(false));
  }, [docxBuf]);

  // Escape key + scroll lock
  useEffect(() => {
    if (!selected) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeModal(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function openModal(ex: Example) {
    setSelected(ex);
    setClosing(false);
  }

  function closeModal() {
    setClosing(true);
    setTimeout(() => {
      setSelected(null);
      setDocxBuf(null);
      setClosing(false);
    }, 200);
  }

  function handleCreate(ex: Example) {
    closeModal();
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => onSelectWorkType(ex.type), 400);
  }

  const modal = selected && mounted && createPortal(
    <div
      className={`${styles.overlay} ${closing ? styles.overlayClosing : ""}`}
      onClick={closeModal}
    >
      <div
        className={`${styles.box} ${closing ? styles.boxClosing : ""}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button className={styles.closeBtn} onClick={closeModal} aria-label="Закрыть">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {/* Body: left preview + right info */}
        <div className={styles.body}>

          {/* Left: docx preview */}
          <div className={styles.leftCol}>
            {prevLoading && (
              <div className={styles.skeleton}>
                <div className={styles.skeletonBar} style={{ width: "85%" }} />
                <div className={styles.skeletonBar} style={{ width: "70%" }} />
                <div className={styles.skeletonBar} style={{ width: "78%" }} />
                <div className={styles.skeletonBar} style={{ width: "60%" }} />
                <div className={styles.skeletonBar} style={{ width: "88%" }} />
                <div className={styles.skeletonBar} style={{ width: "55%" }} />
              </div>
            )}
            <div
              ref={previewRef}
              className={styles.previewContainer}
              style={{ visibility: prevLoading ? "hidden" : "visible" }}
            />
          </div>

          {/* Right: info panel */}
          <div className={styles.rightCol}>
            <span
              className={styles.modalBadge}
              style={{ background: BADGE_COLORS[selected.type] ?? "#1B3A6B" }}
            >
              {selected.type}
            </span>

            <h2 className={styles.modalTitle}>{selected.topic}</h2>

            <hr className={styles.divider} />

            <ul className={styles.metaList}>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Страниц</span>
                <span className={styles.metaVal}>{selected.pages}</span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Оглавление</span>
                <span className={styles.metaVal} style={{ color: "#22C55E" }}>
                  {selected.hasToc ? "✓ есть" : "—"}
                </span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Список литературы</span>
                <span className={styles.metaVal} style={{ color: "#22C55E" }}>
                  {selected.hasSources ? "✓ есть" : "—"}
                </span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Оформление</span>
                <span className={styles.metaVal}>по ГОСТ</span>
              </li>
            </ul>

            <hr className={styles.divider} />

            <div className={styles.ctaBlock}>
              <button
                className={styles.ctaBtn}
                onClick={() => handleCreate(selected)}
              >
                Создать такую же работу
              </button>
              <p className={styles.ctaNote}>
                от {PRICES[selected.type] ?? 299} ₽ · готово за 3 минуты
              </p>
            </div>
          </div>

        </div>

        {/* Mobile sticky CTA */}
        <div className={styles.mobileCta}>
          <button
            className={styles.ctaBtn}
            onClick={() => handleCreate(selected)}
          >
            Создать такую же работу
          </button>
          <p className={styles.ctaNote}>
            от {PRICES[selected.type] ?? 299} ₽ · готово за 3 минуты
          </p>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <>
      <section className={styles.section}>
        <div className={styles.inner}>
          <div className={styles.head} data-reveal>
            <h2 className={styles.heading}>
              Примеры <span className={styles.accent}>готовых работ</span>
            </h2>
            <p className={styles.sub}>Посмотрите что получают наши пользователи</p>
          </div>

          <div className={styles.grid}>
            {EXAMPLES.map((ex, i) => (
              <button
                key={ex.type}
                className={styles.card}
                data-reveal
                data-delay={String(i + 1)}
                onClick={() => openModal(ex)}
                aria-label={`Открыть пример: ${ex.topic}`}
              >
                <div className={styles.cardTop}>
                  <span
                    className={styles.cardBadge}
                    style={{ color: BADGE_COLORS[ex.type] ?? "#1B3A6B", borderColor: BADGE_COLORS[ex.type] ?? "#1B3A6B" }}
                  >
                    {ex.type}
                  </span>
                  <span className={styles.cardPages}>{ex.pages} стр.</span>
                </div>

                <h3 className={styles.cardTitle}>{ex.topic}</h3>

                <p className={styles.cardPreview}>{ex.preview}</p>

                <div className={styles.cardMeta}>
                  {ex.hasToc && <span className={styles.cardMetaItem}>✓ Оглавление</span>}
                  {ex.hasSources && <span className={styles.cardMetaItem}>✓ Источники</span>}
                  <span className={styles.cardMetaItem}>✓ ГОСТ</span>
                </div>

                <div className={styles.cardBtn}>
                  Открыть пример
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <polyline points="12 5 19 12 12 19"/>
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {modal}
    </>
  );
}
