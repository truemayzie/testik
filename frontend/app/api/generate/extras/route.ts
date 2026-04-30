import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const EXTRAS_JOB_TTL_MS = 24 * 60 * 60 * 1000; // 24 часа

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | null)?.id;
  if (!session?.user || !userId) {
    console.warn("[extras] unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  try {
    // Мягкая очистка старых ownership-записей extras jobs.
    await prisma.extrasJob.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - EXTRAS_JOB_TTL_MS) } },
    });

    const res = await fetch(`${BACKEND_URL}/api/generate/extras`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const data = await res.json();
    if (typeof data?.extrasJobId === "string" && data.extrasJobId.length > 0) {
      await prisma.extrasJob.upsert({
        where: { id: data.extrasJobId },
        create: { id: data.extrasJobId, userId },
        update: { userId },
      });
      console.info("[extras] job started", { userId, extrasJobId: data.extrasJobId });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("[extras] Backend error:", err);
    return NextResponse.json({ error: "Backend недоступен" }, { status: 503 });
  }
}
