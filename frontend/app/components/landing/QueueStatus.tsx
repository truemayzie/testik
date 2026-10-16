"use client";

import { useEffect, useState } from "react";
import styles from "../../page.module.css";

type SlotsData = {
  used: number;
  max: number;
  available: string[];
};

/**
 * Живая строка занятости генерации: «Сейчас в работе: N из M».
 * Данные — реальные, из /api/capacity (backend /api/slots).
 * Обновляется раз в 60 секунд, при ошибке блок скрывается.
 */
export default function QueueStatus() {
  const [slots, setSlots] = useState<SlotsData | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/capacity", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Partial<SlotsData>;
        if (
          typeof data.used === "number" &&
          typeof data.max === "number" &&
          data.max > 0 &&
          !cancelled
        ) {
          setSlots({ used: data.used, max: data.max, available: data.available ?? [] });
        }
      } catch {
        /* аналитика не должна ломать UI */
      }
    };

    void load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (!slots) return null;

  const busy = Math.max(0, Math.min(slots.used, slots.max));
  const free = Math.max(0, slots.max - busy);
  const pct = Math.min(100, Math.round((busy / slots.max) * 100));
  const loadLevel = free === 0 ? "full" : pct >= 60 ? "high" : "normal";

  const label =
    free === 0
      ? "Все слоты заняты — заказы обрабатываются по очереди"
      : busy === 0
        ? "Свободно — генерация начнётся сразу"
        : `Сейчас в работе: ${busy} из ${slots.max}`;

  return (
    <div
      className={`${styles.queueStatus} ${styles[`queueStatus_${loadLevel}`] || ""}`}
      role="status"
      aria-label={label}
    >
      <span className={styles.queueStatusDot} aria-hidden />
      <span className={styles.queueStatusText}>{label}</span>
    </div>
  );
}
