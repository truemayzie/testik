"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./success.module.css";

export default function PaymentSuccessPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/?autoGenerate=1");
    }, 2000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.checkIcon}>✓</div>
        <h1 className={styles.title}>Оплата прошла успешно!</h1>
        <p className={styles.sub}>Возвращаемся к генерации...</p>
        <div className={styles.dots}>
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}
