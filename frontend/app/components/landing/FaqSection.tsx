"use client";

import { useState } from "react";
import styles from "../../page.module.css";
import { safeJsonLd } from "@/lib/safeJsonLd";

const FAQ = [
  {
    q: "Как работает генерация?",
    a: "Введите тему, выберите тип работы и нажмите «Создать». На странице заказа увидите содержание и фрагмент текста, затем оплатите полную генерацию. Refai строит план, ищет реальные источники, пишет все разделы и оформляет DOCX по ГОСТ.",
  },
  {
    q: "Какой файл получу на выходе?",
    a: "DOCX (Microsoft Word). Оформление строго по ГОСТ 7.32-2017: Times New Roman 14pt, межстрочный интервал 1.5, поля 30/10/20/20 мм, автоматическая нумерация страниц. Открывается в Word, Google Docs и LibreOffice без потери форматирования.",
  },
  {
    q: "Сколько стоит одна работа?",
    a: "Сочинение — 99 ₽, эссе — 149 ₽, доклад — 199 ₽, реферат — 299 ₽, курсовая — 699 ₽, ВКР — 1 199 ₽. Оплата разовая, без подписки и скрытых платежей. Оплатил — получил работу.",
  },
  {
    q: "Откуда берётся список литературы?",
    a: "Источники ищутся по базе CrossRef — крупнейшему репозиторию научных публикаций. Refai находит реальные работы по теме и оформляет их по ГОСТ Р 7.0.5-2008. Каждый источник можно проверить по DOI.",
  },
  {
    q: "Будет ли высокая уникальность?",
    a: "Да. Каждая работа пишется заново под вашу конкретную тему — никаких шаблонов. Антиплагиат по «Антиплагиат.ру» обычно показывает 70–90%. Точный результат зависит от темы: редкие и узкоспециальные темы дают более высокий показатель.",
  },
  {
    q: "Можно ли редактировать работу после скачивания?",
    a: "Да. DOCX-файл редактируется в любом редакторе: Microsoft Word, Google Docs, LibreOffice. Можно скорректировать формулировки, добавить данные, изменить структуру — форматирование ГОСТ при этом сохранится.",
  },
  {
    q: "Что если работа не устроила?",
    a: "Напишите на support@ref-ai.ru с описанием проблемы. Мы разберём ситуацию: если ошибка на нашей стороне — повторим генерацию или вернём деньги. История работ сохраняется в разделе «Мои работы».",
  },
];

export default function FaqSection() {
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };

  return (
    <section className={styles.faqSection}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }} />
      <div className={styles.faqInner}>
        <h2 className={styles.faqHeading}>
          Часто задаваемые <span className={styles.faqAccent}>вопросы</span>
        </h2>
        <div className={styles.faqGrid}>
          {FAQ.map((item, i) => {
            const isOpen = faqOpen === i;
            return (
              <div
                key={i}
                className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ""}`}
                data-reveal
                data-delay={String((i % 4) + 1)}
              >
                <button
                  className={styles.faqQ}
                  onClick={() => setFaqOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  type="button"
                >
                  <span>{item.q}</span>
                  <svg
                    className={styles.faqIcon}
                    width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s cubic-bezier(0.22,1,0.36,1)" }}
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                <div className={`${styles.faqBody} ${isOpen ? styles.faqBodyOpen : ""}`}>
                  <p className={styles.faqA}>{item.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
