"use client";

import { useState } from "react";
import Link from "next/link";
import { WORK_PRICES } from "@/lib/prices";
import styles from "./preview.module.css";

type PreviewData = {
  topic: string;
  workType: string;
  pages: number;
  createdAt: string;
  structure: string[];
  previewContent: Record<string, string>;
  sources: string[];
  meta: Record<string, string | number>;
};

type Props = {
  data: PreviewData | null;
  slug: string;
  fullContent: Record<string, string> | null;
  fullSources: string[] | null;
};

export default function PreviewClient({ data, slug, fullContent, fullSources }: Props) {
  const [activeSection, setActiveSection] = useState("");
  const [downloading, setDownloading] = useState(false);

  if (!data) {
    return (
      <div className={styles.notFound}>
        <div className={styles.notFoundInner}>
          <span className={styles.notFoundIcon}>📄</span>
          <h1>Работа не найдена</h1>
          <p>Возможно, ссылка устарела или работа была удалена.</p>
          <Link href="/" className={styles.notFoundBtn}>На главную →</Link>
        </div>
      </div>
    );
  }

  const isOwner = fullContent !== null;
  const orderUrl = `/?workType=${encodeURIComponent(data.workType)}#generator`;

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/preview/${slug}/download`, { method: "POST" });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data?.topic.replace(/[«»:]/g, "").trim()}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Не удалось скачать файл.");
    } finally {
      setDownloading(false);
    }
  }

  function toggleSection(section: string) {
    setActiveSection(prev => prev === section ? "" : section);
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

  return (
    <div className={styles.page}>

      {/* ── HERO ── */}
      <section className={styles.heroSection}>
        <div className={styles.heroInner}>
          <div className={styles.heroBadge}>{data.workType}</div>
          <h1 className={styles.heroTitle}>{data.topic}</h1>
          <p className={styles.heroSub}>
            {isOwner ? "Ваша работа" : "Реферат готов к сдаче"} · {data.pages} страниц · ГОСТ 7.32-2017
          </p>
          {isOwner && (
            <button
              className={styles.heroDownloadBtn}
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? "Создаём файл..." : "⬇ Скачать DOCX"}
            </button>
          )}
        </div>
      </section>

      <div className={styles.container}>

        {/* ── ПРЕИМУЩЕСТВА ── */}
        <section className={styles.benefitsGrid}>
          {[
            {
              icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary, #1D5CFF)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
              title: "Word по ГОСТ",
              sub: "Times New Roman 14pt, поля 30/10/20/20",
            },
            {
              icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary, #1D5CFF)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>,
              title: `${data.pages} стр.`,
              sub: "Введение, главы, заключение",
            },
            {
              icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary, #1D5CFF)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><polyline points="9 12 11 14 15 10"/></svg>,
              title: "Антиплагиат 80%+",
              sub: "Уникальный авторский текст",
            },
            {
              icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary, #1D5CFF)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>,
              title: "Реальные источники",
              sub: "Актуальные источники 2020–2025",
            },
          ].map((b, i) => (
            <div key={i} className={styles.benefitCard}>
              <span className={styles.benefitIcon}>{b.icon}</span>
              <p className={styles.benefitTitle}>{b.title}</p>
              <p className={styles.benefitSub}>{b.sub}</p>
            </div>
          ))}
        </section>

        {/* ── МЕТА ── */}
        <section className={styles.metaSection}>
          <div className={styles.metaGrid}>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>Тема работы</span>
              <span className={styles.metaValue}>{data.topic}</span>
            </div>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>Тип работы</span>
              <span className={styles.metaValue}>{data.workType}</span>
            </div>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>Объём</span>
              <span className={styles.metaValue}>{data.pages} страниц</span>
            </div>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>Источников</span>
              <span className={styles.metaValue}>{data.sources.length}+ источников</span>
            </div>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>Уникальность</span>
              <span className={styles.metaValue}>80–90%</span>
            </div>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>Оформление</span>
              <span className={styles.metaValue}>ГОСТ 7.32-2017</span>
            </div>
          </div>
        </section>

        {/* ── СОДЕРЖАНИЕ ── */}
        <section className={styles.previewSections}>
          <h2 className={styles.sectionHeading}>
            {isOwner ? "Содержание работы" : "Предпросмотр содержания"}
          </h2>

          {isOwner ? (
            /* Владелец — полный аккордеон */
            <div className={styles.accordion}>
              {data.structure.map((section) => {
                const text = fullContent![section];
                const isOpen = activeSection === section;
                if (!text) return null;
                return (
                  <div key={section} className={`${styles.accordionBlock} ${isOpen ? styles.accordionOpen : ""}`}>
                    <button className={styles.accordionToggle} onClick={() => toggleSection(section)}>
                      <span>{section}</span>
                      <span className={styles.chevron}>{isOpen ? "▲" : "▼"}</span>
                    </button>
                    {isOpen && (
                      <div className={styles.accordionContent}>
                        {renderContent(text)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Не владелец — блюр */
            <>
              {data.structure.map((section, i) => (
                <div key={i} className={styles.previewSection}>
                  <h3 className={styles.previewSectionTitle}>{section}</h3>
                  {data.previewContent[section] && (
                    <p className={styles.visibleText}>{data.previewContent[section]}</p>
                  )}
                  <div className={styles.blurWrapper}>
                    <div className={styles.blurredText}>
                      <p>Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
                      <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
                    </div>
                    <div className={styles.blurGradient} />
                  </div>
                </div>
              ))}
              <div className={styles.lockBanner}>
                <span className={styles.lockIcon}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="12" rx="3"/>
                    <path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                </span>
                <p>Полный текст доступен после оплаты</p>
              </div>
            </>
          )}
        </section>

        {/* ── СПИСОК ЛИТЕРАТУРЫ ── */}
        <section className={styles.sourcesSection}>
          <h2 className={styles.sectionHeading}>
            {isOwner ? "Список литературы" : "Список литературы (фрагмент)"}
          </h2>
          <ul className={styles.sourcesList}>
            {(isOwner ? fullSources! : data.sources).map((src, i) => (
              <li key={i} className={styles.sourceItem}>{src}</li>
            ))}
            {!isOwner && (
              <li className={styles.sourceItemBlurred}>
                <div className={styles.blurredSource} />
              </li>
            )}
          </ul>
        </section>

        {/* ── CTA — только для не-владельцев ── */}
        {!isOwner && (
          <section className={styles.ctaBlock}>
            <div className={styles.ctaInner}>
              <div className={styles.ctaLockIcon}>
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3" y="11" width="18" height="12" rx="3" fill="rgba(29, 92, 255, 0.08)" stroke="rgba(29, 92, 255, 0.45)" strokeWidth="1.5"/>
                  <path d="M7 11V7a5 5 0 0110 0v4" stroke="rgba(29, 92, 255, 0.45)" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="12" cy="17" r="1.5" fill="#D97706"/>
                </svg>
              </div>
              <h2 className={styles.ctaTitle}>Получите полную версию</h2>
              <p className={styles.ctaText}>
                Полный текст всех глав, правильное оформление DOCX, полный список литературы
              </p>
              <div className={styles.ctaFeatures}>
                <span>✓ Мгновенная загрузка</span>
                <span>✓ Word по ГОСТ</span>
                <span>✓ {data.pages} страниц</span>
                <span>✓ Антиплагиат 80%+</span>
              </div>
              <Link href={orderUrl} className={styles.ctaButton}>
                Создать такую же — {WORK_PRICES[data.workType]?.price ?? 299} ₽
              </Link>
              <p className={styles.ctaNote}>
                или <Link href="/auth/signin">войдите</Link>, если уже оплачивали
              </p>
            </div>
          </section>
        )}

        {/* ── Кнопка скачать для владельца внизу ── */}
        {isOwner && (
          <div className={styles.ownerDownloadRow}>
            <button
              className={styles.ownerDownloadBtn}
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? "Создаём файл..." : "⬇ Скачать DOCX"}
            </button>
            <Link href="/dashboard" className={styles.ownerDashLink}>
              ← Мои работы
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}
