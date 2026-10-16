/**
 * generationResubmit.ts — автоматическое пересоздание задания на backend.
 *
 * «Железный» инструмент: если backend потерял job (рестарт без jobstore,
 * сбой диска) или генерация была прервана рестартом — фронтенд молча
 * пересоздаёт задачу с теми же параметрами. Благодаря checkpoint на backend
 * генерация продолжается с места сбоя, а не с нуля.
 *
 * Оплата при этом НЕ списывается повторно: платёж уже claimed,
 * новый POST /api/generate (Next.js) не вызывается — идём напрямую в backend.
 */

import { activeJobs } from "@/app/lib/activeJobs";
import { prisma } from "@/lib/prisma";
import { tgNotify } from "@/lib/tgNotify";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

/** Максимум автопересозданий на одну Generation (защита от цикла сбоев). */
export const RESUBMIT_MAX = 2;

/**
 * Ошибки, при которых пересоздание безопасно и полезно:
 * - «прервана» — рестарт backend (jobstore пометил running как error);
 * - «зависла» — watchdog прибил зависший поток.
 * Реальные ошибки API (после 5 ретраев в ask()) не ретраим — экономия денег.
 */
const RESUMABLE_ERROR_RE = /прервана|зависла/i;

export function isResumableError(error: string): boolean {
  return RESUMABLE_ERROR_RE.test(error);
}

export async function resubmitBackendJob(params: {
  userId: string;
  topic: string;
  pages: number;
  workType: string;
}): Promise<string | null> {
  try {
    // Профиль нужен backend для титульника — берём актуальный из БД.
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: {
        fullName: true, university: true, faculty: true,
        department: true, speciality: true, discipline: true,
        course: true, groupNumber: true, teacherName: true, city: true,
      },
    });

    const res = await fetch(`${BACKEND_URL}/api/generate/referat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: params.topic,
        pages: params.pages,
        work_type: params.workType,
        profile: user ?? {},
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const { jobId } = (await res.json()) as { jobId?: string };
    return typeof jobId === "string" && jobId ? jobId : null;
  } catch (e) {
    console.error("[generation/resubmit] failed", { userId: params.userId, e });
    return null;
  }
}

/** Читает счётчик прошлых пересозданий из extras Generation. */
export async function readResubmitCount(generationId: string | undefined): Promise<number> {
  if (!generationId) return 0;
  const gen = await prisma.generation.findUnique({
    where: { id: generationId },
    select: { extras: true },
  });
  try {
    const e = gen?.extras ? (JSON.parse(gen.extras) as Record<string, unknown>) : {};
    return typeof e._resubmits === "number" ? e._resubmits : 0;
  } catch {
    return 0;
  }
}

/** Записывает новый jobId и счётчик в extras Generation + обновляет activeJobs. */
export async function applyResubmit(params: {
  userId: string;
  generationId?: string;
  newJobId: string;
  resubmits: number;
  topic: string;
  pages: number;
  workType: string;
  paymentId?: string | null;
  source: string;
}): Promise<void> {
  if (params.generationId) {
    const gen = await prisma.generation.findUnique({
      where: { id: params.generationId },
      select: { extras: true },
    });
    let extras: Record<string, unknown> = {};
    try {
      if (gen?.extras) extras = JSON.parse(gen.extras) as Record<string, unknown>;
    } catch {
      /* noop */
    }
    extras._jobId = params.newJobId;
    extras._resubmits = params.resubmits;
    await prisma.generation.update({
      where: { id: params.generationId },
      data: { extras: JSON.stringify(extras) },
    });
  }

  const memJob = activeJobs.get(params.userId);
  activeJobs.set(params.userId, {
    jobId: params.newJobId,
    generationId: params.generationId ?? memJob?.generationId,
    topic: params.topic,
    pages: params.pages,
    workType: params.workType,
    paymentId: params.paymentId ?? memJob?.paymentId ?? null,
  });

  console.info("[generation/resubmit] job resubmitted", {
    source: params.source,
    userId: params.userId,
    newJobId: params.newJobId,
    attempt: params.resubmits,
  });
  tgNotify(
    `🔁 <b>Автовозобновление генерации</b> (${params.source}, попытка ${params.resubmits})\n📄 ${params.workType}: «${params.topic}»`
  );
}
