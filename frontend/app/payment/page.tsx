"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { WORK_PRICES } from "@/lib/prices";
import styles from "./payment.module.css";

function PaymentPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workType = searchParams.get("workType") || "Реферат";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const priceInfo = WORK_PRICES[workType];

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  async function handlePay() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка создания платежа");
        return;
      }
      window.location.href = data.paymentUrl;
    } catch {
      setError("Не удалось создать платёж");
    } finally {
      setLoading(false);
    }
  }

  if (status === "loading") {
    return (
      <div className={styles.page}>
        <div className={styles.spinner} />
      </div>
    );
  }

  if (!priceInfo) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p>Неизвестный тип работы</p>
          <a href="/" className={styles.backLink}>← На главную</a>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon}>📄</div>
        <h1 className={styles.title}>{priceInfo.label}</h1>
        <p className={styles.pages}>{priceInfo.pages}</p>

        <div className={styles.priceBlock}>
          <span className={styles.price}>{priceInfo.price} ₽</span>
          <span className={styles.priceNote}>разовая оплата</span>
        </div>

        <ul className={styles.features}>
          <li>✓ Соответствие ГОСТ 7.32-2017</li>
          <li>✓ Реальные источники 2020–2025</li>
          <li>✓ Скачивание в DOCX</li>
          <li>✓ Готово за 2–4 минуты</li>
        </ul>

        {error && <p className={styles.error}>⚠ {error}</p>}

        <button
          className={styles.payBtn}
          onClick={handlePay}
          disabled={loading}
        >
          {loading ? (
            <><span className={styles.btnSpinner} />Создаём платёж...</>
          ) : (
            `⚡ Оплатить ${priceInfo.price} ₽`
          )}
        </button>

        <a href="/" className={styles.backLink}>← Вернуться назад</a>

        <p className={styles.secure}>🔒 Безопасная оплата через ЮКассу</p>
      </div>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense>
      <PaymentPageContent />
    </Suspense>
  );
}
