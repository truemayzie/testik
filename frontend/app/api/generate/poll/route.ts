import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { activeJobs } from "@/app/lib/activeJobs";
import { saveGeneration } from "@/lib/db";
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const workType  = searchParams.get("workType") || "";
  const startedAt = parseInt(searchParams.get("startedAt") || "0", 10);
  const includeResult = searchParams.get("includeResult") === "1";

  // 1. Сначала проверяем БД — возможно генерация уже завершилась и сохранилась
  if (workType && startedAt > 0) {
    const saved = await prisma.generation.findFirst({
      where: {
        userId,
        workType,
        createdAt: { gte: new Date(startedAt) },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, slug: true },
    });
    if (saved) {
      return NextResponse.json({ status: "done", slug: saved.slug, id: saved.id });
    }
  }

  // 2. Проверяем активное задание в памяти
  const job = activeJobs.get(userId);
  if (!job) {
    // Нет активного задания и нет результата в БД
    return NextResponse.json({ status: "idle" });
  }

  // 3. Опрашиваем FastAPI о статусе задания
  try {
    const statusRes = await fetch(
      `${BACKEND_URL}/api/generate/status/${job.jobId}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!statusRes.ok) {
      return NextResponse.json({ status: "running" });
    }
    const { status, error } = await statusRes.json();

    if (status === "not_found") {
      await revertPayment(job.paymentId);
      activeJobs.clear(userId);
      return NextResponse.json({ status: "not_found" });
    }
    if (status === "error") {
      await revertPayment(job.paymentId);
      activeJobs.clear(userId);
      return NextResponse.json({ status: "error", error });
    }
    if (status === "done") {
      try {
        const resultRes = await fetch(
          `${BACKEND_URL}/api/generate/result/${job.jobId}`,
          { signal: AbortSignal.timeout(30_000) }
        );
        if (!resultRes.ok) {
          return NextResponse.json({ status: "running" });
        }
        const data = await resultRes.json() as ReferatResult & { _cost_usd?: number };
        const saved = await saveGeneration(userId, job.topic, job.pages, job.workType, data);

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, fullName: true },
        });
        const costStr = data._cost_usd != null ? `\n💰 Стоимость: $${data._cost_usd.toFixed(4)}` : "";
        tgNotify(`✅ <b>Генерация завершена</b>\n👤 ${(user?.fullName || userId)}\n📄 ${job.workType}: «${job.topic}»${costStr}`);

        const userEmail = (session?.user as { email?: string } | null)?.email;
        if (userEmail) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ref-ai.ru";
          sendEmail(
            userEmail,
            `Ваша работа готова: ${job.topic}`,
            generationReadyHtml(job.topic, job.workType, saved.id, appUrl)
          ).catch(() => {});
        }

        activeJobs.clear(userId);
        return NextResponse.json(
          includeResult
            ? { status: "done", slug: saved.slug, id: saved.id, result: data }
            : { status: "done", slug: saved.slug, id: saved.id }
        );
      } catch {
        return NextResponse.json({ status: "running" });
      }
    }
    // "running"
    return NextResponse.json({ status: "running" });
  } catch {
    return NextResponse.json({ status: "running" });
  }
}
