import type { Metadata } from "next";
import Link from "next/link";
import { EXTRAS_PRICES, WORK_PRICES } from "@/lib/prices";
import { safeJsonLd } from "@/lib/safeJsonLd";
import seo from "@/app/[workType]/[slug]/seo-page.module.css";
import hub from "@/app/[workType]/hub.module.css";
import homeHero from "@/app/page.module.css";
import styles from "./kursovaya-zakaz.module.css";

const KT = WORK_PRICES["Курсовая"];
const PRICE = KT.price;
const PAGES = KT.pages;

const MAIN_HREF =
  "/?workType=" + encodeURIComponent("Курсовая");

/** Кластер Вордстата: «курсовая на заказ», «курсовая работа на заказ», плюс ВЧ «купить курсовую» (~12k+). */
const PAGE_DESCRIPTION =
  "Купить курсовую онлайн: курсовая на заказ и курсовая работа на заказ от " +
  PRICE.toLocaleString("ru-RU") +
  " ₽, " +
  PAGES +
  ". ГОСТ 7.32-2017, тема любая, DOCX в личном кабинете после оплаты.";

export const metadata: Metadata = {
  title: "Купить курсовую — курсовая на заказ, цена | Refai",
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "https://ref-ai.ru/kursovaya-zakaz" },
  keywords: [
    "купить курсовую",
    "купить курсовую работу",
    "курсовая на заказ",
    "курсовая работа на заказ",
    "написание курсовой на заказ",
    "написать курсовую на заказ",
    "сколько стоят курсовые на заказ",
    "курсовые на заказ цены",
    "курсовой проект на заказ",
    "заказать курсовую онлайн",
  ],
  openGraph: {
    title: "Купить курсовую — цена, курсовая на заказ | Refai",
    description: PAGE_DESCRIPTION,
    url: "https://ref-ai.ru/kursovaya-zakaz",
    siteName: "Refai",
    locale: "ru_RU",
    type: "website",
  },
};

