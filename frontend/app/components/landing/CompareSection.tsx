"use client";

import styles from "../../page.module.css";

type CompareAiTone = "plus" | "neutral" | "minus";

const AI_COMPARE_ROWS: {
  label: string;
  generic: string;
  refai: string;
  aiTone: CompareAiTone;
}[] = [
  {
    label: "Идеи и черновик",
    aiTone: "plus",
    generic: "Быстрые ответы, можно уточнять в чате",
    refai: "Сразу структура под тип работы",
  },
  {
    label: "Оформление по ГОСТ",
    aiTone: "neutral",
    generic: "Текст есть — поля и шрифты вручную",
    refai: "Готовый DOCX по ГОСТ",
  },
  {
    label: "Список литературы",
    aiTone: "neutral",
    generic: "Подскажет названия — ссылки проверяйте",
    refai: "Реальные источники из баз",
  },
  {
    label: "Структура работы",
    aiTone: "neutral",
    generic: "Зависит от формулировки запроса",
    refai: "Введение, главы, заключение",
  },
  {
    label: "Титульный лист",
    aiTone: "minus",
    generic: "Собираете сами в Word",
    refai: "Заполняется из профиля",
  },
  {
    label: "Формат сдачи",
    aiTone: "neutral",
    generic: "Копировать из чата по частям",
    refai: "Скачать Word одним файлом",
  },
];

function CompareMarkIcon({ kind }: { kind: "yes" | "ai" | "partial" | "no" }) {
  const markClass =
    kind === "yes"
      ? styles.compareMarkYes
      : kind === "ai"
        ? styles.compareMarkAi
        : kind === "partial"
          ? styles.compareMarkPartial
          : styles.compareMarkNo;

  return (
    <span className={`${styles.compareMark} ${markClass}`} aria-hidden>
      {kind === "partial" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M8 12h8" />
        </svg>
      ) : kind === "no" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M8 8l8 8M16 8l-8 8" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 12.5l3.5 3.5L18 8" />
        </svg>
      )}
    </span>
  );
}

function CompareAiMark({ tone }: { tone: CompareAiTone }) {
  if (tone === "plus") return <CompareMarkIcon kind="ai" />;
  if (tone === "neutral") return <CompareMarkIcon kind="partial" />;
  return <CompareMarkIcon kind="no" />;
}

function CompareAiCell({
  text,
  tone,
  className,
}: {
  text: string;
  tone: CompareAiTone;
  className?: string;
}) {
  return (
    <div
      className={[styles.compareRowAi, className ?? ""].filter(Boolean).join(" ")}
    >
      <CompareAiMark tone={tone} />
      <span className={styles.compareCellText}>{text}</span>
    </div>
  );
}

export default function CompareSection() {
  return (
    <section id="chatgpt-compare" className={styles.compareSection}>
      <div className={styles.compareInner}>
        <div className={styles.compareHead} data-reveal>
          <p className={styles.compareEyebrow}>Сравнение</p>
          <h2 className={styles.compareHeading}>
            Обычный ИИ vs <span className={styles.compareAccent}>Refai</span>
          </h2>
          <p className={styles.compareSub}>
            ChatGPT и DeepSeek сильны в диалоге и черновике. Refai — когда нужен готовый файл к сдаче
          </p>
        </div>
        <div className={styles.compareTable} data-reveal data-delay="1">
          <div className={styles.compareHeader}>
            <div className={`${styles.compareHeaderCell} ${styles.compareHeaderCriterion}`}>
              Критерий
            </div>
            <div className={`${styles.compareHeaderCell} ${styles.compareHeaderAiDesktop}`}>
              <img src="/compare-chatgpt.png" alt="ChatGPT" className={styles.compareLogo} width={88} height={28} />
            </div>
            <div className={`${styles.compareHeaderCell} ${styles.compareHeaderAiDesktop}`}>
              <img src="/compare-deepseek.png" alt="DeepSeek" className={styles.compareLogo} width={88} height={28} />
            </div>
            <div
              className={`${styles.compareHeaderCell} ${styles.compareHeaderAiMobile}`}
              aria-label="ChatGPT и DeepSeek"
            >
              <div className={styles.compareAiLogos}>
                <img src="/compare-chatgpt.png" alt="ChatGPT" className={styles.compareLogo} width={72} height={24} />
                <img src="/compare-deepseek.png" alt="DeepSeek" className={styles.compareLogo} width={72} height={24} />
              </div>
            </div>
            <div className={`${styles.compareHeaderCell} ${styles.compareHeaderRefai}`}>
              <img src="/compare-refai.png" alt="Refai" className={styles.compareLogo} width={88} height={28} />
            </div>
          </div>
          {AI_COMPARE_ROWS.map((row, i) => (
            <div key={row.label} className={styles.compareRow} data-reveal data-delay={String(i + 2)}>
              <div className={styles.compareRowLabel}>{row.label}</div>
              <CompareAiCell text={row.generic} tone={row.aiTone} />
              <CompareAiCell
                text={row.generic}
                tone={row.aiTone}
                className={styles.compareRowBadDesktop}
              />
              <div className={styles.compareRowGood}>
                <CompareMarkIcon kind="yes" />
                <span className={styles.compareCellText}>{row.refai}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
