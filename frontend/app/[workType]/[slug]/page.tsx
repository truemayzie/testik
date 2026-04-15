import { notFound } from 'next/navigation'
import { getSeoPageBySlug, getAllSeoPages } from '@/lib/seo-pages'
import { GenerateButton } from '@/app/components/seo/GenerateButton'
import styles from './seo-page.module.css'

export async function generateStaticParams() {
  const pages = await getAllSeoPages()
  return pages.map((page) => ({
    workType: page.workType,
    slug: page.slug,
  }))
}

export async function generateMetadata({ params }: { params: { workType: string; slug: string } }) {
  const page = await getSeoPageBySlug(params.slug)
  if (!page) return {}
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: { canonical: `https://ref-ai.ru/${page.workType}/${page.slug}` },
    openGraph: {
      title: page.metaTitle,
      description: page.metaDescription,
      url: `https://ref-ai.ru/${page.workType}/${page.slug}`,
      type: 'article',
      siteName: 'Refai',
    },
    twitter: {
      card: 'summary',
      title: page.metaTitle,
      description: page.metaDescription,
    },
  }
}

const WORK_TYPE_NAMES: Record<string, string> = {
  referat:   'Реферат',
  kursovaya: 'Курсовая работа',
  esse:      'Эссе',
  doklad:    'Доклад',
  vkr:       'ВКР',
  sochinenie:'Сочинение',
}

export default async function SeoPage({ params }: { params: { workType: string; slug: string } }) {
  const page = await getSeoPageBySlug(params.slug)
  if (!page) notFound()

  const typeName = WORK_TYPE_NAMES[page.workType] ?? page.workType

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Главная',
        item: 'https://ref-ai.ru',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: WORK_TYPE_NAMES[page.workType],
        item: `https://ref-ai.ru/${page.workType}`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: page.title,
        item: `https://ref-ai.ru/${page.workType}/${page.slug}`,
      },
    ],
  }

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.title,
    description: page.metaDescription,
    url: `https://ref-ai.ru/${page.workType}/${page.slug}`,
    datePublished: page.createdAt.toISOString(),
    dateModified: page.updatedAt?.toISOString() ?? page.createdAt.toISOString(),
    author: {
      '@type': 'Organization',
      name: 'Refai',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Refai',
      url: 'https://ref-ai.ru',
    },
  }

  return (
    <main className={styles.page}>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />

      {/* Хлебные крошки */}
      <nav className={styles.breadcrumbs}>
        <a href="/">Главная</a>
        <span>/</span>
        <span>{typeName}</span>
        <span>/</span>
        <span className={styles.breadcrumbCurrent}>{page.subject}</span>
      </nav>

      {/* Заголовок */}
      <div className={styles.label}>{typeName} · {page.subject}</div>
      <h1 className={styles.title}>{page.title}</h1>

      {/* Превью с блюром */}
      <div className={styles.previewWrap}>
        <p className={styles.previewText}>{page.previewText}</p>
        <div className={styles.previewFade} />
      </div>

      {/* Основной SEO-текст */}
      {page.bodyText && (
        <section className={styles.bodyTextSection}>
          <hr className={styles.divider} />
          <div className={styles.bodyTextCard}>
            <h2 className={styles.bodyTextHeading}>Что важно знать об этой работе</h2>
            {page.bodyText.split('\n\n').filter(Boolean).map((para, i) => (
              <p key={i} className={styles.bodyTextPara}>{para}</p>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <div className={styles.cta}>
        <span className={styles.ctaIcon}>📄</span>
        <h2 className={styles.ctaTitle}>Получить полную версию работы</h2>
        <p className={styles.ctaDesc}>
          Уникальный текст · Оформление по ГОСТ 7.32-2017 · Реальные источники 2020–2025
        </p>
        <GenerateButton workType={page.workType} title={page.title} />
        <p className={styles.ctaNote}>Готово за 2 минуты</p>
      </div>

    </main>
  )
}
