import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tgNotify } from "@/lib/tgNotify";

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

      const topic = typeof body.topic === "string" ? body.topic : "—";
      const wt    = typeof body.work_type === "string" ? body.work_type : "—";
      const rawItems = Array.isArray(body.items) ? body.items : [];
      const itemLabels = rawItems.flatMap((x: unknown) => {
        if (x === "presentation") return ["презентация"];
        if (x === "speech") return ["текст выступления"];
        return [];
      });
      prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } }).then((u) => {
        const name = u?.fullName || userId;
        const line = itemLabels.length ? itemLabels.join(", ") : rawItems.join(", ");
        tgNotify(`🎞 <b>Дополнительные материалы</b> (старт)\n👤 ${name}\n📄 ${wt}: «${topic}»\n📎 ${line}`);
      }).catch(() => {
        tgNotify(`🎞 <b>Дополнительные материалы</b> (старт)\n👤 ${userId}\n📄 ${wt}: «${topic}»\n📎 ${rawItems}`);
      });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("[extras] Backend error:", err);
    return NextResponse.json({ error: "Backend недоступен" }, { status: 503 });
  }
}