export default function KursovayaZakazPage() {
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Главная", item: "https://ref-ai.ru" },
      { "@type": "ListItem", position: 2, name: "Курсовые работы", item: "https://ref-ai.ru/kursovaya" },
      { "@type": "ListItem", position: 3, name: "Курсовая на заказ", item: "https://ref-ai.ru/kursovaya-zakaz" },
    ],
  };

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Купить курсовую онлайн — курсовая на заказ (Refai)",
    description: PAGE_DESCRIPTION,
    provider: { "@type": "Organization", name: "Refai", url: "https://ref-ai.ru" },
    areaServed: "RU",
    offers: {
      "@type": "Offer",
      price: PRICE,
      priceCurrency: "RUB",
      availability: "https://schema.org/InStock",
      url: "https://ref-ai.ru/kursovaya-zakaz",
    },
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Сколько стоят курсовые на заказ в Refai?",
        acceptedAnswer: {
          "@type": "Answer",
          text: `Курсовая на заказ стоит ${PRICE.toLocaleString("ru-RU")} ₽ при типовом объёме ${PAGES} страниц. Цена и списание видны на шаге перед оплатой на главной странице генератора.`,
        },
      },
      {
        "@type": "Question",
        name: "Курсовая работа на заказ — как оформить и что после оплаты?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "На главной выберите тип «Курсовая», введите тему и оплатите. После успешной оплаты запускается генерация; готовый DOCX доступен в разделе «Мои работы».",
        },
      },
      {
        "@type": "Question",
        name: "Есть ли оформление по ГОСТ и список источников?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Да: для курсовой формируется структура по ГОСТ 7.32-2017, включая введение, главы и список использованной литературы из актуальных источников. Настройки титульного листа можно заполнить в профиле.",
        },
      },
      {
        "@type": "Question",
        name: "Какая типичная уникальность текста?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Сервис ориентируется на уникальность порядка 70–90% в типичных проверках; итог зависит от темы и требований вашей методички или системы антиплогиата.",
        },
      },
      {
        "@type": "Question",
        name: "Можно ли заказать написание курсовой на нестандартную тему?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Да: тему вы задаёте в форме генератора; сервис готовит курсовую работу на заказ под вашу формулировку, в том числе для курсового проекта в рамках объёма типа «Курсовая».",
        },
      },
      {
        "@type": "Question",
        name: "Где купить курсовую работу онлайн с ценой?",
        acceptedAnswer: {
          "@type": "Answer",
          text: `На ref-ai.ru: выберите тип «Курсовая», введите тему, оплатите — после оплаты скачайте DOCX. Типичная цена курсовой ${PRICE.toLocaleString("ru-RU")} ₽ за объём ${PAGES}, видна перед оплатой.`,
        },
      },
    ],
  };

  return (
    <main className={`${seo.page} ${styles.kzRoot}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(serviceJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
      />

      <nav className={`${seo.breadcrumbs} ${styles.kzBreadcrumbs}`} aria-label="Навигация">
        <Link href="/">Главная</Link>
        <span>/</span>
        <Link href="/kursovaya">Курсовая работа</Link>
        <span>/</span>
        <span className={seo.breadcrumbCurrent}>На заказ</span>
      </nav>

      <header className={styles.heroBand}>
        <div className={styles.heroInner}>
          <span className={styles.heroLabel}>Курсовая работа на заказ</span>
          <div className={styles.heroTitleRow}>
            <h1 className={styles.heroH1}>
              Курсовая на любую тему — <span className={styles.heroAccent}>за 7–10 минут</span>
            </h1>
          </div>

          <div className={styles.heroTrustBadges}>
            <span className={styles.heroTrustBadge}>ГОСТ 7.32-2017</span>
            <span className={styles.heroTrustBadge}>Объём {PAGES}</span>
            <span className={styles.heroTrustBadge}>Уникальность 70–90%</span>
            <span className={`${styles.heroTrustBadge} ${styles.heroTrustBadgeAccent}`}>
              от {PRICE.toLocaleString("ru-RU")} ₽
            </span>
          </div>

          <p className={styles.heroLead}>
            ИИ пишет курсовую под вашу формулировку: структура с введением, главами, заключением и списком
            литературы из реальных источников. <strong>Цена видна до оплаты</strong> — без скрытых доплат,
            готовый DOCX скачивается в личном кабинете.
          </p>

          <div className={styles.heroCtaBlock}>
            <Link href={MAIN_HREF} className={`${homeHero.heroBtn} ${styles.kzPrimaryCta} ${styles.kzHeroBtnLanding}`}>
              Получить курсовую — {PRICE.toLocaleString("ru-RU")} ₽ →
            </Link>
            <p className={styles.heroCtaMicro}>
              Откроется генератор с типом «Курсовая». Сумма и объём фиксируются перед оплатой — без скрытых доплат.
            </p>
          </div>
        </div>
      </header>

      <section className={styles.sectionBand} aria-labelledby="sec-benefits">
        <div className={styles.sectionBandInner}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionKicker}>Почему Refai</span>
            <h2 id="sec-benefits" className={styles.sectionTitle}>
              Что входит в заказ курсовой работы
            </h2>
          </div>
          <ul className={styles.benefits}>
            {[
              "Тип работы и диапазон страниц видны до оплаты — сумма в чеке предсказуема.",
              "Структура курсового проекта: введение, главы, заключение, список литературы.",
              "Оплата через ЮКассу; готовый файл лежит в «Мои работы» для скачивания.",
              "После текста можно заказать презентацию и речь для защиты.",
            ].map((t) => (
              <li key={t} className={styles.benefitItem}>
                <span className={styles.benefitIcon} aria-hidden="true">
                  ✓
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Сколько стоят курсовые на заказ и сколько стоит купить курсовую</h2>
        <div className={styles.priceBox}>
          <div className={styles.priceRow}>
            <span className={styles.priceValue}>{PRICE.toLocaleString("ru-RU")} ₽</span>
            <span className={styles.priceMeta}>{KT.label} · примерный объём {PAGES}</span>
          </div>
          <ul className={styles.priceBullets}>
            <li>Один платёж = одна генерация по вашей теме.</li>
            <li>В превью на сайте описаны возможности типа работы; итог скачиваете в DOCX.</li>
            <li>Титульный лист и поля университета при необходимости задаются в профиле.</li>
          </ul>
          <Link href={MAIN_HREF} className={`${seo.ctaButton} ${styles.priceCta} ${styles.kzPrimaryCta}`}>
            Указать тему и запустить — {PRICE.toLocaleString("ru-RU")} ₽ →
          </Link>
        </div>
      </section>

      <section className={styles.sectionBand} aria-labelledby="sec-steps">
        <div className={styles.sectionBandInner}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionKicker}>Пошагово</span>
            <h2 id="sec-steps" className={styles.sectionTitle}>
              Как заказать написание курсовой работы
            </h2>
          </div>
          <ol className={styles.steps}>
          <li className={styles.step}>
            <p className={styles.stepBody}>
              Нажмите кнопку заказа — откроется главная страница с выбранной «Курсовой». Введите тему своими словами.
            </p>
          </li>
          <li className={styles.step}>
            <p className={styles.stepBody}>
              Выставьте объём ползунком в рамках {PAGES} и при необходимости заполните профиль под титульный лист.
            </p>
          </li>
          <li className={styles.step}>
            <p className={styles.stepBody}>Оплатите заказ. После успешной оплаты сервис запускает генерацию автоматически.</p>
          </li>
          <li className={styles.step}>
            <p className={styles.stepBody}>
              Когда статус станет «готово», скачайте DOCX в разделе{" "}
              <Link href="/dashboard" className={styles.textLink}>
                Мои работы
              </Link>
              . При желании добавьте презентацию и речь к защите.
            </p>
          </li>
        </ol>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="sec-compare">
        <h2 id="sec-compare" className={styles.sectionTitle}>
          Самому долго — здесь быстрее
        </h2>
        <div className={styles.compare}>
          <div className={`${styles.compareCard} ${styles.compareCardSam}`}>
            <div className={styles.compareCardHead}>
              <span className={styles.compareIconWrap} aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  <path d="M8 7h8M8 11h6" />
                </svg>
              </span>
              <strong>Самому</strong>
            </div>
            <p className={styles.compareText}>
              Литература, главы, оформление по ГОСТ и дедлайн — это дни и недели работы и концентрации.
            </p>
          </div>
          <div className={`${styles.compareCard} ${styles.compareCardRefai}`}>
            <div className={styles.compareCardHead}>
              <span className={styles.compareIconWrap} aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </span>
              <strong>С Refai</strong>
            </div>
            <p className={styles.compareText}>
              Тему задаёте вы; каркас текста и DOCX по ГОСТ формирует сервис — обычно несколько минут после оплаты (см. подсказки на главной при генерации).
            </p>
          </div>
        </div>
      </section>

      <section className={styles.sectionBand} aria-labelledby="sec-faq">
        <div className={styles.sectionBandInner}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionKicker}>FAQ</span>
            <h2 id="sec-faq" className={styles.sectionTitle}>
              Частые вопросы
            </h2>
          </div>
        <div className={styles.faqList}>
          <details className={styles.faqItem}>
            <summary>Купить курсовую — сколько стоит и как отличить от «курсача»?</summary>
            <p className={styles.faqAnswer}>
              Купить курсовую у нас — это оплатить генерацию по вашей теме: сейчас {PRICE.toLocaleString("ru-RU")} ₽ за типовой объём {PAGES}. Точная сумма на шаге перед оплатой;
              разговорная форма «курсач» — то же самое по смыслу.
            </p>
          </details>
          <details className={styles.faqItem}>
            <summary>Где купить курсовую работу онлайн легально и с ценой?</summary>
            <p className={styles.faqAnswer}>
              На этом сайте: главная кнопка со страницы ведёт в генератор с типом «Курсовая». Вы вводите тему, оплачиваете юридически оформленную услугу (оферта в подвале),
              скачиваете DOCX в «Мои работы». Подходит, если вы искали в поиске «купить курсовую» или «курсовая на заказ».
            </p>
          </details>
          <details className={styles.faqItem}>
            <summary>Курсовая работа на заказ — подойдёт для защиты и антиплагиата?</summary>
            <p className={styles.faqAnswer}>
              Текст ориентирован на типичную уникальность 70–90%; требования вузов и конкретных систем сдачи нужно проверять самостоятельно перед сдачей.
            </p>
          </details>
          <details className={styles.faqItem}>
            <summary>Написать курсовую на заказ по своей теме — можно?</summary>
            <p className={styles.faqAnswer}>
              Да — тему вы вводите сами в поле генератора; сервис строит работу под вашу формулировку.
            </p>
          </details>
          <details className={styles.faqItem}>
            <summary>Презентация к курсовой есть?</summary>
            <p className={styles.faqAnswer}>
              После основной генерации можно заказать презентацию (+{EXTRAS_PRICES.presentation} ₽) и текст выступления (+{EXTRAS_PRICES.speech} ₽).
            </p>
          </details>
        </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="sec-extras">
        <h2 id="sec-extras" className={styles.sectionTitle}>
          К защите
        </h2>
        <div className={styles.extrasGrid}>
          <div className={styles.extraCard}>
            <div className={styles.extraCardTop}>
              <span className={styles.extraIcon} aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" />
                </svg>
              </span>
              <div>
                <div>Презентация к курсовой</div>
                <span className={styles.extraPrice}>+{EXTRAS_PRICES.presentation.toLocaleString("ru-RU")} ₽ · PPTX</span>
              </div>
            </div>
          </div>
          <div className={styles.extraCard}>
            <div className={styles.extraCardTop}>
              <span className={styles.extraIcon} aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                </svg>
              </span>
              <div>
                <div>Текст выступления</div>
                <span className={styles.extraPrice}>+{EXTRAS_PRICES.speech.toLocaleString("ru-RU")} ₽ · DOCX</span>
              </div>
            </div>
          </div>
        </div>
        <p className={styles.extrasNote}>
          Дополнительные материалы заказываются после готовности основной курсовой — в окне результата генерации.
        </p>
      </section>

      <div className={`${hub.cta} ${styles.spacingBeforeCtaHub} ${styles.kzHubWrap}`}>
        <span className={hub.ctaIcon} aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="11.25" fill="#1D5CFF"/>
            <rect x="6.38" y="7.13" width="11.25" height="1.88" rx="0.94" fill="#FFFFFF"/>
            <rect x="6.38" y="10.88" width="8.25" height="1.88" rx="0.94" fill="#FFFFFF" opacity="0.7"/>
            <rect x="6.38" y="14.63" width="6" height="1.88" rx="0.94" fill="#FFFFFF"/>
            <path d="M15.38 13.69Q16.03 14.91 17.25 15.56Q16.03 16.22 15.38 17.44Q14.72 16.22 13.5 15.56Q14.72 14.91 15.38 13.69Z" fill="#FFFFFF"/>
          </svg>
        </span>
        <h2 className={`${hub.ctaTitle} ${styles.kzHubTitle}`}>Оформим курсовую под вашу тему?</h2>
        <p className={`${hub.ctaDesc} ${styles.kzHubDesc}`}>Структура, текст, источники и DOCX после оплаты — в один шаг из этой страницы</p>
        <Link href={MAIN_HREF} className={`${homeHero.heroBtn} ${styles.kzHubBtn} ${styles.kzHeroBtnLanding}`}>
          Запуск генерации — {PRICE.toLocaleString("ru-RU")} ₽ →
        </Link>
      </div>

      <p className={styles.seoLead}>
        Если вы искали <strong>«купить курсовую»</strong>, <strong>«купить курсовую работу»</strong>,{" "}
        <strong>«курсовая на заказ»</strong>, <strong>«курсовая работа на заказ»</strong>,{" "}
        <strong>«написание курсовой на заказ»</strong> или <strong>«курсовые на заказ цены»</strong> — эта страница ведёт к одному сценарию:
        генератор, понятная цена и DOCX в «Мои работы».
        Примеры тем по предметам — в <Link href="/kursovaya">каталоге курсовых</Link>; объём курсового проекта уточняйте ползунком (в пределах {PAGES}).
      </p>
    </main>
  );
}
