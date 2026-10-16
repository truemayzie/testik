"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./ExamplesSection.module.css";
import { useModalA11y } from "../lib/useModalA11y";
import { WORK_PRICES, WORK_GEN_TIME } from "../../lib/prices";

type Example = {
  lang: "ru" | "kz";
  type: string;
  topic: string;
  pages: number;
  hasToc: boolean;
  hasSources: boolean;
  file: string;
  preview: string;
};

const EXAMPLES_RU: Example[] = [
  {
    lang: "ru",
    type: "Реферат",
    topic: "Искусственный интеллект в современном мире",
    pages: 20,
    hasToc: true,
    hasSources: true,
    file: "/examples/referat.docx",
    preview: "Искусственный интеллект — одна из наиболее динамично развивающихся областей науки, оказывающая влияние на трансформацию экономических, социальных и культурных процессов...",
  },
  {
    lang: "ru",
    type: "Доклад",
    topic: "Социальные сети и психология молодёжи",
    pages: 15,
    hasToc: true,
    hasSources: true,
    file: "/examples/doklad.docx",
    preview: "Современная цифровая реальность кардинально изменила способы коммуникации молодого поколения. Социальные сети превратились в полноценную среду социализации...",
  },
  {
    lang: "ru",
    type: "Курсовая",
    topic: "Анализ финансового рынка России",
    pages: 35,
    hasToc: true,
    hasSources: true,
    file: "/examples/kursovaya.docx",
    preview: "Финансовый рынок России является ключевым элементом национальной экономики, обеспечивающим перераспределение капитала между секторами и формирование инвестиционного климата...",
  },
];

const EXAMPLES_KZ: Example[] = [
  {
    lang: "kz",
    type: "Реферат",
    topic: "Жасанды интеллектті Қазақстанның білім беру жүйесінде қолдану",
    pages: 20,
    hasToc: true,
    hasSources: true,
    file: "/examples/referat-kz.docx",
    preview: "Жасанды интеллект білім беру саласын жаңғыртудың негізгі факторына айналып отыр. Қазақстан мектептері мен ЖОО-ларда AI құралдарын енгізу оқу сапасын арттыруға ықпал етеді...",
  },
  {
    lang: "kz",
    type: "Доклад",
    topic: "Қазақстандағы цифрлық теңге: енгізу кезеңдері, артықшылықтары мен тәуекелдері",
    pages: 15,
    hasToc: true,
    hasSources: true,
    file: "/examples/doklad-kz.docx",
    preview: "Цифрлық теңге төлем инфрақұрылымын дамытуда маңызды қадам болып саналады. Жоба қаржы нарығының ашықтығын арттырып, көлеңкелі операцияларды азайтуға мүмкіндік береді...",
  },
  {
    lang: "kz",
    type: "Курсовая",
    topic: "Қазақстан Республикасында eGov қызметтерінің тиімділігін талдау",
    pages: 35,
    hasToc: true,
    hasSources: true,
    file: "/examples/kursovaya-kz.docx",
    preview: "Электрондық үкімет азаматтарға мемлекеттік қызметтерді жедел алуға жағдай жасайды. eGov экожүйесінің тиімділігі қолжетімділік, жылдамдық және пайдаланушы тәжірибесі арқылы бағаланады...",
  },
];

const LANG_PREF_KEY = "refai_examples_lang";

const BADGE_COLORS: Record<string, string> = {
  "Реферат":  "#3B82F6",
  "Доклад":   "#8B5CF6",
  "Курсовая": "#F59E0B",
};

const DOC_WIDTH = 816;

type Props = {
  onCreateFromExample: (type: string) => void;
};

