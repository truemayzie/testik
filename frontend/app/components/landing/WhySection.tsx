"use client";

import styles from "../../page.module.css";

const WHY_FEATURES = [
  { label: "Скорость",       value: "7–10 мин", note: "Реалистичный срок с учетом объёмных работ" },
  { label: "Простота",       value: "1 тема",   note: "Структуру и источники находит ИИ — вы просто ждёте" },
  { label: "Цена",           value: "от 99 ₽",  note: "Без подписки — платите за каждую работу отдельно" },
  { label: "Доп. материалы", value: "2 в 1",    note: "Презентация и текст доклада — после генерации" },
  { label: "Везде",          value: "24/7",     note: "Со смартфона или компьютера, без установки" },
];


export default function WhySection() {
  return (
    <section className={styles.whySection}>
      <div className={styles.whySectionInner}>
        <div className={styles.whyHead}>
          <p className={styles.whyEyebrow}>Почему Refai</p>
          <h2 className={styles.whySectionTitle}>
            Цифры, а <span className={styles.whyAccent}>не обещания</span>
          </h2>
        </div>
        <dl className={styles.whyStrip}>
          {WHY_FEATURES.map((f, i) => (
            <div key={f.label} className={styles.whyItem} data-reveal data-delay={String(i + 1)}>
              <dt className={styles.whyItemLabel}>{f.label}</dt>
              <dd className={styles.whyStatValue}>{f.value}</dd>
              <dd className={styles.whyItemNote}>{f.note}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
