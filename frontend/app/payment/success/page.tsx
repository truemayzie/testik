"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./success.module.css";

type State = "waiting" | "succeeded" | "cancelled" | "timeout";

export default function PaymentSuccessPage() {
  const router = useRouter();
  const [state, setState] = useState<State>("waiting");
  const [workType, setWorkType] = useState("");

  useEffect(() => {
    // Проверяем режим: extras или обычная генерация
    const searchParams = new URLSearchParams(window.location.search);
    const isExtras = searchParams.get("mode") === "extras";

    if (isExtras) {
      // Extras: читаем pendingExtras (returnTo=dashboard → редирект в кабинет)
      let pending: { paymentId?: string; returnTo?: string } = {};
      try { pending = JSON.parse(sessionStorage.getItem("pendingExtras") || "{}"); } catch {}

      const extrasTarget =
        pending.returnTo === "dashboard"
          ? "/dashboard?extrasAutoGenerate=1"
          : "/?extrasAutoGenerate=1";

      const paymentId = pending.paymentId;
      if (!paymentId) {
        router.push(extrasTarget);
        return;
      }

      const MAX_POLLS = 15;
      let polls = 0;
      const id = setInterval(async () => {
        polls++;
        try {
          const res  = await fetch(`/api/payment/status?id=${paymentId}`);
          const data = await res.json();
          if (data.status === "succeeded") {
            clearInterval(id);
            setState("succeeded");
            setTimeout(() => router.push(extrasTarget), 1200);
            return;
          }
          if (data.status === "cancelled") { clearInterval(id); setState("cancelled"); return; }
        } catch {}
        if (polls >= MAX_POLLS) {
          clearInterval(id);
          setState("timeout");
          setTimeout(() => router.push(extrasTarget), 2000);
        }
      }, 2000);
      return () => clearInterval(id);
    }

    // Обычная генерация
    let pending: { paymentId?: string; workType?: string } = {};
    try {
      pending = JSON.parse(sessionStorage.getItem("pendingGeneration") || "{}");
    } catch {}

    const paymentId = pending.paymentId;
    const wt        = pending.workType || "";
    setWorkType(wt);

    // Нет paymentId — скорее всего dev-режим, просто редирект
    if (!paymentId) {
      router.push("/?autoGenerate=1");
      return;
    }

    const MAX_POLLS = 15; // 15 × 2с = 30с
    let polls = 0;

    const id = setInterval(async () => {
      polls++;
      try {
        const res  = await fetch(`/api/payment/status?id=${paymentId}`);
        const data = await res.json();

        if (data.status === "succeeded") {
          clearInterval(id);
          setState("succeeded");
          setTimeout(() => router.push("/?autoGenerate=1"), 1200);
          return;
        }

        if (data.status === "cancelled") {
          clearInterval(id);
          setState("cancelled");
          return;
        }
      } catch { /* сеть — ждём */ }

      if (polls >= MAX_POLLS) {
        clearInterval(id);
        // Тайм-аут: webhook ещё не пришёл, но скорее всего оплата прошла.
        // Редиректим — generate/route.ts проверит платёж ещё раз.
        setState("timeout");
        setTimeout(() => router.push("/?autoGenerate=1"), 2000);
      }
    }, 2000);

    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "cancelled") {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.cancelIcon}>✕</div>
          <h1 className={styles.title}>Оплата отменена</h1>
          <p className={styles.sub}>
            Вы отменили оплату{workType ? ` за «${workType}»` : ""}.<br />
            Деньги не списаны.
          </p>
          <a href="/" className={styles.retryBtn}>← Попробовать снова</a>
        </div>
      </div>
    );
  }

  if (state === "succeeded") {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.checkIcon}>✓</div>
          <h1 className={styles.title}>Оплата прошла успешно!</h1>
          <p className={styles.sub}>Запускаем генерацию...</p>
          <div className={styles.dots}>
            <span /><span /><span />
          </div>
        </div>
      </div>
    );
  }

  // waiting / timeout
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.checkIcon}>✓</div>
        <h1 className={styles.title}>
          {state === "timeout" ? "Оплата получена" : "Подтверждаем оплату..."}
        </h1>
        <p className={styles.sub}>
          {state === "timeout"
            ? "Запускаем генерацию..."
            : "Обычно занимает несколько секунд"}
        </p>
        <div className={styles.dots}>
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}
