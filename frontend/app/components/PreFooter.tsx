import styles from "./PreFooter.module.css";

export default function PreFooter() {
  return (
    <section className={styles.prefooter}>
      <div className={styles.prefooterInner}>
        <div className={styles.illustrationWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/illustrations/students-graduates.png"
            alt="Успешные студенты с дипломами"
            className={styles.illustration}
            loading="lazy"
          />
        </div>

        <div className={styles.prefooterCenter}>
          <p className={styles.prefooterCount}>
            Более <span className={styles.prefooterAccent}>1 000+</span> студентов
          </p>
          <h2 className={styles.prefooterTitle}>
            успешно защитили свои работы с Refai
          </h2>
          <p className={styles.prefooterSub}>
            Оформление по ГОСТ, высокая оригинальность и сдача точно в срок без бессонных ночей.
          </p>
          <a href="#generator" className={styles.prefooterBtn}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{ marginRight: "4px" }}>
              <path d="M13.4408 2.5L12.6589 4.83853L10.3134 5.61804V6.54713L12.6589 7.32664L13.4408 9.66517H14.3727L15.1545 7.32664L17.5 6.54713V5.61804L15.1545 4.83853L14.3727 2.5H13.4408Z" fill="white"/>
              <path d="M5.95057 10.8371L7.10076 7.39677H8.03263L9.18282 10.8371L12.6334 11.9838V12.9129L9.18282 14.0597L8.03263 17.5H7.10076L5.95057 17.5H7.10076L5.95057 14.0597L2.5 12.9129V11.9838L5.95057 10.83717" fill="white"/>
            </svg>
            Создать работу
          </a>
          <p className={styles.prefooterHeart}>
            Помогаем учиться без лишнего стресса&nbsp;💙
          </p>
        </div>
      </div>
    </section>
  );
}
