import type { Metadata } from "next";
import Link from "next/link";
import { EXTRAS_PRICES, WORK_PRICES } from "@/lib/prices";
import { safeJsonLd } from "@/lib/safeJsonLd";
import seo from "@/app/[workType]/[slug]/seo-page.module.css";
import hub from "@/app/[workType]/hub.module.css";
import homeHero from "@/app/page.module.css";
import styles from "../kursovaya-zakaz/kursovaya-zakaz.module.css";

const WK = WORK_PRICES["ВКР"];
const PRICE = WK.price;
const PAGES = WK.pages;

const MAIN_HREF = "/?workType=" + encodeURIComponent("ВКР");

/** Кластер Вордстата: «написание дипломной работы», «вкр на заказ», «купить дипломную работу» (текст работы); ИИ / нейросеть — как способ генерации. */
const PAGE_DESCRIPTION =
  "ВКР и дипломная работа на заказ: написание выпускной квалификационной работы с помощью ИИ от " +
  PRICE.toLocaleString("ru-RU") +
  " ₽, " +
  PAGES +
  ". ГОСТ 7.32-2017, тема любая, DOCX в личном кабинете после оплаты.";

export const metadata: Metadata = {
  title: "ВКР на заказ — дипломная работа, цена и ИИ | Refai",
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "https://ref-ai.ru/vkr-zakaz" },
  keywords: [
    "вкр на заказ",
    "дипломная работа на заказ",
    "написание дипломной работы",
    "купить дипломную работу",
    "нейросеть для написания дипломной работы",
    "ии для дипломной работы",
    "выпускная квалификационная работа на заказ",
    "заказать вкр",
  ],
  openGraph: {
    title: "ВКР на заказ — дипломная работа и цена | Refai",
    description: PAGE_DESCRIPTION,
    url: "https://ref-ai.ru/vkr-zakaz",
    siteName: "Refai",
    locale: "ru_RU",
    type: "website",
  },
};