export default function ExamplesSection({ onCreateFromExample }: Props) {
  const [selected, setSelected]     = useState<Example | null>(null);
  const [closing, setClosing]       = useState(false);
  const [lang, setLang]             = useState<"ru" | "kz">("ru");
  const [docxBuf, setDocxBuf]       = useState<ArrayBuffer | null>(null); // конвертируем в Blob перед renderAsync
  const [prevLoading, setPrevLoading] = useState(false);
  const previewRef                  = useRef<HTMLDivElement>(null);
  const baseScaleRef                = useRef(1);
  const [mounted, setMounted]       = useState(false);
  const modalRef                    = useRef<HTMLDivElement>(null);
  const closeBtnRef                 = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(LANG_PREF_KEY);
    if (stored === "ru" || stored === "kz") {
      setLang(stored);
      return;
    }
    const qp = new URLSearchParams(window.location.search);
    const utmCampaign = (qp.get("utm_campaign") || "").toLowerCase();
    const utmSource = (qp.get("utm_source") || "").toLowerCase();
    const isKzTraffic = utmCampaign.includes("kz") || utmSource.includes("kz") || utmSource.includes("kaz");
    if (isKzTraffic) setLang("kz");
  }, []);

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
    container.style.transformOrigin = "";
    container.style.marginBottom = "";
    container.style.position = "";
    container.style.left = "";
    container.style.marginLeft = "";

    const targetWidth = Math.min(
      container.parentElement?.clientWidth ?? window.innerWidth,
      window.innerWidth
    ) - 16;

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
        // scale = targetWidth / DOC_WIDTH, но не больше 1.
        // MIN_MOBILE убран: с центрированием top center + left:50% горизонтального
        // overflow нет даже при малом scale — нет смысла искусственно завышать масштаб.
        const raw = targetWidth / DOC_WIDTH;
        const base = Math.min(1, raw);
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
            const w = DOC_WIDTH;
            const h = container.scrollHeight;
            container.style.transform = `scale(${base})`;
            container.style.transformOrigin = "top center";
            container.style.marginBottom = `${Math.round(h * base - h)}px`;
            container.style.position = "relative";
            container.style.left = "50%";
            container.style.marginLeft = `-${w / 2}px`;
          }
          setPrevLoading(false);
        }, 600);
      });
    }).catch(() => setPrevLoading(false));
  }, [docxBuf]);

  // Scroll lock
  useEffect(() => {
    if (!selected) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useModalA11y({
    active: !!selected,
    containerRef: modalRef,
    initialFocusRef: closeBtnRef,
    onClose: closeModal,
  });

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
    const type = ex.type;
    closeModal();
    window.setTimeout(() => onCreateFromExample(type), 220);
  }

  function handleLangToggle(next: "ru" | "kz") {
    setLang(next);
    try {
      localStorage.setItem(LANG_PREF_KEY, next);
    } catch {}
  }

  const examples = lang === "kz" ? EXAMPLES_KZ : EXAMPLES_RU;

  const modal = selected && mounted && createPortal(
    <div
      className={`${styles.overlay} ${closing ? styles.overlayClosing : ""}`}
      onClick={closeModal}
    >
      <div
        ref={modalRef}
        className={`${styles.box} ${closing ? styles.boxClosing : ""}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="examples-modal-title"
      >
        {/* Close */}
        <button ref={closeBtnRef} className={styles.closeBtn} onClick={closeModal} aria-label="Закрыть">
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
              style={{ background: BADGE_COLORS[selected.type] ?? "var(--primary, #1D5CFF)" }}
            >
              {selected.type}
            </span>

            <h2 id="examples-modal-title" className={styles.modalTitle}>{selected.topic}</h2>

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
                от {WORK_PRICES[selected.type]?.price ?? 299} ₽ · {WORK_GEN_TIME[selected.type] ?? "7–8 мин"}
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
            от {WORK_PRICES[selected.type]?.price ?? 299} ₽ · {WORK_GEN_TIME[selected.type] ?? "7–8 мин"}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <>
      <section id="examples" className={styles.section}>
        <div className={styles.inner}>
          <div className={styles.head}>
            <p className={styles.eyebrow}>Примеры работ</p>
            <h2 className={styles.heading}>
              Примеры <span className={styles.accent}>готовых работ</span>
            </h2>
            <p className={styles.sub}>Посмотрите, что получают наши пользователи</p>
            <div className={styles.langToggle} role="tablist" aria-label="Язык примеров работ">
              <button
                type="button"
                role="tab"
                aria-selected={lang === "ru"}
                className={`${styles.langBtn} ${lang === "ru" ? styles.langBtnActive : ""}`}
                onClick={() => handleLangToggle("ru")}
              >
                <span className={`${styles.langFlag} ${styles.langFlagRu}`} aria-hidden="true" />
                RU
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={lang === "kz"}
                className={`${styles.langBtn} ${lang === "kz" ? styles.langBtnActive : ""}`}
                onClick={() => handleLangToggle("kz")}
              >
                <span className={`${styles.langFlag} ${styles.langFlagKz}`} aria-hidden="true" />
                KZ
              </button>
            </div>
            {lang === "kz" && <p className={styles.kzHint}>Қазақ тіліндегі жұмыстар</p>}
          </div>

          <div key={lang} className={`${styles.grid} ${styles.gridFade}`}>
            {examples.map((ex, i) => (
              <button
                key={ex.type}
                className={styles.card}
                onClick={() => openModal(ex)}
                aria-label={`Открыть пример: ${ex.topic}`}
              >
                <div className={styles.cardTop}>
                  <div className={styles.cardBadges}>
                    <span
                      className={styles.cardBadge}
                      style={{ color: BADGE_COLORS[ex.type] ?? "var(--primary, #1D5CFF)", borderColor: BADGE_COLORS[ex.type] ?? "var(--primary, #1D5CFF)" }}
                    >
                      {ex.type}
                    </span>
                    {ex.lang === "kz" && (
                      <span className={styles.cardLang}>KZ</span>
                    )}
                  </div>
                  <span className={styles.cardPages}>{ex.pages} стр.</span>
                </div>

                <h3 className={styles.cardTitle}>{ex.topic}</h3>

                <p className={styles.cardPreview}>{ex.preview}</p>

                <div className={styles.cardMeta}>
                  {ex.hasToc && <span className={styles.cardMetaItem}>✓ Оглавление</span>}
                  {ex.hasSources && <span className={styles.cardMetaItem}>✓ Источники</span>}
                  <span className={styles.cardMetaItem}>
                    {ex.lang === "kz" ? "✓ Стандарт" : "✓ ГОСТ"}
                  </span>
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
