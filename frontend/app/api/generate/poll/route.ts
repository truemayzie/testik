import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { activeJobs } from "@/app/lib/activeJobs";

export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | null)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const workType  = searchParams.get("workType") || "";
  const startedAt = parseInt(searchParams.get("startedAt") || "0", 10);

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
    const { status } = await statusRes.json();

    if (status === "not_found") {
      activeJobs.clear(userId);
      return NextResponse.json({ status: "not_found" });
    }
    if (status === "error") {
      activeJobs.clear(userId);
      return NextResponse.json({ status: "error" });
    }
    // "running" или "done" (до следующего poll успеет сохраниться)
    return NextResponse.json({ status: "running" });
  } catch {
    return NextResponse.json({ status: "running" });
  }
}
