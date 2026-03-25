"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
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
};

type ReferatResult = {
  title: string;
  structure: string[];
  content: Record<string, string>;
  sources: string[];
  meta: Record<string, string | number>;
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting]       = useState<string | null>(null);
  const [copiedId, setCopiedId]       = useState<string | null>(null);

  // Просмотр работы
  const [viewing, setViewing]         = useState<ReferatResult | null>(null);
  const [loadingView, setLoadingView] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("");

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
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeViewer();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Заблокировать скролл страницы при открытом модале
  useEffect(() => {
    document.body.style.overflow = viewing ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [viewing]);

  async function handleOpen(id: string) {
    setLoadingView(id);
    try {
      const res  = await fetch(`/api/generations/${id}`);
      const data = await res.json();
      const result: ReferatResult = data.result;
      setViewing(result);
      setActiveSection(result.structure?.[0] ?? "");
    } catch {
      alert("Не удалось загрузить работу");
    } finally {
      setLoadingView(null);
    }
  }

  function closeViewer() {
    setViewing(null);
    setActiveSection("");
  }

  function toggleSection(section: string) {
    setActiveSection(prev => prev === section ? "" : section);
  }

  async function handleDownload(id: string) {
    setDownloading(id);
    try {
      const res    = await fetch(`/api/generations/${id}`);
      const data   = await res.json();
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
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Не удалось скачать файл");
    } finally {
      setDownloading(null);
    }
  }

  async function handleDownloadFromViewer() {
    if (!viewing) return;
    setDownloading("viewer");
    try {
      const docxRes = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(viewing),
      });
      if (!docxRes.ok) throw new Error();
      const blob = await docxRes.blob();
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${viewing.title.replace(/[«»:]/g, "").trim()}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Не удалось скачать файл");
    } finally {
      setDownloading(null);
    }
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

  function renderContent(text: string) {
    const parts = text.split(/(\[TABLE\][\s\S]*?\[\/TABLE\])/g);
    return parts.map((part, i) => {
      if (part.startsWith("[TABLE]")) {
        try {
          const json = part.replace("[TABLE]", "").replace("[/TABLE]", "").trim();
          const data = JSON.parse(json);
          return (
            <div key={i} className={styles.tableWrapper}>
              {data.caption && <p className={styles.tableCaption}>{data.caption}</p>}
              <table className={styles.table}>
                <thead>
                  <tr>{data.headers.map((h: string, j: number) => <th key={j} className={styles.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {data.rows.map((row: string[], j: number) => (
                    <tr key={j}>{row.map((cell: string, k: number) => <td key={k} className={styles.td}>{cell}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        } catch { return null; }
      }
      return part.split("\n").filter(p => p.trim()).map((para, j) => (
        <p key={`${i}-${j}`} className={styles.para}>{para}</p>
      ));
    });
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
        {/* Декоративные фигуры */}
        <div className={styles.heroShape1} />
        <div className={styles.heroShape2} />
        <div className={styles.heroShape3} />
        {/* Декоративные карточки-документы */}
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
        {/* Список работ */}
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
              {generations.map(gen => (
                <div key={gen.id} className={styles.card}>
                  <div
                    className={styles.cardLeft}
                    onClick={() => handleOpen(gen.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === "Enter" && handleOpen(gen.id)}
                  >
                    <span className={styles.workType}>{gen.workType}</span>
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
                      onClick={() => handleDownload(gen.id)}
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
              ))}
            </div>
          )}
        </section>
      </main>

      {/* ── МОДАЛЬНЫЙ ПРОСМОТР ── */}
      {viewing && (
        <div className={styles.modalOverlay} onClick={e => { if (e.target === e.currentTarget) closeViewer(); }}>
          <div className={styles.modal}>

            {/* Modal header */}
            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderLeft}>
                <h2 className={styles.modalTitle}>{viewing.title}</h2>
              </div>
              <div className={styles.modalHeaderActions}>
                <button
                  className={styles.modalDownloadBtn}
                  onClick={handleDownloadFromViewer}
                  disabled={downloading === "viewer"}
                >
                  {downloading === "viewer"
                    ? <><span className={styles.btnSpinner} />Создаём...</>
                    : "⬇ Скачать DOCX"}
                </button>
                <button className={styles.modalCloseBtn} onClick={closeViewer} aria-label="Закрыть">
                  ✕
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div className={styles.modalBody}>

              {/* Meta */}
              {Object.keys(viewing.meta).length > 0 && (
                <div className={styles.metaGrid}>
                  {Object.entries(viewing.meta).map(([key, val]) => (
                    <div key={key} className={styles.metaItem}>
                      <span className={styles.metaKey}>{key}</span>
                      <span className={styles.metaVal}>{String(val)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* TOC */}
              <div className={styles.toc}>
                <h3 className={styles.tocTitle}>Содержание</h3>
                <ol className={styles.tocList}>
                  {viewing.structure.map((section, i) => (
                    <li
                      key={i}
                      className={`${styles.tocItem} ${activeSection === section ? styles.tocItemActive : ""}`}
                      onClick={() => toggleSection(section)}
                    >
                      <span>{section}</span>
                      <span className={styles.tocDots} />
                      <span className={styles.tocPage}>{i + 1}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Sections accordion */}
              <div className={styles.sections}>
                {viewing.structure.map(section => {
                  const text   = viewing.content[section];
                  if (!text) return null;
                  const isOpen = activeSection === section;
                  return (
                    <div key={section} className={`${styles.sectionBlock} ${isOpen ? styles.sectionOpen : ""}`}>
                      <button className={styles.sectionToggle} onClick={() => toggleSection(section)}>
                        <span>{section}</span>
                        <span className={styles.chevron}>{isOpen ? "▲" : "▼"}</span>
                      </button>
                      {isOpen && (
                        <div className={styles.sectionContent}>{renderContent(text)}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Sources */}
              <div className={styles.sources}>
                <h3 className={styles.sourcesTitle}>Список литературы</h3>
                <ul className={styles.sourcesList}>
                  {viewing.sources.map((src, i) => (
                    <li key={i} className={styles.sourceItem}>{src}</li>
                  ))}
                </ul>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
