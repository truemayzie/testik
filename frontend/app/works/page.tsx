import type { Metadata } from "next";
import Link from "next/link";
import { getAllSeoPages } from "@/lib/seo-pages";
import { safeJsonLd } from "@/lib/safeJsonLd";
import styles from "./works.module.css";

export const metadata: Metadata = {
  title: "Каталог готовых работ — рефераты, курсовые, эссе и ВКР по предметам | Refai",
  description:
    "Каталог готовых учебных работ по предметам: рефераты, курсовые, эссе, доклады, ВКР и сочинения. Структура по ГОСТ, объём, предпросмотр введения. Основа для своей работы.",
  alternates: { canonical: "https://ref-ai.ru/works" },
};

export const dynamic = "force-dynamic";

const TYPES: { slug: string; ruName: string; hint: string }[] = [
  { slug: "referat", ruName: "Реферат", hint: "20–25 страниц, ГОСТ 7.32-2017" },
  { slug: "kursovaya", ruName: "Курсовая", hint: "30–40 страниц, полная структура" },
  { slug: "esse", ruName: "Эссе", hint: "4–8 страниц, авторская позиция" },
  { slug: "doklad", ruName: "Доклад", hint: "15–20 страниц, для семинара" },
  { slug: "vkr", ruName: "ВКР", hint: "60–70 страниц, дипломный каркас" },
  { slug: "sochinenie", ruName: "Сочинение", hint: "3–5 страниц, творческая работа" },
];

