"use client";

import { useState } from "react";
import Link from "next/link";
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
  const paymentUrl = `/payment?workType=${encodeURIComponent(data.workType)}&previewSlug=${slug}`;

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/preview/${slug}/download`, { method: "POST" });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.topic.replace(/[«»:]/g, "").trim()}.docx`;
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
            { icon: "📄", title: "Word по ГОСТ",      sub: "Times New Roman 14pt, поля 30/10/20/20" },
            { icon: "📏", title: `${data.pages} стр.`, sub: "Введение, главы, заключение" },
            { icon: "✅", title: "Антиплагиат 80%+",  sub: "Уникальный авторский текст" },
            { icon: "📚", title: "Реальные источники", sub: "Актуальные источники 2020–2025" },
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
                <span className={styles.lockIcon}>🔒</span>
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
              <div className={styles.ctaLockIcon}>🔒</div>
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
              <a href={paymentUrl} className={styles.ctaButton}>
                ⬇ Скачать DOCX — 199 ₽
              </a>
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
