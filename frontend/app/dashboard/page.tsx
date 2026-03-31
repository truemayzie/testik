"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import styles from "./dashboard.module.css";

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
};

type ViewingGen = {
  id: string;
  topic: string;
  workType: string;
  pages: number;
  slug: string | null;
  extras: Record<string, string> | null;
  result: ReferatResult;
};

const DOC_WIDTH = 816;

const TITLE_PAGE_TYPES = ["Реферат", "Курсовая", "ВКР", "Доклад"];

type TitleForm = {
  fullName: string; university: string; faculty: string;
  department: string; groupNumber: string; teacherName: string;
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

  // Титульный лист
  const [titleForm, setTitleForm]     = useState<TitleForm>({ fullName: "", university: "", faculty: "", department: "", groupNumber: "", teacherName: "" });
  const [titleUpdating, setTitleUpdating] = useState(false);
  const [saveProfile, setSaveProfile] = useState(false);

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

    const targetWidth = container.parentElement?.clientWidth || window.innerWidth;
    const isDesktop = targetWidth >= DOC_WIDTH;

    if (isDesktop) {
      container.style.width = "100%";
    } else {
      container.style.width = `${DOC_WIDTH}px`;
    }

    setPreviewLoading(true);
    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const { renderAsync } = await import("docx-preview");

      if (isDesktop) {
        await renderAsync(blob, container, undefined, {
          className: "docx-viewer",
          inWrapper: true,
          ignoreWidth: true,
          ignoreHeight: false,
        });
        container.style.width = "100%";
        baseScaleRef.current = 1;
        setPreviewZoom(1);
      } else {
        await renderAsync(blob, container, undefined, {
          className: "docx-preview",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
        });
        const base = Math.min(1, targetWidth / DOC_WIDTH);
        baseScaleRef.current = base;
        setPreviewZoom(1);
        applyScale(container, base);
      }
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
      let extrasObj: Record<string, string> | null = null;
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

  async function handleDownloadDocx(gen?: ViewingGen) {
    const src = gen ?? viewingGen;
    if (!src) return;
    const key = gen ? gen.id : "viewer";
    // Если скачиваем из просмотрщика — мержим данные титульника
    const body = (!gen && TITLE_PAGE_TYPES.includes(src.workType))
      ? { ...src.result, profile: titleForm }
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
    const updated = { ...viewingGen.result, profile: titleForm };
    await renderPreview(updated as typeof viewingGen.result);
    setTitleUpdating(false);
  }

  async function handleDownloadExtra(type: "presentation" | "speech") {
    if (!viewingGen?.extras) return;
    const jobId = viewingGen.extras[type];
    if (!jobId) return;
    const ext  = type === "presentation" ? "pptx" : "docx";
    const name = type === "presentation" ? "presentation" : "speech";
    try {
      const res = await fetch(`/api/download/${name}/${jobId}`);
      if (!res.ok) { alert("Файл недоступен. Перегенерируйте дополнительные материалы."); return; }
      const blob = await res.blob();
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `${name}.${ext}`;
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

  function parseExtras(raw: string | null): Record<string, string> | null {
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
                  {viewingGen.extras?.presentation && (
                    <span className={styles.docExtrasBadgePres}>Презентация</span>
                  )}
                  {viewingGen.extras?.speech && (
                    <span className={styles.docExtrasBadgeSpeech}>Выступление</span>
                  )}
                </div>
              </div>
              <button className={styles.docMobileCloseBtn} onClick={closeViewer}>✕</button>
            </div>

            {/* Левый столбец — предпросмотр */}
            <div className={styles.docModalLeft}>
              {previewLoading && (
                <div className={styles.docPreviewSpinner}>
                  <span className={styles.docSpinner} /> Загружаем предпросмотр...
                </div>
              )}
              <div ref={previewContainerRef} className={styles.docPreviewContainer} />
            </div>

            {/* Зум — убран, используется только в мобильной нижней панели */}

            {/* Правый столбец — десктоп */}
            <div className={styles.docModalRight}>
              <h2 className={styles.docModalTitle}>{viewingGen.result.title}</h2>
              <div className={styles.docModalBadges}>
                <span className={styles.docBadge}>{viewingGen.workType}</span>
                <span className={styles.docBadge}>{viewingGen.pages} стр.</span>
              </div>
              <hr className={styles.docDivider} />

              {/* Скачать DOCX */}
              <button
                className={styles.docDownloadBtn}
                onClick={() => handleDownloadDocx(viewingGen)}
                disabled={downloading === "viewer"}
              >
                {downloading === "viewer"
                  ? <><span className={styles.docBtnSpinner} />Создаём...</>
                  : <><img src="/docx-icon.png" alt="" className={styles.docDownloadIcon} />Скачать DOCX</>}
              </button>

              {/* Дополнительные материалы */}
              {(viewingGen.extras?.presentation || viewingGen.extras?.speech) && (
                <>
                  <hr className={styles.docDivider} />
                  <p className={styles.docExtrasHeading}>Дополнительные материалы</p>
                  <div className={styles.docExtrasDownloads}>
                    {viewingGen.extras?.presentation && (
                      <button
                        className={styles.docExtrasDownloadBtn}
                        onClick={() => handleDownloadExtra("presentation")}
                      >
                        <img src="/pptx-icon.svg" alt="" className={styles.docDownloadIcon} />
                        Презентация .pptx
                      </button>
                    )}
                    {viewingGen.extras?.speech && (
                      <button
                        className={styles.docExtrasDownloadBtn}
                        onClick={() => handleDownloadExtra("speech")}
                      >
                        <img src="/txt-icon.svg" alt="" className={styles.docDownloadIcon} />
                        Выступление .txt
                      </button>
                    )}
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
                    <p className={styles.docTitleHeading}>Титульный лист</p>
                    {(["fullName", "university", "faculty", "department", "groupNumber", "teacherName"] as (keyof TitleForm)[]).map(field => (
                      <input key={field} className={styles.docTitleInput}
                        placeholder={{ fullName: "ФИО студента", university: "Университет", faculty: "Факультет", department: "Кафедра", groupNumber: "Группа", teacherName: "Научный руководитель" }[field]}
                        value={titleForm[field]}
                        onChange={e => setTitleForm(prev => ({ ...prev, [field]: e.target.value }))}
                      />
                    ))}
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

            {/* Мобильная нижняя панель */}
            <div className={styles.docMobileBottom}>
              {!previewLoading && (
                <div className={styles.docMobileZoomRow}>
                  <button className={styles.docMobileZoomBtn} onClick={() => applyZoom(0.1)}>＋</button>
                  <span className={styles.docMobileZoomLabel}>{Math.round(baseScaleRef.current * previewZoom * 100)}%</span>
                  <button className={styles.docMobileZoomBtn} onClick={() => applyZoom(-0.1)}>－</button>
                </div>
              )}
              <button
                className={styles.docDownloadBtn}
                onClick={() => handleDownloadDocx(viewingGen)}
                disabled={downloading === "viewer"}
              >
                {downloading === "viewer"
                  ? <><span className={styles.docBtnSpinner} />Создаём...</>
                  : <><img src="/docx-icon.png" alt="" className={styles.docDownloadIcon} />Скачать DOCX</>}
              </button>
              {(viewingGen.extras?.presentation || viewingGen.extras?.speech) && (
                <div className={styles.docExtrasDownloadsMobile}>
                  {viewingGen.extras?.presentation && (
                    <button className={styles.docExtrasDownloadBtnSmall} onClick={() => handleDownloadExtra("presentation")}>
                      <img src="/pptx-icon.svg" alt="" className={styles.docDownloadIcon} />
                      Презентация .pptx
                    </button>
                  )}
                  {viewingGen.extras?.speech && (
                    <button className={styles.docExtrasDownloadBtnSmall} onClick={() => handleDownloadExtra("speech")}>
                      <img src="/txt-icon.svg" alt="" className={styles.docDownloadIcon} />
                      Выступление .txt
                    </button>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      ), document.body)}

    </div>
  );
}
