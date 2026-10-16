"use client";

import { useState } from "react";
import { EXTRAS_PRICES } from "@/lib/prices";
import styles from "../../order/order.module.css";

type ExtrasUpsellProps = {
  workType: string;
  topic: string;
  generationId: string;
  result: unknown; // ReferatResult — передаётся в dashboard-флоу
  onBuy: (items: string[]) => void;
  busy?: boolean;
};

const EXTRAS_META: Record<
  string,
  { title: string; desc: string; renderIcon: () => JSX.Element }
> = {
  presentation: {
    title: "Презентация для защиты",
    desc: "10–12 слайдов PPTX по содержанию работы: тезисы, таблицы, выводы.",
    renderIcon: () => (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M2 3h20" />
        <rect x="3" y="3" width="18" height="12" rx="2" />
        <path d="M8 8h3" />
        <path d="M8 11h6" />
        <path d="M12 15v5" />
        <path d="M8 20h8" />
      </svg>
    ),
  },
  speech: {
    title: "Текст выступления",
    desc: "Речь на 5–7 минут в DOCX: что говорить на каждом слайде.",
    renderIcon: () => (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
        <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="8" y1="22" x2="16" y2="22" />
      </svg>
    ),
  },
};

/**
 * Апселл-блок на странице готовой работы: «Добавить презентацию и речь?»
 * Поднимает средний чек после успешной генерации.
 */
export default function ExtrasUpsell({
  workType,
  topic,
  generationId,
  result,
  onBuy,
  busy = false,
}: ExtrasUpsellProps) {
  const [selected, setSelected] = useState<string[]>(["presentation", "speech"]);
  const [submitted, setSubmitted] = useState(false);

  // Для сочинений и эссе блок защиты и презентации не нужен
  if (workType === "Сочинение" || workType === "Эссе" || workType === "Тест") {
    return null;
  }

  const toggle = (item: string) => {
    setSelected((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item],
    );
  };

  const total = selected.reduce((sum, item) => sum + (EXTRAS_PRICES[item] ?? 0), 0);

  if (submitted) return null;

  const handleBuy = () => {
    if (!selected.length || busy) return;
    setSubmitted(true);
    onBuy(selected);
  };

  return (
    <div className={styles.extrasUpsell} data-generation-id={generationId} data-topic={topic} data-work-type={workType} data-result={typeof result === "object" && result !== null ? "1" : undefined}>
      <div className={styles.extrasUpsellHead}>
        <div className={styles.extrasUpsellHeadText}>
          <p className={styles.extrasUpsellEyebrow}>Защита пройдёт на «отлично»</p>
          <h3 className={styles.extrasUpsellTitle}>Добавить материалы к работе?</h3>
          <p className={styles.extrasUpsellSub}>
            Презентация и речь готовятся по вашей работе — без повторной оплаты текста.
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/illustrations/presentation-hero.png"
          alt="Презентация и защита работы"
          className={styles.extrasUpsellIllustration}
        />
      </div>

      <div className={styles.extrasUpsellList}>
        {Object.entries(EXTRAS_META).map(([key, meta]) => {
          const active = selected.includes(key);
          return (
            <button
              key={key}
              type="button"
              className={`${styles.extrasUpsellItem} ${active ? styles.extrasUpsellItemActive : ""}`}
              onClick={() => toggle(key)}
              aria-pressed={active}
              disabled={busy}
            >
              <span className={styles.extrasUpsellItemIcon} aria-hidden>{meta.renderIcon()}</span>
              <span className={styles.extrasUpsellItemBody}>
                <span className={styles.extrasUpsellItemTitle}>{meta.title}</span>
                <span className={styles.extrasUpsellItemDesc}>{meta.desc}</span>
              </span>
              <span className={styles.extrasUpsellItemPrice}>
                +{EXTRAS_PRICES[key]?.toLocaleString("ru-RU") ?? 0} ₽
              </span>
              <span className={styles.extrasUpsellCheck} aria-hidden>
                {active ? "✓" : ""}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className={styles.extrasUpsellBuy}
        onClick={handleBuy}
        disabled={!selected.length || busy}
      >
        {busy ? "Открываем оплату…" : `Добавить за ${total.toLocaleString("ru-RU")} ₽`}
      </button>
      <p className={styles.extrasUpsellNote}>
        Оплата отдельно от работы · генерация начнётся сразу после платежа
      </p>
    </div>
  );
}
