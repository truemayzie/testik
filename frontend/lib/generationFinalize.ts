/**
 * Серверная финализация генерации: опрос backend → запись в БД → уведомления.
 * Используется /api/generate/poll и фоновым reconciler.
 */

import { activeJobs } from "@/app/lib/activeJobs";
import { finalizeRunningGeneration, saveGeneration, type ReferatResult } from "@/lib/db";
import { sendEmail, generationReadyHtml } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { tgNotify } from "@/lib/tgNotify";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

export type FinalizeOutcome =
  | { status: "done"; id: string; slug: string | null; result?: ReferatResult }
  | { status: "running"; progress?: unknown }
  | { status: "error"; error: string }
  | { status: "not_found" };

export function parseJobIdFromExtras(extras: string | null | undefined): string {
  if (!extras) return "";
  try {
    const e = JSON.parse(extras) as { _jobId?: string };
    return typeof e._jobId === "string" ? e._jobId : "";
  } catch {
    return "";
  }
}

export async function discardBackendJob(jobId: string) {
  try {
    await fetch(`${BACKEND_URL}/api/generate/job/${jobId}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(5_000),
    });
  } catch (e) {
    console.warn("[generation/finalize] discard job failed", { jobId, e });
  }
}

async function revertPayment(paymentId: string | null | undefined) {
  if (!paymentId) return;
  try {
    await prisma.payment.update({ where: { id: paymentId }, data: { usedAt: null } });
  } catch {
    /* noop */
  }
}

export async function finalizeGenerationFromJob(params: {
  userId: string;
  jobId: string;
  generationId?: string;
  topic: string;
  pages: number;
  workType: string;
  userEmail?: string | null;
  paymentId?: string | null;
  notify?: boolean;
  source?: "poll" | "reconciler";
}): Promise<FinalizeOutcome> {
  const notify = params.notify !== false;
  const source = params.source ?? "poll";

  try {
    const statusRes = await fetch(`${BACKEND_URL}/api/generate/status/${params.jobId}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!statusRes.ok) {
      return { status: "running" };
    }

    const body = (await statusRes.json()) as {
      status?: string;
      error?: string;
      progress?: unknown;
    };

    if (body.status === "not_found") {
      return { status: "not_found" };
    }
    if (body.status === "error") {
      await revertPayment(params.paymentId);
      activeJobs.clear(params.userId);
      return { status: "error", error: body.error || "Ошибка генерации" };
    }
    if (body.status === "running") {
      return { status: "running", progress: body.progress };
    }
    if (body.status !== "done") {
      return { status: "running", progress: body.progress };
    }

    const resultRes = await fetch(`${BACKEND_URL}/api/generate/result/${params.jobId}`, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!resultRes.ok) {
      console.error("[generation/finalize] result fetch failed", {
        source,
        jobId: params.jobId,
        status: resultRes.status,
      });
      return { status: "running", progress: body.progress };
    }

    const data = (await resultRes.json()) as ReferatResult & { _cost_usd?: number };

    let genId: string;
    let slug: string | null;

    if (params.generationId) {
      const saved = await finalizeRunningGeneration({
        id: params.generationId,
        userId: params.userId,
        result: data,
      });
      if (!saved) {
        console.error("[generation/finalize] finalize returned null", {
          source,
          jobId: params.jobId,
          generationId: params.generationId,
        });
        if (notify) {
          tgNotify(
            `⚠️ <b>Не сохранился результат</b> (${source})\njob: ${params.jobId}\ngen: ${params.generationId}\n📄 ${params.workType}: «${params.topic}»`
          );
        }
        return {
          status: "error",
          error: "Не удалось сохранить работу. Попробуйте «Проверить» ещё раз.",
        };
      }
      genId = saved.id;
      slug = saved.slug;
    } else {
      const savedFallback = await saveGeneration(
        params.userId,
        params.topic,
        params.pages,
        params.workType,
        data
      );
      genId = savedFallback.id;
      slug = savedFallback.slug;
    }

    await discardBackendJob(params.jobId);
    activeJobs.clear(params.userId);

    console.info("[generation/finalize] job finalized", {
      source,
      userId: params.userId,
      jobId: params.jobId,
      generationId: genId,
    });

    if (notify) {
      const user = await prisma.user.findUnique({
        where: { id: params.userId },
        select: { fullName: true },
      });
      const costStr =
        data._cost_usd != null ? `\n💰 Стоимость: $${data._cost_usd.toFixed(4)}` : "";
      const autoTag = source === "reconciler" ? " (авто)" : "";
      tgNotify(
        `✅ <b>Генерация завершена</b>${autoTag}\n👤 ${user?.fullName || params.userId}\n📄 ${params.workType}: «${params.topic}»${costStr}`
      );

      if (params.userEmail) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ref-ai.ru";
        sendEmail(
          params.userEmail,
          `Ваша работа готова: ${params.topic}`,
          generationReadyHtml(params.topic, params.workType, genId, appUrl)
        ).catch(() => {});
      }
    }

    return { status: "done", id: genId, slug, result: data };
  } catch (err) {
    console.error("[generation/finalize] error — job kept on backend", {
      source,
      jobId: params.jobId,
      generationId: params.generationId,
      err,
    });
    if (notify) {
      tgNotify(
        `⚠️ <b>Ошибка finalize</b> (${source})\njob: ${params.jobId}\n📄 ${params.workType}: «${params.topic}»`
      );
    }
    return { status: "error", error: "Ошибка сохранения. Попробуйте «Проверить» ещё раз." };
  }
}
