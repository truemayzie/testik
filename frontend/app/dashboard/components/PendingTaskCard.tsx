"use client";

import React from "react";
import styles from "../dashboard.module.css";
import type { PendingOrder } from "../types";

interface PendingTaskCardProps {
  order: PendingOrder;
  onPay: (orderId: string) => void;
  formatDate: (dateStr: string) => string;
}

export const PendingTaskCard: React.FC<PendingTaskCardProps> = ({
  order,
  onPay,
  formatDate,
}) => {
  return (
    <div className={`${styles.card} ${styles.cardAwaiting}`}>
      <div
        className={styles.cardLeft}
        onClick={() => onPay(order.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onPay(order.id)}
      >
        <div className={styles.cardBadges}>
          <span className={styles.workType}>{order.workType}</span>
          <span className={styles.extrasBadgeAwaiting}>Ожидает оплаты</span>
        </div>
        <h3 className={styles.cardTitle}>{order.topic}</h3>
        <div className={styles.cardMeta}>
          <span>~{order.pages} страниц</span>
          <span className={styles.dot}>·</span>
          <span suppressHydrationWarning>{formatDate(order.createdAt)}</span>
        </div>
      </div>
      <div className={styles.cardActions}>
        <button
          type="button"
          className={styles.openBtn}
          onClick={() => onPay(order.id)}
        >
          Оплатить
        </button>
      </div>
    </div>
  );
};