export default function VkrZakazPage() {
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Главная", item: "https://ref-ai.ru" },
      { "@type": "ListItem", position: 2, name: "ВКР", item: "https://ref-ai.ru/vkr" },
      { "@type": "ListItem", position: 3, name: "ВКР на заказ", item: "https://ref-ai.ru/vkr-zakaz" },
    ],
  };

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "ВКР и дипломная работа на заказ с ИИ — Refai",
    description: PAGE_DESCRIPTION,
    provider: { "@type": "Organization", name: "Refai", url: "https://ref-ai.ru" },
    areaServed: "RU",
    offers: {
      "@type": "Offer",
      price: PRICE,
      priceCurrency: "RUB",
      availability: "https://schema.org/InStock",
      url: "https://ref-ai.ru/vkr-zakaz",
    },
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Сколько стоит ВКР на заказ в Refai?",
        acceptedAnswer: {
          "@type": "Answer",
          text: `Тип «ВКР» стоит ${PRICE.toLocaleString("ru-RU")} ₽ при типовом объёме ${PAGES} страниц. Цена и списание видны на шаге перед оплатой на главной.`,
        },
      },
      {
        "@type": "Question",
        name: "Это нейросеть / ИИ для дипломной работы?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Да: текст и структура ВКР формируются сервисом на базе языковой модели (ИИ) по вашей теме. Итог редактируете и сверяете с методичкой вуза перед сдачей.",
        },
      },
      {
        "@type": "Question",
        name: "Есть ли оформление по ГОСТ и список источников?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Да: для ВКР генерируются введение, главы, заключение и список использованной литературы по ГОСТ 7.32-2017. Титульник настраивается в профиле.",
        },
      },
      {
        "@type": "Question",
        name: "Какая типичная уникальность текста?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Сервис ориентируется на уникальность порядка 70–90% в типичных проверках; итог зависит от темы и системы антиплогиата.",
        },
      },
      {
        "@type": "Question",
        name: "Можно ли заказать ВКР по своей теме?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Да: тему задаёте в форме генератора; сервис строит выпускную работу под вашу формулировку в пределах типа «ВКР» и выбранного объёма страниц.",
        },
      },
      {
        "@type": "Question",
        name: "Где заказать написание дипломной работы онлайн с ценой?",
        acceptedAnswer: {
          "@type": "Answer",
          text: `На ref-ai.ru выберите тип «ВКР», введите тему, оплатите — затем скачайте DOCX из «Мои работы». Цена ${PRICE.toLocaleString("ru-RU")} ₽ за объём ${PAGES} указана перед оплатой.`,
        },
      },
    ],
  };

  return (
    <main className={`${seo.page} ${styles.kzRoot}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(serviceJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }} />

      <nav className={`${seo.breadcrumbs} ${styles.kzBreadcrumbs}`} aria-label="Навигация">
        <Link href="/">Главная</Link>
        <span>/</span>
        <Link href="/vkr">ВКР</Link>
        <span>/</span>
        <span className={seo.breadcrumbCurrent}>На заказ</span>
      </nav>

      <header className={styles.heroBand}>
        <div className={styles.heroInner}>
          <span className={styles.heroLabel}>Выпускная квалификационная работа</span>
          <div className={styles.heroTitleRow}>
            <h1 className={styles.heroH1}>
              ВКР и дипломная на заказ — <span className={styles.heroAccent}>ИИ пишет за вас</span>
            </h1>
          </div>

          <div className={styles.heroTrustBadges}>
            <span className={styles.heroTrustBadge}>ГОСТ 7.32-2017</span>
            <span className={styles.heroTrustBadge}>Объём {PAGES}</span>
            <span className={styles.heroTrustBadge}>Уникальность 70–90%</span>
            <span className={`${styles.heroTrustBadge} ${styles.heroTrustBadgeAccent}`}>от {PRICE.toLocaleString("ru-RU")} ₽</span>
          </div>

          <p className={styles.heroLead}>
            Полный каркас выпускной работы: введение с актуальностью и целями, теоретическая и практическая
            главы, заключение, библиография. <strong>Цена видна до оплаты</strong> — DOCX по ГОСТ скачивается
            в личном кабинете (это текст работы, а не «бумажный диплом»).
          </p>

          <div className={styles.heroCtaBlock}>
            <Link href={MAIN_HREF} className={`${homeHero.heroBtn} ${styles.kzPrimaryCta} ${styles.kzHeroBtnLanding}`}>
              Заказать ВКР — {PRICE.toLocaleString("ru-RU")} ₽ →
            </Link>
            <p className={styles.heroCtaMicro}>
              Откроется генератор с типом «ВКР». Сумма и объём фиксируются перед оплатой; ВКР генерируется дольше реферата — прогресс виден на главной.
            </p>
          </div>
        </div>
      </header>

      <section className={styles.sectionBand} aria-labelledby="sec-benefits">
        <div className={styles.sectionBandInner}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionKicker}>Почему Refai</span>
            <h2 id="sec-benefits" className={styles.sectionTitle}>
              Что входит в заказ ВКР и дипломной
            </h2>
          </div>
          <ul className={styles.benefits}>
            {[
              "Тип «ВКР» и диапазон страниц видны до оплаты — сумма в чеке предсказуема.",
              "Каркас выпускной работы: введение, главы, заключение, список литературы по ГОСТ.",
              "Оплата через ЮКассу; готовый файл в «Мои работы» для скачивания.",
              "После текста можно заказать презентацию и текст выступления к защите.",
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
        <h2 className={styles.sectionTitle}>Сколько стоит ВКР и дипломная работа на заказ</h2>
        <div className={styles.priceBox}>
          <div className={styles.priceRow}>
            <span className={styles.priceValue}>{PRICE.toLocaleString("ru-RU")} ₽</span>
            <span className={styles.priceMeta}>{WK.label} · примерный объём {PAGES}</span>
          </div>
          <ul className={styles.priceBullets}>
            <li>Один платёж = одна генерация ВКР по вашей теме.</li>
            <li>Описание возможностей типа «ВКР» — на главной сайта; файл скачиваете в DOCX.</li>
            <li>Поля титульника и вуза задаются в профиле при необходимости.</li>
          </ul>
          <Link href={MAIN_HREF} className={`${seo.ctaButton} ${styles.priceCta} ${styles.kzPrimaryCta}`}>
            Перейти к заказу ВКР →
          </Link>
        </div>
      </section>

      <section className={styles.sectionBand} aria-labelledby="sec-steps">
        <div className={styles.sectionBandInner}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionKicker}>Пошагово</span>
            <h2 id="sec-steps" className={styles.sectionTitle}>
              Как заказать написание дипломной / ВКР
            </h2>
          </div>
          <ol className={styles.steps}>
            <li className={styles.step}>
              <p className={styles.stepBody}>
                Нажмите кнопку заказа — откроется главная с выбранным типом «ВКР». Введите тему выпускной работы своими словами.
              </p>
            </li>
            <li className={styles.step}>
              <p className={styles.stepBody}>
                Настройте объём ползунком в пределах {PAGES} и при необходимости заполните профиль под титульный лист.
              </p>
            </li>
            <li className={styles.step}>
              <p className={styles.stepBody}>
                Оплатите заказ. После успешной оплаты запускается генерация ВКР — обычно дольше, чем у курсовой; ждите статус на странице генерации.
              </p>
            </li>
            <li className={styles.step}>
              <p className={styles.stepBody}>
                По готовности скачайте DOCX в разделе{" "}
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
          Самому долго — здесь быстрее старт
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
              Дипломная — десятки страниц, литература и сроки защиты; на каркас текста уходят недели.
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
              Тему задаёте вы; ИИ формирует структуру и основной текст ВКР в DOCX по ГОСТ. После оплаты генерация идёт автоматически — время зависит от нагрузки (для ВКР оно больше, чем для коротких работ).
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
              <summary>ВКР на заказ — сколько стоит?</summary>
              <p className={styles.faqAnswer}>
                Сейчас тип «ВКР» — {PRICE.toLocaleString("ru-RU")} ₽ за типовой объём {PAGES}. Итоговая сумма показывается перед оплатой.
              </p>
            </details>
            <details className={styles.faqItem}>
              <summary>«Купить дипломную работу» у вас — это не «бумажный диплом»?</summary>
              <p className={styles.faqAnswer}>
                Верно: вы получаете сгенерированный текст выпускной (дипломной) работы в DOCX и список источников. Речь не о государственном документе об образовании — только об учебном тексте.
              </p>
            </details>
            <details className={styles.faqItem}>
              <summary>Подойдёт для защиты и антиплагиата?</summary>
              <p className={styles.faqAnswer}>
                Текст ориентирован на типичную уникальность 70–90%; методичку вуза и требования к сдаче проверьте самостоятельно.
              </p>
            </details>
            <details className={styles.faqItem}>
              <summary>Нейросеть для дипломной — можно без переплат?</summary>
              <p className={styles.faqAnswer}>
                Цена фиксируется на шаге оплаты: одна ВКР = один платёж по текущему тарифу, без доплат за «ИИ» отдельно.
              </p>
            </details>
            <details className={styles.faqItem}>
              <summary>Есть презентация и речь к защите ВКР?</summary>
              <p className={styles.faqAnswer}>
                После основной генерации можно заказать презентацию (+{EXTRAS_PRICES.presentation.toLocaleString("ru-RU")} ₽) и текст выступления (
                +{EXTRAS_PRICES.speech.toLocaleString("ru-RU")} ₽).
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
                <div>Презентация к защите ВКР</div>
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
          Презентация и выступление заказываются после готовности основной ВКР — в окне результата генерации.
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
        <h2 className={`${hub.ctaTitle} ${styles.kzHubTitle}`}>Готовы заказать ВКР?</h2>
        <p className={`${hub.ctaDesc} ${styles.kzHubDesc}`}>Тема любая · оплата онлайн · DOCX в личном кабинете</p>
        <Link href={MAIN_HREF} className={`${homeHero.heroBtn} ${styles.kzHubBtn} ${styles.kzHeroBtnLanding}`}>
          ВКР на заказ — {PRICE.toLocaleString("ru-RU")} ₽ →
        </Link>
      </div>

      <p className={styles.seoLead}>
        Если искали <strong>«написание дипломной работы»</strong>, <strong>«нейросеть для дипломной»</strong>,{" "}
        <strong>«вкр на заказ»</strong> или <strong>«купить дипломную работу»</strong> как текст выпускной — эта страница ведёт к генератору с типом «ВКР», цена {PRICE.toLocaleString("ru-RU")} ₽ и объём {PAGES} видны перед оплатой.
        Примеры тем по направлениям — в{" "}
        <Link href="/vkr">каталоге ВКР</Link>; при необходимости уточните страницы ползунком на главной в пределах {PAGES}.
      </p>
    </main>
  );
}
