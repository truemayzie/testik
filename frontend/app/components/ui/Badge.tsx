import type { HTMLAttributes } from "react";
import styles from "./Badge.module.css";

export type BadgeTone = "primary" | "success" | "warning" | "danger" | "neutral";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Точка-индикатор слева (для статусов) */
  dot?: boolean;
}

const toneClass: Record<BadgeTone, string> = {
  primary: styles.primary,
  success: styles.success,
  warning: styles.warning,
  danger: styles.danger,
  neutral: styles.neutral,
};

/**
 * Единый бейдж/статус дизайн-системы.
 * Семантика: success = «готово/оплачено», warning = «в работе/ожидание»,
 * danger = «ошибка», primary = акцент, neutral = нейтральная информация.
 */
export function Badge({ tone = "neutral", dot, className, children, ...rest }: BadgeProps) {
  return (
    <span className={[styles.badge, toneClass[tone], className ?? ""].join(" ")} {...rest}>
      {dot && <span className={styles.dot} aria-hidden />}
      {children}
    </span>
  );
}
