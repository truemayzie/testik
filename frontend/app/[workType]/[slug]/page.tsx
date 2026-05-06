import { notFound } from 'next/navigation'
import { getSeoPageBySlug, getSeoPagesByType } from '@/lib/seo-pages'
import { GenerateButton } from '@/app/components/seo/GenerateButton'
import { safeJsonLd } from '@/lib/safeJsonLd'
import styles from './seo-page.module.css'

export const dynamic = "force-dynamic";

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

const WORK_PAGES: Record<string, string> = {
  referat:    '20–25 стр.',
  kursovaya:  '30–40 стр.',
  esse:       '4–8 стр.',
  doklad:     '15–20 стр.',
  vkr:        '60–70 стр.',
  sochinenie: '3–5 стр.',
}

type TocItem = { title: string; sub?: boolean; page: number }

function getStructure(workType: string): TocItem[] {
  const map: Record<string, TocItem[]> = {
    referat: [
      { title: 'Введение', page: 3 },
      { title: 'Теоретические основы темы', page: 5 },
      { title: 'Основная часть', page: 9 },
      { title: 'Современные подходы и тенденции', page: 15 },
      { title: 'Заключение', page: 21 },
      { title: 'Список литературы', page: 23 },
    ],
    kursovaya: [
      { title: 'Введение', page: 3 },
      { title: 'Глава 1. Теоретические основы', page: 6 },
      { title: '1.1. Понятие и сущность', page: 6, sub: true },
      { title: '1.2. Основные виды и классификации', page: 11, sub: true },
      { title: 'Глава 2. Практическое исследование', page: 17 },
      { title: '2.1. Анализ современного состояния', page: 17, sub: true },
      { title: '2.2. Выводы и рекомендации', page: 26, sub: true },
      { title: 'Заключение', page: 33 },
      { title: 'Список использованных источников', page: 36 },
    ],
    esse: [
      { title: 'Введение', page: 2 },
      { title: 'Основная часть', page: 3 },
      { title: 'Заключение', page: 7 },
    ],
    doklad: [
      { title: 'Введение', page: 3 },
      { title: 'Теоретическая часть', page: 5 },
      { title: 'Практические аспекты', page: 10 },
      { title: 'Выводы', page: 17 },
      { title: 'Список литературы', page: 19 },
    ],
    vkr: [
      { title: 'Введение', page: 3 },
      { title: 'Глава 1. Теоретический анализ', page: 8 },
      { title: '1.1. Историография проблемы', page: 8, sub: true },
      { title: '1.2. Современное состояние', page: 16, sub: true },
      { title: 'Глава 2. Методология исследования', page: 24 },
      { title: '2.1. Методы и подходы', page: 24, sub: true },
      { title: 'Глава 3. Результаты исследования', page: 36 },
      { title: '3.1. Основные результаты', page: 36, sub: true },
      { title: '3.2. Практические рекомендации', page: 48, sub: true },
      { title: 'Заключение', page: 57 },
      { title: 'Список литературы', page: 61 },
      { title: 'Приложения', page: 65 },
    ],
    sochinenie: [
      { title: 'Вступление', page: 2 },
      { title: 'Основная часть', page: 3 },
      { title: 'Заключение', page: 5 },
    ],
  }
  return map[workType] ?? [
    { title: 'Введение', page: 3 },
    { title: 'Основная часть', page: 5 },
    { title: 'Заключение', page: 14 },
    { title: 'Список литературы', page: 16 },
  ]
}

