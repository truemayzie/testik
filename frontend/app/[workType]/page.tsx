import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSeoPagesByType } from '@/lib/seo-pages'
import { safeJsonLd } from '@/lib/safeJsonLd'
import styles from './hub.module.css'

const WORK_TYPES = ['referat', 'kursovaya', 'esse', 'doklad', 'vkr', 'sochinenie']

const META: Record<string, {
  ruName: string
  title: string
  description: string
  h1Prefix: string
  about: string
}> = {
  referat: {
    ruName: 'Реферат',
    title: 'Рефераты онлайн — готовые работы по всем предметам | Refai',
    description: 'Готовые рефераты по истории, экономике, философии, физике и другим предметам. Оформление по ГОСТ 7.32-2017, реальные источники, уникальность 80%+. Скачать в DOCX в среднем за 7–10 минут.',
    h1Prefix: 'Рефераты по',
    about: 'Реферат — краткое изложение научной темы объёмом 20–25 страниц. Наш сервис генерирует реферат с введением, основной частью, заключением и списком литературы строго по ГОСТ 7.32-2017. Реальные источники из базы CrossRef, уникальность 80%+. Готово в среднем за 7–10 минут.',
  },
  kursovaya: {
    ruName: 'Курсовая',
    title: 'Курсовые работы онлайн — по экономике, психологии, праву | Refai',
    description: 'Курсовые работы по экономике, истории, психологии, социологии и другим дисциплинам. 30–40 страниц, оформление по ГОСТ, список литературы. Готово в среднем за 7–10 минут.',
    h1Prefix: 'Курсовые работы по',
    about: 'Курсовая работа — самостоятельное исследование объёмом 30–40 страниц с теоретической и практической частями. Сервис формирует полную структуру: введение, главы, параграфы, заключение, список использованной литературы — всё оформлено по ГОСТ 7.32-2017.',
  },
  esse: {
    ruName: 'Эссе',
    title: 'Эссе онлайн — по философии, экономике, социологии | Refai',
    description: 'Готовые эссе по философии, социологии, экономике, экологии и другим предметам. 4–8 страниц, авторский текст, аргументированная позиция. Скачать в DOCX.',
    h1Prefix: 'Эссе по',
    about: 'Эссе — жанр свободного рассуждения объёмом 4–8 страниц с выраженной авторской позицией. Сервис создаёт структурированный текст с тезисом, аргументами и выводом. Подходит для семинаров, зачётов и вступительных испытаний.',
  },
  doklad: {
    ruName: 'Доклад',
    title: 'Доклады онлайн — по праву, экологии, культурологии | Refai',
    description: 'Готовые доклады по праву, культурологии, экологии, химии, технологиям. 15–20 страниц, оформление по ГОСТ. Скачать в DOCX в среднем за 7–10 минут.',
    h1Prefix: 'Доклады по',
    about: 'Доклад — развёрнутое сообщение по теме объёмом 15–20 страниц для семинара или конференции. Сервис генерирует структурированный текст с актуальными данными, без лишней воды — удобно для устного выступления.',
  },
  vkr: {
    ruName: 'ВКР',
    title: 'ВКР онлайн — дипломные работы по педагогике, экономике, психологии | Refai',
    description: 'Выпускные квалификационные работы по педагогике, экономике, психологии, менеджменту. 60–70 страниц, полная структура, ГОСТ 7.32-2017. Основа для доработки.',
    h1Prefix: 'ВКР по',
    about: 'Выпускная квалификационная работа (дипломная) — итоговое исследование объёмом 60–70 страниц. Сервис формирует полный каркас: введение с актуальностью и целями, теоретическую и практическую главы, заключение, библиографию. Служит качественной основой для доработки.',
  },
  sochinenie: {
    ruName: 'Сочинение',
    title: 'Сочинения онлайн — по литературе, философии, химии | Refai',
    description: 'Готовые сочинения по литературе, философии, химии и другим предметам. 3–5 страниц, авторский текст с аргументацией и цитатами. Скачать в DOCX.',
    h1Prefix: 'Сочинения по',
    about: 'Сочинение — творческая работа объёмом 3–5 страниц с личной позицией и аргументацией. Сервис создаёт связный текст с тезисом, примерами из литературы или науки и выводом. Подходит для школьных и студенческих работ.',
  },
}

export function generateStaticParams() {
  return WORK_TYPES.map((workType) => ({ workType }))
}

export async function generateMetadata({ params }: { params: { workType: string } }) {
  const meta = META[params.workType]
  if (!meta) return {}
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: `https://ref-ai.ru/${params.workType}` },
  }
}

