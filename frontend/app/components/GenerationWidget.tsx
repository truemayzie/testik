"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { readGenState, type GenState } from "@/app/lib/genState";
import { computeProgress } from "@/app/lib/progressSteps";
import styles from "./GenerationWidget.module.css";

export default function GenerationWidget() {
  const pathname = usePathname();
  const [state, setState] = useState<GenState | null>(null);
  const [computed, setComputed] = useState({ percent: 0, stepLabel: "" });

  // Читаем базовое состояние из localStorage каждые 2с
  useEffect(() => {
    const tick = () => setState(readGenState());
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, []);

  // Пересчитываем прогресс каждую секунду на основе startedAt (не зависит от page.tsx)
  useEffect(() => {
    if (!state?.active) return;
    const recalc = () => {
      const elapsed = Date.now() - state.startedAt;
      setComputed(computeProgress(state.workType, elapsed));
    };
    recalc();
    const id = setInterval(recalc, 1000);
    return () => clearInterval(id);
  }, [state?.active, state?.startedAt, state?.workType]);

  // На главной странице уже есть основной прогресс-бар
  if (pathname === "/" || !state?.active) return null;

  const pct = computed.percent;

  return (
    <Link href="/" className={styles.widget} title="Вернуться к генерации">
      <div className={styles.header}>
        <span className={styles.spinner} />
        <span className={styles.label}>
          Генерация{pct > 0 ? ` · ${pct}%` : "..."}
        </span>
      </div>
      <div className={styles.bar}>
        <div className={styles.fill} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      {computed.stepLabel && (
        <p className={styles.step}>{computed.stepLabel}</p>
      )}
    </Link>
  );
}
