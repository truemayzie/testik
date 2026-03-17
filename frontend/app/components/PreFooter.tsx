import styles from "./PreFooter.module.css";

export default function PreFooter() {
  return (
    <section className={styles.prefooter}>
      <div className={styles.docsLeft}>
        <div className={`${styles.docCard} ${styles.docCard1}`}>
          <div className={styles.docLine} />
          <div className={styles.docLine} />
          <div className={styles.docLineShort} />
          <div className={styles.docBadge}>РЕФЕРАТ</div>
        </div>
        <div className={`${styles.docCard} ${styles.docCard2}`}>
          <div className={styles.docLine} />
          <div className={styles.docLine} />
          <div className={styles.docLineShort} />
          <div className={styles.docBadge}>КУРСОВАЯ</div>
        </div>
        <div className={`${styles.docCard} ${styles.docCard3}`}>
          <div className={styles.docLine} />
          <div className={styles.docLine} />
          <div className={styles.docLineShort} />
        </div>
      </div>

      <div className={styles.prefooterCenter}>
        <p className={styles.prefooterCount}>
          Более <span className={styles.prefooterAccent}>1 000+</span> работ
        </p>
        <h2 className={styles.prefooterTitle}>сгенерировано Academic</h2>
        <p className={styles.prefooterSub}>Попробуй и ты</p>
        <a href="#generator" className={styles.prefooterBtn}>
          ⚡ Попробовать бесплатно
        </a>
        <p className={styles.prefooterHeart}>
          Academic помогает сдавать работы без стресса&nbsp;❤️
        </p>
      </div>

      <div className={styles.docsRight}>
        <div className={`${styles.docCard} ${styles.docCard4}`}>
          <div className={styles.docLine} />
          <div className={styles.docLine} />
          <div className={styles.docLineShort} />
          <div className={styles.docBadge}>ЭССЕ</div>
        </div>
        <div className={`${styles.docCard} ${styles.docCard5}`}>
          <div className={styles.docLine} />
          <div className={styles.docLine} />
          <div className={styles.docLineShort} />
          <div className={styles.docBadge}>РЕФЕРАТ</div>
        </div>
        <div className={`${styles.docCard} ${styles.docCard6}`}>
          <div className={styles.docLine} />
          <div className={styles.docLine} />
          <div className={styles.docLineShort} />
        </div>
      </div>
    </section>
  );
}
