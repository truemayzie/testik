"use client";

import styles from "../../page.module.css";

const GUARANTEES = [
  {
    image: "/illustrations/guarantee-refund.png",
    alt: "Гарантия возврата денег",
    title: "Вернём деньги",
    text: "Если работа не подойдёт из-за ошибки на нашей стороне — повторим генерацию или вернём оплату полностью.",
  },
  {
    image: "/illustrations/guarantee-preview.png",
    alt: "Бесплатное превью работы до оплаты",
    title: "Превью до оплаты",
    text: "Содержание и фрагмент текста видны бесплатно. Платите только когда убедились, что структура подходит.",
  },
  {
    image: "/illustrations/guarantee-secure.png",
    alt: "Безопасная оплата через сертифицированные сервисы",
    title: "Оплата защищена",
    text: "Платежи проходят через ЮKassa и Robokassa — сертифицированные платёжные сервисы. Данные карты не попадают к нам.",
  },
];

export default function GuaranteeSection() {
  return (
    <section className={styles.guaranteeSection}>
      <div className={styles.guaranteeInner}>
        <div className={styles.guaranteeHead} data-reveal>
          <p className={styles.guaranteeEyebrow}>Гарантии</p>
          <h2 className={styles.guaranteeTitle}>
            Вы ничем <span className={styles.guaranteeAccent}>не рискуете</span>
          </h2>
        </div>
        <div className={styles.guaranteeGrid}>
          {GUARANTEES.map((g, i) => (
            <div key={g.title} className={styles.guaranteeCard} data-reveal data-delay={String(i + 1)}>
              <div className={styles.guaranteeCardIllustration}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={g.image}
                  alt={g.alt}
                  className={styles.guaranteeCardImg}
                  loading="lazy"
                />
              </div>
              <h3 className={styles.guaranteeCardTitle}>{g.title}</h3>
              <p className={styles.guaranteeCardText}>{g.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
