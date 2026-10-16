"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { getProgressSteps } from "@/app/lib/progressSteps";
import { useClientGeneration, formatEta } from "@/lib/useClientGeneration";
import {
  patchOrderGenSession,
  markOrderGenerationStartedForTask,
  readOrderGenerationStartedAtForTask,
  type OrderGenSession,
} from "@/lib/orderGenerationSession";
import { loadPreviewStructureForTask } from "@/lib/previewStructure";
import { loadPublicChoiceForTask } from "@/lib/orderPublicChoice";
import styles from "./order.module.css";

type Props = {
  topic: string;
  workType: string;
  pages: number;
  extrasItems: string[];
  taskId: string;
  resumeSession?: OrderGenSession | null;
  onComplete?: () => void;
};

function readExtrasChoice(fallback: string[]): string[] {
  try {
    const raw = sessionStorage.getItem("pendingExtrasChoice");
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return fallback;
  }
}

function readActiveGenerationIds(): { generationId?: string; startedAt?: number } {
  try {
    const raw = sessionStorage.getItem("activeGeneration");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { generationId?: string; startedAt?: number };
    return {
      generationId:
        typeof parsed.generationId === "string" ? parsed.generationId : undefined,
      startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : undefined,
    };
  } catch {
    return {};
  }
}

function extrasProgressLabel(items: string[]): string {
  const hasPres = items.includes("presentation");
  const hasSpeech = items.includes("speech");
  if (hasPres && hasSpeech) return "Генерируем презентацию и текст выступления…";
  if (hasPres) return "Генерируем презентацию…";
  if (hasSpeech) return "Генерируем текст выступления…";
  return "Генерируем дополнительные материалы…";
}

export default function OrderGenerationAside({
  topic,
  workType,
  pages,
  extrasItems,
  taskId,
  resumeSession,
  onComplete,
}: Props) {
  const gen = useClientGeneration();
  const startedRef = useRef(false);
  const completedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const extras = readExtrasChoice(extrasItems);
    try {
      sessionStorage.removeItem("pendingExtrasChoice");
    } catch {
      /* ignore */
    }

    const active = readActiveGenerationIds();
    const generationId = resumeSession?.generationId ?? active.generationId;
    const startedAt =
      resumeSession?.startedAt ??
      active.startedAt ??
      readOrderGenerationStartedAtForTask(taskId);

    // Продолжаем poll только если генерация уже создана (есть generationId).
    // Иначе после «Запустить генерацию» сработал бы resume без POST /api/generate.
    if (generationId) {
      const at = startedAt && startedAt > 0 ? startedAt : Date.now();
      void gen.resume({
        topic,
        pages,
        workType,
        generationId,
        startedAt: at,
        extrasItems: extras,
      });
      return;
    }

    void gen.run({
      topic,
      pages,
      workType,
      extrasItems: extras,
      taskId,
      structure: loadPreviewStructureForTask(taskId) ?? undefined,
      isPublic: loadPublicChoiceForTask(taskId),
      onGenerationId: (genId, at) => {
        patchOrderGenSession(taskId, { generationId: genId, startedAt: at, phase: "generating" });
        markOrderGenerationStartedForTask(taskId, at);
        void fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" }).catch(() => {});
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (completedRef.current) return;
    if (!gen.result || gen.loading || gen.extrasGenerating) return;
    completedRef.current = true;
    patchOrderGenSession(taskId, { phase: "done" });
    onComplete?.();
  }, [gen.result, gen.loading, gen.extrasGenerating, taskId, onComplete]);

  const steps = getProgressSteps(gen.workType || workType);
  const hasExtras = extrasItems.length > 0;
  const currentLabel = gen.backendStageLabel || steps[gen.stepIndex]?.label || "Готовим…";
  const pct = Math.round(gen.totalProgress);

  return (
    <div className={styles.genAside}>
      <div className={styles.genProgressCard}>
            <div className={styles.genProgressHead}>
              <span className={styles.genProgressBadge}>{workType}</span>
              <span className={styles.genProgressPct}>{pct}%</span>
            </div>

            <p className={styles.genProgressTopic} title={topic}>
              «{topic}»
            </p>

            <div className={styles.genProgressTrack} aria-hidden>
              <div
                className={styles.genProgressFill}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>

            <ul className={styles.genStepList} aria-label="Этапы генерации">
              {steps.map((step, i) => {
                const state =
                  i < gen.stepIndex ? "done" : i === gen.stepIndex ? "active" : "pending";
                return (
                  <li
                    key={step.label}
                    className={`${styles.genStepItem} ${styles[`genStepItem_${state}`]}`}
                  >
                    <span className={styles.genStepDot} aria-hidden />
                    <span className={styles.genStepText}>{step.label}</span>
                  </li>
                );
              })}
            </ul>

            <p className={styles.genProgressStatus}>
              {currentLabel}
              {gen.loading ? <span className={styles.genProgressDots}>{gen.dots}</span> : null}
            </p>

            {gen.etaSeconds != null && gen.loading && pct < 97 ? (
              <p className={styles.genProgressEta}>Осталось {formatEta(gen.etaSeconds)}</p>
            ) : null}

            <p className={styles.genProgressHint}>
              Можно обновить вкладку — прогресс считается по времени с момента старта
            </p>
          </div>

          {gen.error ? (
            <div className={styles.genError}>
              <p>{gen.error}</p>
              <Link href="/dashboard" className={styles.genDashLink}>
                Перейти в «Мои работы»
              </Link>
            </div>
          ) : null}

          {hasExtras && gen.extrasGenerating ? (
            <div className={styles.extrasProgress}>
              <p className={styles.extrasProgressTitle}>Дополнительные материалы</p>
              <div className={styles.extrasProgressBar}>
                <div
                  className={styles.extrasProgressFill}
                  style={{ width: `${gen.extrasProgress}%` }}
                />
              </div>
              <p className={styles.extrasProgressLabel}>
                {extrasProgressLabel(extrasItems)}
              </p>
            </div>
          ) : null}

          {gen.extrasError ? <p className={styles.extrasError}>{gen.extrasError}</p> : null}
    </div>
  );
}
