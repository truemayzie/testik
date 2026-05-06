"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { readGenState, subscribeGenState, type GenState } from "@/app/lib/genState";
import styles from "./GenerationWidget.module.css";

export default function GenerationWidget() {
  const pathname = usePathname();
  const [state, setState] = useState<GenState | null>(null);

  // Слушаем тот же источник состояния, что и главный прогресс-блок.
  useEffect(() => {
    setState(readGenState());
    return subscribeGenState(setState);
  }, []);

  const pct = useMemo(() => {
    if (!state) return 0;
    return Math.max(0, Math.min(99, Math.round(state.percent || 0)));
  }, [state]);
  const stepLabel = (state?.stepLabel || "").trim();

  // На главной странице уже есть основной прогресс-бар
  if (pathname === "/" || !state?.active) return null;

  return (
    <Link href="/" className={styles.widget} title="Вернуться к генерации">
      <div className={styles.header}>
        <span className={styles.spinner} />
        <span className={styles.label}>
          Генерация{pct > 0 ? ` · ${pct}%` : "..."}
        </span>
      </div>
      <div className={styles.bar}>
        <div className={styles.fill} style={{ transform: `scaleX(${Math.max(pct, 2) / 100})` }} />
      </div>
      {stepLabel && <p className={styles.step}>{stepLabel}</p>}
    </Link>
  );
}