function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export default async function WorksPage() {
  const pages = await getAllSeoPages();

  // Счётчики по типам
  const byType: Record<string, number> = {};
  const byTypeSubject: Record<string, Record<string, number>> = {};
  for (const p of pages) {
    byType[p.workType] = (byType[p.workType] ?? 0) + 1;
    if (!byTypeSubject[p.workType]) byTypeSubject[p.workType] = {};
    byTypeSubject[p.workType][p.subject] = (byTypeSubject[p.workType][p.subject] ?? 0) + 1;
  }
  const total = pages.length;

  // Свежие страницы (последние добавленные)
  const recent = [...pages]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 12);

  // Популярные предметы (по количеству работ всех типов)
  const subjectCounts: Record<string, number> = {};
  for (const p of pages) {
    subjectCounts[p.subject] = (subjectCounts[p.subject] ?? 0) + 1;
  }
  const topSubjects = Object.entries(subjectCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Главная", item: "https://ref-ai.ru" },
      { "@type": "ListItem", position: 2, name: "Каталог работ", item: "https://ref-ai.ru/works" },
    ],
  };

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Каталог готовых учебных работ",
    description:
      "Готовые рефераты, курсовые, эссе, доклады, ВКР и сочинения по предметам. Основа для своей работы.",
    url: "https://ref-ai.ru/works",
    publisher: { "@type": "Organization", name: "Refai", url: "https://ref-ai.ru" },
  };

  return (
    <main className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(collectionJsonLd) }} />

      <div className={styles.container}>
        {/* ── Hero ── */}
        <div className={styles.hero}>
          <span className={styles.heroIcon} aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="11.25" fill="#1D5CFF"/>
              <rect x="6.38" y="7.13" width="11.25" height="1.88" rx="0.94" fill="#FFFFFF"/>
              <rect x="6.38" y="10.88" width="8.25" height="1.88" rx="0.94" fill="#FFFFFF" opacity="0.7"/>
              <rect x="6.38" y="14.63" width="6" height="1.88" rx="0.94" fill="#FFFFFF"/>
              <path d="M15.38 13.69Q16.03 14.91 17.25 15.56Q16.03 16.22 15.38 17.44Q14.72 16.22 13.5 15.56Q14.72 14.91 15.38 13.69Z" fill="#FFFFFF"/>
            </svg>
          </span>
          <h1 className={styles.title}>Каталог готовых работ</h1>
          <p className={styles.subline}>
            {total > 0
              ? `${total} ${plural(total, "готовая работа", "готовые работы", "готовых работ")} по предметам — рефераты, курсовые, эссе, доклады, ВКР и сочинения`
              : "Готовые работы по предметам — рефераты, курсовые, эссе, доклады, ВКР и сочинения"}
          </p>
        </div>

        {/* ── Типы работ ── */}
        <section>
          <h2 className={styles.sectionTitle}>Типы работ</h2>
          <div className={styles.typesGrid}>
            {TYPES.map((t) => {
              const count = byType[t.slug] ?? 0;
              return (
                <Link key={t.slug} href={`/${t.slug}`} className={styles.typeCard}>
                  <span className={styles.typeBadge}>{t.ruName}</span>
                  <span className={styles.typeCount}>
                    <strong>{count}</strong>{" "}
                    {plural(count, "работа", "работы", "работ")} в каталоге
                  </span>
                  <span className={styles.typeHint}>{t.hint}</span>
                  <span className={styles.typeLink}>Смотреть раздел →</span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── Популярные предметы ── */}
        {topSubjects.length > 0 && (
          <section className={styles.recentSection}>
            <h2 className={styles.sectionTitle}>Популярные предметы</h2>
            <div className={styles.subjectChips}>
              {topSubjects.map(([subject, count]) => (
                <Link
                  key={subject}
                  href={`#${encodeURIComponent(subject)}`}
                  className={styles.subjectChip}
                >
                  {subject}
                  <span className={styles.subjectChipCount}>{count}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Каталог по типам и предметам ── */}
        {TYPES.filter((t) => (byType[t.slug] ?? 0) > 0).map((t) => {
          const subjects = Object.entries(byTypeSubject[t.slug] ?? {}).sort((a, b) =>
            a[0].localeCompare(b[0], "ru"),
          );
          return (
            <section key={t.slug} className={styles.recentSection}>
              <h2 className={styles.sectionTitle} id={t.slug}>
                {t.ruName}
                <span className={styles.sectionCount}>
                  {byType[t.slug]} {plural(byType[t.slug], "работа", "работы", "работ")}
                </span>
              </h2>
              {subjects.map(([subject, count]) => (
                <div key={subject} className={styles.subjectBlock}>
                  <h3 className={styles.subjectTitle} id={subject}>
                    {subject}
                    <span className={styles.subjectCount}>{count}</span>
                  </h3>
                  <div className={styles.resultsGrid}>
                    {pages
                      .filter((p) => p.workType === t.slug && p.subject === subject)
                      .map((p) => (
                        <Link
                          key={p.slug}
                          href={`/${p.workType}/${p.slug}`}
                          className={styles.resultCard}
                        >
                          <span className={styles.typeBadge}>{t.ruName}</span>
                          <h4 className={styles.resultTitle}>{p.title}</h4>
                          <span className={styles.resultMeta}>{p.subject}</span>
                        </Link>
                      ))}
                  </div>
                </div>
              ))}
            </section>
          );
        })}

        {/* ── Свежие в каталоге ── */}
        {recent.length > 0 && (
          <section className={styles.recentSection}>
            <h2 className={styles.sectionTitle}>Свежие в каталоге</h2>
            <div className={styles.resultsGrid}>
              {recent.map((p) => {
                const typeMeta = TYPES.find((t) => t.slug === p.workType);
                return (
                  <Link key={p.slug} href={`/${p.workType}/${p.slug}`} className={styles.resultCard}>
                    <span className={styles.typeBadge}>{typeMeta?.ruName ?? p.workType}</span>
                    <h4 className={styles.resultTitle}>{p.title}</h4>
                    <span className={styles.resultMeta}>{p.subject}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ── CTA ── */}
        <div className={styles.cta}>
          <h2 className={styles.ctaTitle}>Не нашли нужную тему?</h2>
          <p className={styles.ctaDesc}>
            Введите свою тему — ИИ напишет работу в среднем за 7–10 минут.
            Оформление по ГОСТ, реальные источники, скачивание в DOCX.
          </p>
          <Link href="/" className={styles.ctaBtn}>
            Написать работу →
          </Link>
        </div>
      </div>
    </main>
  );
}
