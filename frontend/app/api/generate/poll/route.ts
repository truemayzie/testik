import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { activeJobs } from "@/app/lib/activeJobs";
import { finalizeRunningGeneration, saveGeneration } from "@/lib/db";
import type { ReferatResult } from "@/lib/db";
import { sendEmail, generationReadyHtml } from "@/lib/email";
import { tgNotify } from "@/lib/tgNotify";

export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

async function revertPayment(paymentId: string | null | undefined) {
  if (!paymentId) return;
  try {
    await prisma.payment.update({ where: { id: paymentId }, data: { usedAt: null } });
  } catch {}
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | null)?.id;
  if (!userId) {
    console.warn("[generate/poll] unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const workType  = searchParams.get("workType") || "";
  const startedAt = parseInt(searchParams.get("startedAt") || "0", 10);
  const includeResult = searchParams.get("includeResult") === "1";
  const generationId = searchParams.get("generationId") || "";

  // 1) Если пришёл generationId — работаем от БД (переживает F5/закрытие вкладки)
  if (generationId) {
    const gen = await prisma.generation.findFirst({
      where: { id: generationId, userId },
      select: { id: true, slug: true, status: true, extras: true, topic: true, pages: true, workType: true },
    });
    if (!gen) return NextResponse.json({ status: "not_found" }, { status: 404 });
    if (gen.status === "completed") {
      return NextResponse.json({ status: "done", slug: gen.slug, id: gen.id });
    }
    // Извлекаем jobId из extras._jobId
    let jobIdFromDb = "";
    try {
      const e = gen.extras ? (JSON.parse(gen.extras) as { _jobId?: string }) : null;
      if (e?._jobId) jobIdFromDb = e._jobId;
    } catch {}
    if (!jobIdFromDb) {
      return NextResponse.json({ status: "running" });
    }
    return await pollAndMaybeFinalize({
      userId,
      jobId: jobIdFromDb,
      includeResult,
      paymentId: undefined,
      workType: gen.workType,
      topic: gen.topic,
      pages: gen.pages,
      generationId: gen.id,
      userEmail: (session?.user as { email?: string } | null)?.email,
    });
  }

  // 2) Сначала проверяем БД — возможно генерация уже завершилась и сохранилась
  if (workType && startedAt > 0) {
    const saved = await prisma.generation.findFirst({
      where: { userId, workType, status: "completed", createdAt: { gte: new Date(startedAt) } },
      orderBy: { createdAt: "desc" },
      select: { id: true, slug: true },
    });
    if (saved) {
      console.info("[generate/poll] result found in db", { userId, generationId: saved.id });
      return NextResponse.json({ status: "done", slug: saved.slug, id: saved.id });
    }
  }

  // 3. Проверяем активное задание в памяти
  const job = activeJobs.get(userId);
  if (!job) {
    console.info("[generate/poll] idle", { userId });
    // Нет активного задания и нет результата в БД
    return NextResponse.json({ status: "idle" });
  }

  return await pollAndMaybeFinalize({
    userId,
    jobId: job.jobId,
    includeResult,
    paymentId: job.paymentId,
    workType: job.workType,
    topic: job.topic,
    pages: job.pages,
    generationId: job.generationId,
    userEmail: (session?.user as { email?: string } | null)?.email,
  });
}

async function pollAndMaybeFinalize(params: {
  userId: string;
  jobId: string;
  includeResult: boolean;
  paymentId?: string | null;
  workType: string;
  topic: string;
  pages: number;
  generationId?: string;
  userEmail?: string;
}) {
  // Опрашиваем FastAPI о статусе задания
  try {
    const statusRes = await fetch(
      `${BACKEND_URL}/api/generate/status/${params.jobId}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!statusRes.ok) {
      return NextResponse.json({ status: "running" });
    }
    const { status, error, progress } = await statusRes.json();

    if (status === "not_found") {
      console.warn("[generate/poll] backend job not found", { userId: params.userId, jobId: params.jobId });
      await revertPayment(params.paymentId);
      activeJobs.clear(params.userId);
      return NextResponse.json({ status: "not_found" });
    }
    if (status === "error") {
      console.error("[generate/poll] backend job error", { userId: params.userId, jobId: params.jobId, error });
      await revertPayment(params.paymentId);
      activeJobs.clear(params.userId);
      return NextResponse.json({ status: "error", error });
    }
    if (status === "done") {
      try {
        const resultRes = await fetch(
          `${BACKEND_URL}/api/generate/result/${params.jobId}`,
          { signal: AbortSignal.timeout(30_000) }
        );
        if (!resultRes.ok) {
          return NextResponse.json({ status: "running", progress });
        }
        const data = await resultRes.json() as ReferatResult & { _cost_usd?: number };

        const saved =
          params.generationId
            ? await finalizeRunningGeneration({ id: params.generationId, userId: params.userId, result: data })
            : null;
        const savedFallback =
          saved ? saved : await saveGeneration(params.userId, params.topic, params.pages, params.workType, data);
        const genId = "id" in savedFallback ? savedFallback.id : (savedFallback as { id: string }).id;
        const slug = "slug" in savedFallback ? savedFallback.slug : (savedFallback as { slug: string | null }).slug;

        console.info("[generate/poll] job finalized", { userId: params.userId, jobId: params.jobId, generationId: genId });

        const user = await prisma.user.findUnique({
          where: { id: params.userId },
          select: { id: true, fullName: true },
        });
        const costStr = data._cost_usd != null ? `\n💰 Стоимость: $${data._cost_usd.toFixed(4)}` : "";
        tgNotify(`✅ <b>Генерация завершена</b>\n👤 ${(user?.fullName || params.userId)}\n📄 ${params.workType}: «${params.topic}»${costStr}`);

        if (params.userEmail) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ref-ai.ru";
          sendEmail(
            params.userEmail,
            `Ваша работа готова: ${params.topic}`,
            generationReadyHtml(params.topic, params.workType, genId, appUrl)
          ).catch(() => {});
        }

        activeJobs.clear(params.userId);
        return NextResponse.json(
          params.includeResult
            ? { status: "done", slug, id: genId, result: data }
            : { status: "done", slug, id: genId }
        );
      } catch (err) {
        console.error("[generate/poll] finalize error", { userId: params.userId, jobId: params.jobId, err });
        return NextResponse.json({ status: "running" });
      }
    }
    // "running"
    return NextResponse.json({ status: "running", progress });
  } catch {
    return NextResponse.json({ status: "running" });
  }
}
