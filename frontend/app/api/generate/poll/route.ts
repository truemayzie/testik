import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { activeJobs } from "@/app/lib/activeJobs";
import {
  finalizeGenerationFromJob,
  parseJobIdFromExtras,
} from "@/lib/generationFinalize";

export const dynamic = "force-dynamic";

async function revertPayment(paymentId: string | null | undefined) {
  if (!paymentId) return;
  try {
    await prisma.payment.update({ where: { id: paymentId }, data: { usedAt: null } });
  } catch {
    /* noop */
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | null)?.id;
  if (!userId) {
    console.warn("[generate/poll] unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const workType = searchParams.get("workType") || "";
  const startedAt = parseInt(searchParams.get("startedAt") || "0", 10);
  const includeResult = searchParams.get("includeResult") === "1";
  const generationId = searchParams.get("generationId") || "";
  const userEmail = (session?.user as { email?: string } | null)?.email;

  if (generationId) {
    const gen = await prisma.generation.findFirst({
      where: { id: generationId, userId },
      select: {
        id: true,
        slug: true,
        status: true,
        extras: true,
        topic: true,
        pages: true,
        workType: true,
      },
    });
    if (!gen) return NextResponse.json({ status: "not_found" }, { status: 404 });
    if (gen.status === "completed") {
      if (includeResult) {
        const full = await prisma.generation.findFirst({
          where: { id: gen.id, userId },
          select: { result: true },
        });
        let result: unknown;
        if (full?.result) {
          try {
            result = JSON.parse(full.result);
          } catch {
            result = undefined;
          }
        }
        return NextResponse.json({
          status: "done",
          slug: gen.slug,
          id: gen.id,
          ...(result ? { result } : {}),
        });
      }
      return NextResponse.json({ status: "done", slug: gen.slug, id: gen.id });
    }
    if (gen.status === "failed") {
      return NextResponse.json({
        status: "error",
        error: "Генерация не завершилась. Напишите в поддержку или запустите снова.",
      });
    }

    const jobIdFromDb = parseJobIdFromExtras(gen.extras);
    if (!jobIdFromDb) {
      return NextResponse.json({ status: "running" });
    }

    const outcome = await finalizeGenerationFromJob({
      userId,
      jobId: jobIdFromDb,
      generationId: gen.id,
      topic: gen.topic,
      pages: gen.pages,
      workType: gen.workType,
      userEmail,
      source: "poll",
    });

    if (outcome.status === "done") {
      return NextResponse.json(
        includeResult
          ? {
              status: "done",
              slug: outcome.slug,
              id: outcome.id,
              result: outcome.result,
            }
          : { status: "done", slug: outcome.slug, id: outcome.id }
      );
    }
    if (outcome.status === "error") {
      return NextResponse.json({ status: "error", error: outcome.error });
    }
    if (outcome.status === "not_found") {
      // Resubmit внутри finalize уже пересоздал задачу (или лимит исчерпан).
      // Не показываем ошибку — поллинг продолжится, reconciler додожмёт.
      return NextResponse.json({
        status: "running",
        progress: { label: "Возобновляем генерацию после сбоя" },
      });
    }
    return NextResponse.json({ status: "running", progress: outcome.progress });
  }

  if (workType && startedAt > 0) {
    const saved = await prisma.generation.findFirst({
      where: {
        userId,
        workType,
        status: "completed",
        createdAt: { gte: new Date(startedAt) },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, slug: true },
    });
    if (saved) {
      console.info("[generate/poll] result found in db", { userId, generationId: saved.id });
      return NextResponse.json({ status: "done", slug: saved.slug, id: saved.id });
    }
  }

  const job = activeJobs.get(userId);
  if (!job) {
    console.info("[generate/poll] idle", { userId });
    return NextResponse.json({ status: "idle" });
  }

  const outcome = await finalizeGenerationFromJob({
    userId,
    jobId: job.jobId,
    generationId: job.generationId,
    topic: job.topic,
    pages: job.pages,
    workType: job.workType,
    userEmail,
    paymentId: job.paymentId,
    source: "poll",
  });

  if (outcome.status === "done") {
    return NextResponse.json(
      includeResult
        ? {
            status: "done",
            slug: outcome.slug,
            id: outcome.id,
            result: outcome.result,
          }
        : { status: "done", slug: outcome.slug, id: outcome.id }
    );
  }
  if (outcome.status === "error") {
    await revertPayment(job.paymentId);
    activeJobs.clear(userId);
    return NextResponse.json({ status: "error", error: outcome.error });
  }
  if (outcome.status === "not_found") {
    // Resubmit внутри finalize пересоздал задачу с новым jobId
    // (activeJobs уже обновлён) — продолжаем поллинг, платёж не трогаем.
    return NextResponse.json({
      status: "running",
      progress: { label: "Возобновляем генерацию после сбоя" },
    });
  }

  return NextResponse.json({ status: "running", progress: outcome.progress });
}
