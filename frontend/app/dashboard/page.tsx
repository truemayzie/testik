"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import styles from "./dashboard.module.css";
import PresentationViewer, { type Slide } from "../components/PresentationViewer";

type Generation = {
  id: string;
  topic: string;
  pages: number;
  workType: string;
  status: string;
  createdAt: string;
  slug: string | null;
  extras: string | null; // JSON: {"presentation":"job_id","speech":"job_id"}
};

type ReferatResult = {
  title: string;
  structure: string[];
  content: Record<string, string>;
  sources: string[];
  meta: Record<string, string | number>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile?: Record<string, any>;
};

type PresentationSlides = { accent: string; slides: unknown[] };

type ExtrasData = {
  presentation?: string;
  speech?: string;
  presentationSlides?: PresentationSlides;
};

type ViewingGen = {
  id: string;
  topic: string;
  workType: string;
  pages: number;
  slug: string | null;
  extras: ExtrasData | null;
  result: ReferatResult;
};

const DOC_WIDTH = 816;

const TITLE_PAGE_TYPES = ["Реферат", "Курсовая", "ВКР", "Доклад"];

type TitleForm = {
  fullName: string; university: string; faculty: string;
  department: string; groupNumber: string; teacherName: string;
  city: string; speciality: string; discipline: string;
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting]       = useState<string | null>(null);
  const [copiedId, setCopiedId]       = useState<string | null>(null);

  // DOCX-предпросмотр
  const [viewingGen, setViewingGen]   = useState<ViewingGen | null>(null);
  const [viewingClosing, setViewingClosing] = useState(false);
  const [loadingView, setLoadingView] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const baseScaleRef        = useRef<number>(1);

  // Табы модального окна
  const [modalTab, setModalTab]         = useState<"work" | "presentation">("work");
  const [presImages, setPresImages]     = useState<Record<number, string>>({});
  const [presSlides, setPresSlides]     = useState<Slide[] | null>(null);
  const [downloadingPptx, setDownloadingPptx] = useState(false);

  // Титульный лист
  const [titleForm, setTitleForm]     = useState<TitleForm>({ fullName: "", university: "", faculty: "", department: "", groupNumber: "", teacherName: "", city: "", speciality: "", discipline: "" });
  const [titleUpdating, setTitleUpdating] = useState(false);
  const [saveProfile, setSaveProfile] = useState(false);
  const [skipFaculty, setSkipFaculty]       = useState(false);
  const [skipSpeciality, setSkipSpeciality] = useState(false);
  const [skipDiscipline, setSkipDiscipline] = useState(false);
  const [showMobileTitleForm, setShowMobileTitleForm] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/generations")
        .then(r => r.json())
        .then(data => { setGenerations(data); setLoadingList(false); })
        .catch(() => setLoadingList(false));
    }
  }, [status]);

  // Закрыть по Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") closeViewer(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Блокировать скролл
  useEffect(() => {
    document.body.style.overflow = viewingGen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [viewingGen]);

  function applyScale(container: HTMLElement, scale: number) {
    container.style.setProperty("--docx-scale", String(scale));
    container.style.transform = scale < 1 ? `scale(${scale})` : "";
    container.style.transformOrigin = "top left";
    if (scale < 1) {
      const h = container.scrollHeight;
      container.style.marginBottom = `${Math.round(h * scale - h)}px`;
    } else {
      container.style.marginBottom = "";
    }
  }

  async function renderPreview(data: ReferatResult) {
    const container = previewContainerRef.current;
    if (!container) return;

    container.innerHTML = "";
    container.style.transform = "";
    container.style.marginBottom = "";
    container.style.width = `${DOC_WIDTH}px`;

    const targetWidth = container.parentElement?.clientWidth || window.innerWidth;

    setPreviewLoading(true);
    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const { renderAsync } = await import("docx-preview");

      await renderAsync(blob, container, undefined, {
        className: "docx-preview",
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        experimental: true,
      });
      // experimental=true запускает refreshTabStops через setTimeout(500мс).
      // Применяем scale только ПОСЛЕ него — иначе dot-leader расчёт ломается.
      await new Promise<void>(r => setTimeout(r, 600));
      const base = Math.min(1, targetWidth / DOC_WIDTH);
      baseScaleRef.current = base;
      setPreviewZoom(1);
      applyScale(container, base);
    } catch (e) {
      console.error("[DashPreview] Error:", e);
    } finally {
      setPreviewLoading(false);
    }
  }

  function applyZoom(delta: number) {
    const container = previewContainerRef.current;
    if (!container) return;
    const next = Math.min(2, Math.max(0.3, previewZoom + delta));
    setPreviewZoom(next);
    applyScale(container, baseScaleRef.current * next);
  }

  // Запускаем превью когда модал открылся и ref доступен
  useEffect(() => {
    if (!viewingGen) return;
    renderPreview(viewingGen.result);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingGen?.id]);

  // При открытии модалки — загружаем профиль и заполняем поля титульника
  useEffect(() => {
    if (!viewingGen) return;
    fetch("/api/profile")
      .then(r => r.json())
      .then((data: Record<string, string>) => {
        const hasData = !!(data.fullName || data.university || data.groupNumber);
        setSaveProfile(hasData);
        setTitleForm({
          fullName:    data.fullName    || "",
          university:  data.university  || "",
          faculty:     data.faculty     || "",
          department:  data.department  || "",
          groupNumber: data.groupNumber || "",
          teacherName: data.teacherName || "",
          city:        data.city        || "",
          speciality:  data.speciality  || "",
          discipline:  data.discipline  || "",
        });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingGen?.id]);

  async function handleOpen(id: string) {
    setLoadingView(id);
    try {
      const res  = await fetch(`/api/generations/${id}`);
      const data = await res.json();
      const result: ReferatResult = data.result;
      const gen = generations.find(g => g.id === id);
      let extrasObj: ExtrasData | null = null;
      if (gen?.extras) {
        try { extrasObj = JSON.parse(gen.extras); } catch {}
      }
      setViewingGen({
        id:      data.id,
        topic:   gen?.topic ?? "",
        workType: gen?.workType ?? "Реферат",
        pages:   gen?.pages ?? 0,
        slug:    gen?.slug ?? null,
        extras:  extrasObj,
        result,
      });
      // Инициализируем слайды для вкладки Презентация
      setModalTab("work");
      setPresImages({});
      const ps = extrasObj?.presentationSlides;
      setPresSlides(ps ? (ps.slides as Slide[]) : null);
    } catch {
      alert("Не удалось загрузить работу");
    } finally {
      setLoadingView(null);
    }
  }

  function closeViewer() {
    setViewingClosing(true);
    setTimeout(() => { setViewingGen(null); setViewingClosing(false); }, 200);
  }

  async function persistProfile() {
    if (!saveProfile || !session?.user) return;
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(titleForm),
      });
    } catch {}
  }

  function buildProfilePayload() {
    return { ...titleForm, skipFaculty, skipSpeciality, skipDiscipline };
  }

  async function handleDownloadDocx(gen?: ViewingGen) {
    const src = gen ?? viewingGen;
    if (!src) return;
    const key = gen ? gen.id : "viewer";
    // Если скачиваем из просмотрщика — мержим данные титульника
    const body = (!gen && TITLE_PAGE_TYPES.includes(src.workType))
      ? { ...src.result, profile: { ...(src.result.profile ?? {}), ...buildProfilePayload() } }
      : src.result;
    if (!gen) persistProfile();
    setDownloading(key);
    try {
      const docxRes = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!docxRes.ok) throw new Error();
      const blob = await docxRes.blob();
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${src.result.title.replace(/[«»:]/g, "").trim()}.docx`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Не удалось скачать файл");
    } finally {
      setDownloading(null);
    }
  }

  async function handleTitleUpdate() {
    if (!viewingGen) return;
    setTitleUpdating(true);
    persistProfile();
    const updated = { ...viewingGen.result, profile: { ...(viewingGen.result.profile ?? {}), ...buildProfilePayload() } };
    await renderPreview(updated as typeof viewingGen.result);
    // Синхронизируем TITLE-слайд в презентации
    setPresSlides(prev => {
      if (!prev) return prev;
      const idx = prev.findIndex((s) => (s as { type?: string }).type === "TITLE");
      if (idx < 0) return prev;
      return prev.map((s, i) => i === idx ? {
        ...s,
        university: titleForm.university || "",
        full_name:  titleForm.fullName    || "",
        group:      titleForm.groupNumber || "",
        teacher:    titleForm.teacherName || "",
        city:       titleForm.city        || "",
        faculty:    titleForm.faculty     || "",
        department: titleForm.department  || "",
      } : s);
    });
    setTitleUpdating(false);
  }

  async function handleDownloadExtra(type: "presentation" | "speech") {
    if (!viewingGen?.extras) return;
    if (type === "presentation") {
      const slidesPayload = presSlides
        ? { slides: presSlides, accent: (viewingGen.extras.presentationSlides as { accent?: string } | undefined)?.accent || "blue", images: presImages }
        : viewingGen.extras.presentationSlides;
      if (!slidesPayload) { alert("Данные презентации недоступны. Перегенерируйте дополнительные материалы."); return; }
      setDownloadingPptx(true);
      try {
        const res = await fetch("/api/presentation/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(slidesPayload),
        });
        if (!res.ok) throw new Error("bad response");
        const blob = await res.blob();
        const url  = window.URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url; a.download = "presentation.pptx";
        document.body.appendChild(a); a.click(); a.remove();
        window.URL.revokeObjectURL(url);
      } catch { alert("Ошибка скачивания, попробуйте снова"); }
        finally { setDownloadingPptx(false); }
      return;
    }
    // Речь — скачиваем по jobId из /tmp
    const jobId = viewingGen.extras.speech;
    if (!jobId) return;
    try {
      const res = await fetch(`/api/download/speech/${jobId}`);
      if (!res.ok) { alert("Файл недоступен. Перегенерируйте дополнительные материалы."); return; }
      const blob = await res.blob();
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = "speech.docx";
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch { alert("Не удалось скачать файл."); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить эту работу?")) return;
    setDeleting(id);
    try {
      await fetch(`/api/generations/${id}`, { method: "DELETE" });
      setGenerations(prev => prev.filter(g => g.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("ru-RU", {
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function parseExtras(raw: string | null): ExtrasData | null {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.loadingSpinner} />
      </div>
    );
  }

  const user = session?.user;

  return (
    <div className={styles.page}>

      {/* ── Hero-баннер ── */}
      <div className={styles.heroBanner}>
        <div className={styles.heroShape1} />
        <div className={styles.heroShape2} />
        <div className={styles.heroShape3} />
        <div className={styles.heroDocCards}>
          <div className={styles.heroDocCard}><div className={styles.hdLine}/><div className={styles.hdLine}/><div className={styles.hdLineShort}/><span>РЕФЕРАТ</span></div>
          <div className={`${styles.heroDocCard} ${styles.heroDocCardAlt}`}><div className={styles.hdLine}/><div className={styles.hdLine}/><div className={styles.hdLineShort}/><span>ЭССЕ</span></div>
          <div className={styles.heroDocCard}><div className={styles.hdLine}/><div className={styles.hdLine}/><div className={styles.hdLineShort}/><span>КУРСОВАЯ</span></div>
        </div>
        <div className={styles.heroBannerInner}>
          <div className={styles.heroBannerLeft}>
            <p className={styles.heroBannerGreeting}>Добро пожаловать</p>
            <h1 className={styles.heroBannerTitle}>
              Привет, {user?.name?.split(" ")[0] || "студент"}! 👋
            </h1>
            <div className={styles.heroBannerStats}>
              <div className={styles.heroBannerStat}>
                <span className={styles.heroBannerStatNum}>{generations.length}</span>
                <span className={styles.heroBannerStatLabel}>работ сохранено</span>
              </div>
              <div className={styles.heroBannerDivider}/>
              <div className={styles.heroBannerStat}>
                <span className={styles.heroBannerStatNum}>DOCX</span>
                <span className={styles.heroBannerStatLabel}>формат скачивания</span>
              </div>
              <div className={styles.heroBannerDivider}/>
              <div className={styles.heroBannerStat}>
                <span className={styles.heroBannerStatNum}>ГОСТ</span>
                <span className={styles.heroBannerStatLabel}>оформление</span>
              </div>
            </div>
          </div>
          <a href="/" className={styles.newBtn}>⚡ Новая работа</a>
        </div>
      </div>

      <main className={styles.main}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Мои работы</h2>

          {loadingList ? (
            <div className={styles.listLoading}>
              <div className={styles.loadingSpinner} />
              <span>Загружаем историю...</span>
            </div>
          ) : generations.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>📋</span>
              <p>У вас пока нет сохранённых работ</p>
              <a href="/" className={styles.emptyBtn}>Создать первую работу →</a>
            </div>
          ) : (
            <div className={styles.list}>
              {generations.map(gen => {
                const extrasData = parseExtras(gen.extras);
                const hasPresentation = !!extrasData?.presentation;
                const hasSpeech = !!extrasData?.speech;
                return (
                  <div key={gen.id} className={styles.card}>
                    <div
                      className={styles.cardLeft}
                      onClick={() => handleOpen(gen.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === "Enter" && handleOpen(gen.id)}
                    >
                      <div className={styles.cardBadges}>
                        <span className={styles.workType}>{gen.workType}</span>
                        {hasPresentation && (
                          <span className={styles.extrasBadgePres}>Презентация</span>
                        )}
                        {hasSpeech && (
                          <span className={styles.extrasBadgeSpeech}>Выступление</span>
                        )}
                      </div>
                      <h3 className={styles.cardTitle}>{gen.topic}</h3>
                      <div className={styles.cardMeta}>
                        <span>~{gen.pages} страниц</span>
                        <span className={styles.dot}>·</span>
                        <span suppressHydrationWarning>{formatDate(gen.createdAt)}</span>
                      </div>
                    </div>
                    <div className={styles.cardActions}>
                      <button
                        className={styles.openBtn}
                        onClick={() => handleOpen(gen.id)}
                        disabled={loadingView === gen.id}
                      >
                        {loadingView === gen.id
                          ? <span className={styles.btnSpinner} />
                          : "Открыть"}
                      </button>
                      <button
                        className={styles.downloadBtn}
                        onClick={async () => {
                          setDownloading(gen.id);
                          try {
                            const res  = await fetch(`/api/generations/${gen.id}`);
                            const data = await res.json();
                            const result: ReferatResult = data.result;
                            const docxRes = await fetch("/api/download", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(result),
                            });
                            if (!docxRes.ok) throw new Error();
                            const blob = await docxRes.blob();
                            const url  = window.URL.createObjectURL(blob);
                            const a    = document.createElement("a");
                            a.href     = url;
                            a.download = `${result.title.replace(/[«»:]/g, "").trim()}.docx`;
                            document.body.appendChild(a); a.click(); a.remove();
                            window.URL.revokeObjectURL(url);
                          } catch { alert("Не удалось скачать файл"); }
                          finally { setDownloading(null); }
                        }}
                        disabled={downloading === gen.id}
                      >
                        {downloading === gen.id
                          ? <span className={styles.btnSpinner} />
                          : "⬇ DOCX"}
                      </button>
                      {gen.slug && (
                        <div className={styles.shareWrap}>
                          <button
                            className={styles.shareBtn}
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/preview/${gen.slug}`);
                              setCopiedId(gen.id);
                              setTimeout(() => setCopiedId(null), 2000);
                            }}
                            title="Поделиться"
                          >
                            🔗
                          </button>
                          {copiedId === gen.id && (
                            <span className={styles.copiedTooltip}>Скопировано</span>
                          )}
                        </div>
                      )}
                      <button
                        className={styles.deleteBtn}
                        onClick={() => handleDelete(gen.id)}
                        disabled={deleting === gen.id}
                      >
                        {deleting === gen.id ? <span className={styles.btnSpinner} /> : "✕"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* ── DOCX-МОДАЛ (portal) ── */}
      {viewingGen && createPortal((
        <div
          className={`${styles.docModalOverlay} ${viewingClosing ? styles.docModalOverlayClosing : ""}`}
          onClick={e => { if (e.target === e.currentTarget) closeViewer(); }}
        >
          <div className={`${styles.docModalBox} ${viewingClosing ? styles.docModalBoxClosing : ""}`}>

            {/* Крестик — только на десктопе */}
            <button className={styles.docModalClose} onClick={closeViewer}>✕</button>

            {/* Мобильная шапка */}
            <div className={styles.docMobileHeader}>
              <div>
                <h2 className={styles.docModalTitle}>{viewingGen.result.title}</h2>
                <div className={styles.docModalBadges}>
                  <span className={styles.docBadge}>{viewingGen.workType}</span>
                  <span className={styles.docBadge}>{viewingGen.pages} стр.</span>
                </div>
              </div>
              <button className={styles.docMobileCloseBtn} onClick={closeViewer}>✕</button>
            </div>

            {/* Табы */}
            <div className={styles.docTabs}>
              <button className={`${styles.docTab} ${modalTab === "work" ? styles.docTabActive : ""}`}
                onClick={() => setModalTab("work")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/docx-icon.png" alt="" className={styles.docTabIcon} />
                Работа
              </button>
              <button className={`${styles.docTab} ${modalTab === "presentation" ? styles.docTabActive : ""}`}
                onClick={() => setModalTab("presentation")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/pptx-icon.svg" alt="" className={styles.docTabIcon} />
                Презентация
              </button>
            </div>

            <div className={styles.docModalBody}>

            {/* Левый столбец */}
            <div className={styles.docModalLeft} style={modalTab === "presentation" ? { background: "#1a1a2e" } : undefined}>
              {/* DOCX preview — всегда в DOM, скрыт через CSS при табе Презентация */}
              <div style={{ display: modalTab === "work" ? "block" : "none" }}>
                {previewLoading && (
                  <div className={styles.docPreviewSpinner}>
                    <span className={styles.docSpinner} /> Загружаем предпросмотр...
                  </div>
                )}
                <div ref={previewContainerRef} className={styles.docPreviewContainer} />
              </div>
              {/* PresentationViewer — скрыт при табе Работа */}
              <div style={{ display: modalTab === "presentation" ? "flex" : "none", height: "100%", flexDirection: "column" }}>
                <PresentationViewer
                  slides={presSlides ?? []}
                  accent={(viewingGen.extras?.presentationSlides as { accent?: string } | undefined)?.accent || "blue"}
                  mode="embedded"
                  images={presImages}
                  onSlidesChange={setPresSlides}
                  onImagesChange={setPresImages}
                />
              </div>
            </div>

            {/* Правый столбец — десктоп */}
            <div className={styles.docModalRight}>
              <h2 className={styles.docModalTitle}>{viewingGen.result.title}</h2>
              <div className={styles.docModalBadges}>
                <span className={styles.docBadge}>{viewingGen.workType}</span>
                <span className={styles.docBadge}>{viewingGen.pages} стр.</span>
              </div>
              <hr className={styles.docDivider} />

              {/* Скачать DOCX / PPTX в зависимости от таба */}
              {modalTab === "presentation" && presSlides ? (
                <button className={styles.docDownloadBtn} onClick={() => handleDownloadExtra("presentation")}
                  disabled={downloadingPptx}
                  style={{ background: downloadingPptx ? "#374151" : "#1E3A5F", color: "#fff" }}>
                  {downloadingPptx
                    ? <><span className={styles.docBtnSpinner} />Генерируем файл...</>
                    : <><img src="/pptx-icon.svg" alt="" className={styles.docDownloadIcon} />Скачать PPTX</>}
                </button>
              ) : (
                <button
                  className={styles.docDownloadBtn}
                  onClick={() => handleDownloadDocx()}
                  disabled={downloading === "viewer"}
                >
                  {downloading === "viewer"
                    ? <><span className={styles.docBtnSpinner} />Создаём...</>
                    : <><img src="/docx-icon.png" alt="" className={styles.docDownloadIcon} />Скачать DOCX</>}
                </button>
              )}

              {/* Дополнительные материалы — только выступление, PPTX скачивается большой кнопкой */}
              {viewingGen.extras?.speech && (
                <>
                  <hr className={styles.docDivider} />
                  <p className={styles.docExtrasHeading}>Дополнительные материалы</p>
                  <div className={styles.docExtrasDownloads}>
                    <button
                      className={styles.docExtrasDownloadBtn}
                      onClick={() => handleDownloadExtra("speech")}
                    >
                      <img src="/txt-icon.svg" alt="" className={styles.docDownloadIcon} />
                      Выступление .txt
                    </button>
                  </div>
                </>
              )}

              {viewingGen.slug && (
                <>
                  <hr className={styles.docDivider} />
                  <button
                    className={styles.docShareBtn}
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/preview/${viewingGen.slug}`);
                    }}
                  >
                    🔗 Скопировать ссылку
                  </button>
                </>
              )}

              {TITLE_PAGE_TYPES.includes(viewingGen.workType) && (
                <>
                  <hr className={styles.docDivider} />
                  <div className={styles.docTitleSection}>
                    <p className={styles.docTitleHeading}>Данные для документов</p>
                    <p className={styles.docTitleSub}>Подставляются в работу и презентацию</p>
                    <input className={styles.docTitleInput} placeholder="ФИО студента" value={titleForm.fullName} onChange={e => setTitleForm(prev => ({ ...prev, fullName: e.target.value }))} />
                    <input className={styles.docTitleInput} placeholder="Университет" value={titleForm.university} onChange={e => setTitleForm(prev => ({ ...prev, university: e.target.value }))} />
                    <label className={styles.docSkipRow}>
                      <input type="checkbox" checked={skipFaculty} onChange={e => setSkipFaculty(e.target.checked)} />
                      <span>Не указывать факультет</span>
                    </label>
                    {!skipFaculty && <input className={styles.docTitleInput} placeholder="Направление / факультет" value={titleForm.faculty} onChange={e => setTitleForm(prev => ({ ...prev, faculty: e.target.value }))} />}
                    <label className={styles.docSkipRow}>
                      <input type="checkbox" checked={skipSpeciality} onChange={e => setSkipSpeciality(e.target.checked)} />
                      <span>Не указывать специализацию</span>
                    </label>
                    {!skipSpeciality && <input className={styles.docTitleInput} placeholder="Специализация" value={titleForm.speciality} onChange={e => setTitleForm(prev => ({ ...prev, speciality: e.target.value }))} />}
                    <label className={styles.docSkipRow}>
                      <input type="checkbox" checked={skipDiscipline} onChange={e => setSkipDiscipline(e.target.checked)} />
                      <span>Не указывать предмет</span>
                    </label>
                    {!skipDiscipline && <input className={styles.docTitleInput} placeholder="Предмет / дисциплина" value={titleForm.discipline} onChange={e => setTitleForm(prev => ({ ...prev, discipline: e.target.value }))} />}
                    <input className={styles.docTitleInput} placeholder="Кафедра" value={titleForm.department} onChange={e => setTitleForm(prev => ({ ...prev, department: e.target.value }))} />
                    <input className={styles.docTitleInput} placeholder="Группа" value={titleForm.groupNumber} onChange={e => setTitleForm(prev => ({ ...prev, groupNumber: e.target.value }))} />
                    <input className={styles.docTitleInput} placeholder="Научный руководитель" value={titleForm.teacherName} onChange={e => setTitleForm(prev => ({ ...prev, teacherName: e.target.value }))} />
                    <input className={styles.docTitleInput} placeholder="Город" value={titleForm.city} onChange={e => setTitleForm(prev => ({ ...prev, city: e.target.value }))} />
                    <button className={styles.docUpdateBtn} onClick={handleTitleUpdate} disabled={titleUpdating}>
                      {titleUpdating ? "Обновляем..." : "↻ Обновить документ"}
                    </button>
                    <label className={styles.docSaveProfileRow}>
                      <input
                        type="checkbox"
                        className={styles.docSaveProfileCheck}
                        checked={saveProfile}
                        onChange={e => setSaveProfile(e.target.checked)}
                      />
                      <span>Запомнить данные</span>
                    </label>
                  </div>
                </>
              )}
            </div>

            </div>{/* /docModalBody */}

            {/* Мобильная нижняя панель */}
            <div className={styles.docMobileBottom}>
              {!previewLoading && modalTab === "work" && (
                <div className={styles.docMobileZoomRow}>
                  <button className={styles.docMobileZoomBtn} onClick={() => applyZoom(0.1)}>＋</button>
                  <span className={styles.docMobileZoomLabel}>{Math.round(baseScaleRef.current * previewZoom * 100)}%</span>
                  <button className={styles.docMobileZoomBtn} onClick={() => applyZoom(-0.1)}>－</button>
                </div>
              )}
              {modalTab === "presentation" && presSlides ? (
                <button
                  className={styles.docDownloadBtn}
                  onClick={() => handleDownloadExtra("presentation")}
                  disabled={downloadingPptx}
                  style={{ background: downloadingPptx ? "#374151" : "#1E3A5F", color: "#fff" }}
                >
                  {downloadingPptx
                    ? <><span className={styles.docBtnSpinner} />Генерируем файл...</>
                    : <><img src="/pptx-icon.svg" alt="" className={styles.docDownloadIcon} />Скачать PPTX</>}
                </button>
              ) : (
                <button
                  className={styles.docDownloadBtn}
                  onClick={() => handleDownloadDocx()}
                  disabled={downloading === "viewer"}
                >
                  {downloading === "viewer"
                    ? <><span className={styles.docBtnSpinner} />Создаём...</>
                    : <><img src="/docx-icon.png" alt="" className={styles.docDownloadIcon} />Скачать DOCX</>}
                </button>
              )}
              {viewingGen.extras?.speech && (
                <div className={styles.docExtrasDownloadsMobile}>
                  <button className={styles.docExtrasDownloadBtnSmall} onClick={() => handleDownloadExtra("speech")}>
                    <img src="/txt-icon.svg" alt="" className={styles.docDownloadIcon} />
                    Выступление .txt
                  </button>
                </div>
              )}
              {TITLE_PAGE_TYPES.includes(viewingGen.workType) && (
                <button className={styles.docMobileTitleBtn} onClick={() => setShowMobileTitleForm(true)}>
                  Данные для документов
                </button>
              )}
            </div>

          {/* Мобильная форма титульника — оверлей поверх модала */}
          {showMobileTitleForm && TITLE_PAGE_TYPES.includes(viewingGen.workType) && (
            <div className={styles.docMobileTitleOverlay}>
              <div className={styles.docMobileTitleSheetHeader}>
                <div>
                  <p className={styles.docTitleHeading}>Данные для документов</p>
                  <p className={styles.docTitleSub}>Подставляются в работу и презентацию</p>
                </div>
                <button className={styles.docMobileTitleSheetClose} onClick={() => setShowMobileTitleForm(false)}>✕</button>
              </div>
              <div className={styles.docMobileTitleSheetBody}>
                <input className={styles.docTitleInput} placeholder="ФИО студента" value={titleForm.fullName} onChange={e => setTitleForm(prev => ({ ...prev, fullName: e.target.value }))} />
                <input className={styles.docTitleInput} placeholder="Университет" value={titleForm.university} onChange={e => setTitleForm(prev => ({ ...prev, university: e.target.value }))} />
                <label className={styles.docSkipRow}>
                  <input type="checkbox" checked={skipFaculty} onChange={e => setSkipFaculty(e.target.checked)} />
                  <span>Не указывать факультет</span>
                </label>
                {!skipFaculty && <input className={styles.docTitleInput} placeholder="Направление / факультет" value={titleForm.faculty} onChange={e => setTitleForm(prev => ({ ...prev, faculty: e.target.value }))} />}
                <label className={styles.docSkipRow}>
                  <input type="checkbox" checked={skipSpeciality} onChange={e => setSkipSpeciality(e.target.checked)} />
                  <span>Не указывать специализацию</span>
                </label>
                {!skipSpeciality && <input className={styles.docTitleInput} placeholder="Специализация" value={titleForm.speciality} onChange={e => setTitleForm(prev => ({ ...prev, speciality: e.target.value }))} />}
                <label className={styles.docSkipRow}>
                  <input type="checkbox" checked={skipDiscipline} onChange={e => setSkipDiscipline(e.target.checked)} />
                  <span>Не указывать предмет</span>
                </label>
                {!skipDiscipline && <input className={styles.docTitleInput} placeholder="Предмет / дисциплина" value={titleForm.discipline} onChange={e => setTitleForm(prev => ({ ...prev, discipline: e.target.value }))} />}
                <input className={styles.docTitleInput} placeholder="Кафедра" value={titleForm.department} onChange={e => setTitleForm(prev => ({ ...prev, department: e.target.value }))} />
                <input className={styles.docTitleInput} placeholder="Группа" value={titleForm.groupNumber} onChange={e => setTitleForm(prev => ({ ...prev, groupNumber: e.target.value }))} />
                <input className={styles.docTitleInput} placeholder="Научный руководитель" value={titleForm.teacherName} onChange={e => setTitleForm(prev => ({ ...prev, teacherName: e.target.value }))} />
                <input className={styles.docTitleInput} placeholder="Город" value={titleForm.city} onChange={e => setTitleForm(prev => ({ ...prev, city: e.target.value }))} />
                <button className={styles.docUpdateBtn} onClick={async () => { await handleTitleUpdate(); setShowMobileTitleForm(false); }} disabled={titleUpdating}>
                  {titleUpdating ? "Обновляем..." : "↻ Обновить документ"}
                </button>
                <label className={styles.docSaveProfileRow}>
                  <input type="checkbox" className={styles.docSaveProfileCheck} checked={saveProfile} onChange={e => setSaveProfile(e.target.checked)} />
                  <span>Запомнить данные</span>
                </label>
              </div>
            </div>
          )}

          </div>
        </div>
      ), document.body)}

    </div>
  );
}