export default async function SeoPage({ params }: { params: { workType: string; slug: string } }) {
  const page = await getSeoPageBySlug(params.slug)
  if (!page) notFound()

  const typeName = WORK_TYPE_NAMES[page.workType] ?? page.workType
  const structure = getStructure(page.workType)
  const isCompactPreview = page.workType === "sochinenie" || page.workType === "esse"

  // Похожие работы — того же типа, кроме текущей, случайные 5
  const allSameType = await getSeoPagesByType(page.workType)
  const related = allSameType
    .filter(p => p.slug !== page.slug)
    .sort(() => Math.random() - 0.5)
    .slice(0, 5)
  const firstSection = structure[1] ?? structure[0]
  const secondSection = structure[2] ?? structure[1]

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

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(articleJsonLd) }} />

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

      {/* Мета-полоска */}
      <div className={styles.metaStrip}>
        <div className={styles.metaItem}>
          <span className={styles.metaKey}>Тип</span>
          <span className={styles.metaVal}>{typeName}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaKey}>Объём</span>
          <span className={styles.metaVal}>{WORK_PAGES[page.workType] ?? '15+ стр.'}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaKey}>Формат</span>
          <span className={styles.metaVal}>DOCX · ГОСТ</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaKey}>Уникальность</span>
          <span className={styles.metaVal}>70–90%</span>
        </div>
      </div>

      {/* Содержание */}
      {!isCompactPreview && (
        <section className={styles.tocSection}>
          <h2 className={styles.tocHeading}>Содержание</h2>
          <ol className={styles.tocList}>
            {structure.map((item, i) => (
              <li key={i} className={`${styles.tocItem}${item.sub ? ` ${styles.tocSub}` : ''}`}>
                <span className={styles.tocName}>{item.title}</span>
                <span className={styles.tocDots} />
                <span className={styles.tocPage}>{item.page}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Предпросмотр секций */}
      <div className={styles.docPreview}>
        <div className={styles.docPreviewHeading}>Предпросмотр</div>
        {isCompactPreview ? (
          <div className={styles.docSectionCompact}>
            <div className={styles.docSectionHead}>Фрагмент сочинения</div>
            <div className={styles.docBlurWrapCompact}>
              <p className={styles.docSectionText}>{page.previewText}</p>
              <div className={styles.docBlurred}>
                <p>Когда герой оказывается перед нравственным выбором, автор не дает простого ответа, а шаг за шагом показывает, как внутренний конфликт меняет взгляд человека на себя и на окружающий мир.</p>
                <p>Сравнивая поступки персонажей, можно заметить, что внешняя правота не всегда совпадает с внутренней честностью: иногда тихое раскаяние оказывается сильнее громких убеждений и красивых слов.</p>
                <p>Художественные детали работают как точные акценты: повторяющиеся образы, интонация авторского комментария, контраст между мечтой и реальностью помогают глубже понять главную мысль произведения.</p>
                <p>Именно поэтому итоговое впечатление от текста остается объемным: это не пересказ событий, а разговор о цене выбора, о взрослении души и о том, почему человеческое достоинство проверяется в трудную минуту.</p>
              </div>
              <div className={styles.compactLockCard}>
                <div className={styles.compactLockTitle}>Текст доступен в расширенной версии</div>
                <div className={styles.compactLockText}>
                  Полная версия содержит логичную структуру, ключевые тезисы и готовые формулировки, которые можно адаптировать под своё задание.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Введение — виден текст + блюр */}
            <div className={styles.docSection}>
              <div className={styles.docSectionHead}>Введение</div>
              <p className={styles.docSectionText}>{page.previewText}</p>
              <div className={styles.docBlurWrap}>
                <div className={styles.docBlurred}>
                  <p>Актуальность данной работы обусловлена необходимостью комплексного изучения рассматриваемой проблематики в контексте современных научных подходов и методологических требований к академическим исследованиям в данной области знания.</p>
                  <p>Цель работы — провести всестороннее исследование, систематизировать существующие теоретические подходы и на их основе сформулировать обоснованные выводы и практические рекомендации.</p>
                </div>
                <div className={styles.docBlurFade} />
              </div>
            </div>

            {/* Первая основная секция — полный блюр */}
            <div className={styles.docSection}>
              <div className={styles.docSectionHead}>{firstSection.title}</div>
              <div className={styles.docBlurWrap}>
                <div className={styles.docBlurred}>
                  <p>В рамках данного раздела проводится детальный анализ основных теоретических концепций и практических аспектов исследуемой темы с опорой на актуальные отечественные и зарубежные научные источники.</p>
                  <p>Рассматриваются ключевые подходы учёных к изучению проблемы, анализируются современные тенденции развития данной области знаний и выявляются основные закономерности исследуемого явления.</p>
                  <p>На основании проведённого анализа установлено, что исследуемое явление характеризуется рядом специфических особенностей, определяющих его место в системе научного знания.</p>
                </div>
                <div className={styles.docBlurFade} />
              </div>
            </div>

            {/* Вторая секция — полный блюр */}
            {secondSection && (
              <div className={styles.docSection}>
                <div className={styles.docSectionHead}>{secondSection.title}</div>
                <div className={styles.docBlurWrap}>
                  <div className={styles.docBlurred}>
                    <p>Проведённое исследование позволяет констатировать, что рассматриваемая проблема сохраняет свою значимость и требует дальнейшего изучения с применением современных методов научного анализа.</p>
                    <p>Полученные данные свидетельствуют о необходимости системного подхода к изучению данной темы, что открывает перспективы для дальнейших исследований в указанном направлении.</p>
                  </div>
                  <div className={styles.docBlurFade} />
                </div>
              </div>
            )}
          </>
        )}

        {!isCompactPreview && (
          <div className={styles.docSection}>
            <div className={styles.docLockNote}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="12" rx="3"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              <span>Полный текст открывается после генерации</span>
            </div>
          </div>
        )}
      </div>

      {/* Список литературы (превью) */}
      {!isCompactPreview && (
        <section className={styles.sourcesPreview}>
          <div className={styles.sourcesPreviewHead}>
            Список литературы <span>· фрагмент</span>
          </div>
          <ul className={styles.sourcesPreviewList}>
            <li className={styles.sourcesPreviewItem}>
              Авдеев В.М. {page.subject}: теория и практика современного исследования. — М.: Академия, 2023. — 312 с.
            </li>
            <li className={styles.sourcesPreviewItem}>
              Козлова Е.Н. Актуальные вопросы изучения {page.subject}. — СПб.: Питер, 2022. — 248 с.
            </li>
          </ul>
          <div className={styles.sourcesBlurred}>
            <div className={styles.sourcesBlurLine} style={{ width: '88%' }} />
            <div className={styles.sourcesBlurLine} style={{ width: '74%' }} />
            <div className={styles.sourcesBlurLine} style={{ width: '82%' }} />
          </div>
        </section>
      )}

      {/* CTA */}
      <div className={styles.cta}>
        <span className={styles.ctaIcon}>
          <svg width="32" height="32" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 1L11.8 8.2L19 10L11.8 11.8L10 19L8.2 11.8L1 10L8.2 8.2Z" fill="#D97706"/>
          </svg>
        </span>
        <h2 className={styles.ctaTitle}>Получить полную версию работы</h2>
        <p className={styles.ctaDesc}>
          Уникальный текст · Оформление по ГОСТ 7.32-2017 · Реальные источники 2020–2025
        </p>
        <GenerateButton workType={page.workType} title={page.title} />
        <p className={styles.ctaNote}>Готово в среднем за 7–10 минут</p>
      </div>

      {/* Основной SEO-текст — не трогаем, нужен для индексации */}
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

      {/* Похожие работы */}
      {related.length > 0 && (
        <section className={styles.relatedSection}>
          <h2 className={styles.relatedHeading}>{{
            referat:   'Похожие рефераты',
            kursovaya: 'Похожие курсовые',
            esse:      'Похожие эссе',
            doklad:    'Похожие доклады',
            vkr:       'Похожие ВКР',
            sochinenie:'Похожие сочинения',
          }[page.workType] ?? 'Похожие работы'}</h2>
          <ul className={styles.relatedList}>
            {related.map(r => (
              <li key={r.slug} className={styles.relatedItem}>
                <a href={`/${r.workType}/${r.slug}`} className={styles.relatedLink}>
                  {r.title}
                </a>
                {r.subject && (
                  <span className={styles.relatedSubject}>{r.subject}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

    </main>
  )
}
