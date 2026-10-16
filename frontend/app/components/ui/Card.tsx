import type { HTMLAttributes } from "react";
import styles from "./Card.module.css";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Поднятая карточка (hover-эффект) */
  interactive?: boolean;
  /** Мягкий фон --bg-soft вместо белого */
  soft?: boolean;
  /** Без внутренних отступов (для контента с собственными отступами) */
  flush?: boolean;
}

/**
 * Единая карточка дизайн-системы.
 * interactive — для кликабельных карточек (поднимается при hover).
 */
export function Card({ interactive, soft, flush, className, children, ...rest }: CardProps) {
  return (
    <div
      className={[
        styles.card,
        interactive ? styles.interactive : "",
        soft ? styles.soft : "",
        flush ? styles.flush : "",
        className ?? "",
      ].join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