export default async function HubPage({ params }: { params: { workType: string } }) {
  const meta = META[params.workType]
  if (!meta) notFound()

  // Пустая база — не повод для 404: рендерим хаб с описанием и CTA
  const pages = await getSeoPagesByType(params.workType)

  // Топ-5 предметов для H1
  const subjectCounts: Record<string, number> = {}
  for (const p of pages) {
    subjectCounts[p.subject] = (subjectCounts[p.subject] ?? 0) + 1
  }
  const topSubjects = Object.entries(subjectCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([s]) => s)

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://ref-ai.ru' },
      { '@type': 'ListItem', position: 2, name: meta.ruName, item: `https://ref-ai.ru/${params.workType}` },
    ],
  }

  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: meta.title,
    description: meta.description,
    url: `https://ref-ai.ru/${params.workType}`,
    publisher: { '@type': 'Organization', name: 'Refai', url: 'https://ref-ai.ru' },
  }

  // Группируем карточки по предмету
  const bySubject: Record<string, typeof pages> = {}
  for (const p of pages) {
    if (!bySubject[p.subject]) bySubject[p.subject] = []
    bySubject[p.subject].push(p)
  }
  const subjects = Object.keys(bySubject).sort()

  return (
    <main className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(collectionJsonLd) }} />

      {/* Хлебные крошки */}
      <nav className={styles.breadcrumbs}>
        <a href="/">Главная</a>
        <span>/</span>
        <span className={styles.breadcrumbCurrent}>{meta.ruName}</span>
      </nav>

      {/* Заголовок */}
      <h1 className={styles.h1}>
        {pages.length > 0
          ? <>{meta.h1Prefix} {topSubjects.join(', ')}</>
          : <>{meta.ruName}: генерация за 7–10 минут по любой теме</>}
      </h1>
      <p className={styles.about}>{meta.about}</p>
      {pages.length === 0 && (
        <p className={styles.about}>
          Каталог готовых {meta.ruName.toLowerCase()} по предметам наполняется — а ваша тема уже доступна:
          введите её в генераторе, и работа будет написана с нуля под ваши требования.
        </p>
      )}
      {params.workType === 'kursovaya' && (
        <p className={styles.commercialCue}>
          <Link href="/kursovaya-zakaz">Курсовая под заказ — цена и оформление по ГОСТ →</Link>
        </p>
      )}
      {params.workType === 'vkr' && (
        <p className={styles.commercialCue}>
          <Link href="/vkr-zakaz">ВКР и дипломная на заказ — цена, ИИ и ГОСТ →</Link>
        </p>
      )}

      {/* Счётчик */}
      {pages.length > 0 && (
        <div className={styles.stats}>
          <span className={styles.statNum}>{pages.length}</span>
          <span className={styles.statLabel}>готовых работ</span>
        </div>
      )}

      {/* Сетка по предметам */}
      {pages.length > 0 && (
        <div className={styles.subjects}>
          {subjects.map((subject) => (
            <section key={subject} className={styles.subjectBlock}>
              <h2 className={styles.subjectTitle}>{subject}</h2>
              <div className={styles.grid}>
                {bySubject[subject].map((p) => (
                  <a key={p.slug} href={`/${params.workType}/${p.slug}`} className={styles.card}>
                    <span className={styles.cardTitle}>{p.title}</span>
                    <span className={styles.cardArrow}>→</span>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* CTA */}
      <div className={styles.cta}>
        <span className={styles.ctaIcon}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="11.25" fill="#1D5CFF"/>
            <rect x="6.38" y="7.13" width="11.25" height="1.88" rx="0.94" fill="#FFFFFF"/>
            <rect x="6.38" y="10.88" width="8.25" height="1.88" rx="0.94" fill="#FFFFFF" opacity="0.7"/>
            <rect x="6.38" y="14.63" width="6" height="1.88" rx="0.94" fill="#FFFFFF"/>
            <path d="M15.38 13.69Q16.03 14.91 17.25 15.56Q16.03 16.22 15.38 17.44Q14.72 16.22 13.5 15.56Q14.72 14.91 15.38 13.69Z" fill="#FFFFFF"/>
          </svg>
        </span>
        <h2 className={styles.ctaTitle}>Не нашли нужную тему?</h2>
        <p className={styles.ctaDesc}>
          Введите свою тему — ИИ напишет работу в среднем за 7–10 минут.
          Оформление по ГОСТ, реальные источники, скачивание в DOCX.
        </p>
        <a
          href={`/?workType=${encodeURIComponent(meta.ruName)}`}
          className={styles.ctaBtn}
        >
          Написать {meta.ruName.toLowerCase()} →
        </a>
      </div>
    </main>
  )
}
