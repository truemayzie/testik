import type { ReactNode } from "react";
import styles from "./SectionHeading.module.css";

export interface SectionHeadingProps {
  eyebrow?: string;
  title: ReactNode;
  lead?: string;
  align?: "left" | "center";
  /** Дополнительный контент справа (кнопки, ссылки) */
  aside?: ReactNode;
}

/**
 * Единый заголовок секции лендинга/страниц:
 * eyebrow (надзаголовок) + title + lead, с выравниванием.
 */
export function SectionHeading({ eyebrow, title, lead, align = "center", aside }: SectionHeadingProps) {
  return (
    <header className={[styles.wrap, align === "center" ? styles.center : "", aside ? styles.withAside : ""].join(" ")}>
      <div className={styles.texts}>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h2 className={styles.title}>{title}</h2>
        {lead && <p className={styles.lead}>{lead}</p>}
      </div>
      {aside && <div className={styles.aside}>{aside}</div>}
    </header>
  );
}
