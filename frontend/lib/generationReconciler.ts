/**
 * Фоновый дожим: Generation со status=running → completed,
 * если backend уже завершил job (пользователь закрыл вкладку / poll оборвался).
 */

import {
  finalizeGenerationFromJob,
  parseJobIdFromExtras,
} from "@/lib/generationFinalize";
import { prisma } from "@/lib/prisma";

const INTERVAL_MS = Number(process.env.GENERATION_RECONCILE_INTERVAL_MS) || 30_000;
/** После этого времени running + backend not_found → status failed (рестарт backend). */
const ORPHAN_AFTER_MS = Number(process.env.GENERATION_ORPHAN_AFTER_MS) || 90 * 60 * 1000;
const MAX_PER_TICK = 8;

let started = false;
let ticking = false;

async function markGenerationFailed(id: string, reason: string) {
  const gen = await prisma.generation.findUnique({
    where: { id },
    select: { extras: true },
  });
  let extras: Record<string, unknown> = {};
  try {
    if (gen?.extras) extras = JSON.parse(gen.extras) as Record<string, unknown>;
  } catch {
    /* noop */
  }
  delete extras._jobId;
  extras._failedReason = reason;
  await prisma.generation.update({
    where: { id },
    data: {
      status: "failed",
      extras: JSON.stringify(extras),
    },
  });
  console.warn("[generation/reconcile] marked failed", { id, reason });
}

export async function runGenerationReconcile(): Promise<{ processed: number; finalized: number }> {
  if (ticking) return { processed: 0, finalized: 0 };
  ticking = true;

  let processed = 0;
  let finalized = 0;

  try {
    const rows = await prisma.generation.findMany({
      where: { status: "running" },
      orderBy: { createdAt: "asc" },
      take: 32,
      select: {
        id: true,
        userId: true,
        topic: true,
        pages: true,
        workType: true,
        extras: true,
        createdAt: true,
        user: { select: { email: true } },
      },
    });

    const now = Date.now();

    for (const row of rows) {
      if (processed >= MAX_PER_TICK) break;
      processed++;

      const jobId = parseJobIdFromExtras(row.extras);
      const ageMs = now - row.createdAt.getTime();

      if (!jobId) {
        if (ageMs > ORPHAN_AFTER_MS) {
          await markGenerationFailed(row.id, "Потерян jobId (перезапуск сервера?)");
        }
        continue;
      }

      const outcome = await finalizeGenerationFromJob({
        userId: row.userId,
        jobId,
        generationId: row.id,
        topic: row.topic,
        pages: row.pages,
        workType: row.workType,
        userEmail: row.user.email,
        notify: true,
        source: "reconciler",
      });

      if (outcome.status === "done") {
        finalized++;
        continue;
      }

      if (outcome.status === "not_found" && ageMs > ORPHAN_AFTER_MS) {
        await markGenerationFailed(
          row.id,
          "Задание не найдено на сервере (возможен рестарт backend). Обратитесь в поддержку."
        );
        continue;
      }

      if (outcome.status === "error" && ageMs > ORPHAN_AFTER_MS) {
        await markGenerationFailed(row.id, outcome.error);
      }
    }
  } catch (err) {
    console.error("[generation/reconcile] tick error", err);
  } finally {
    ticking = false;
  }

  if (finalized > 0) {
    console.info("[generation/reconcile] tick done", { processed, finalized });
  }

  return { processed, finalized };
}

/** Запускает периодический reconciler (один раз на процесс Node). */
export function startGenerationReconciler() {
  if (started) return;
  if (process.env.GENERATION_RECONCILE_DISABLED === "1") {
    console.info("[generation/reconcile] disabled by env");
    return;
  }

  started = true;
  const intervalMs = INTERVAL_MS;

  console.info("[generation/reconcile] started", { intervalMs });

  // Первый проход сразу после старта (подхватит «зависшие» после деплоя).
  void runGenerationReconcile();

  const timer = setInterval(() => {
    void runGenerationReconcile();
  }, intervalMs);

  if (typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }
}
