import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const EXTRAS_JOB_TTL_MS = 24 * 60 * 60 * 1000; // 24 часа

export async function GET(
  _request: NextRequest,
  { params }: { params: { extrasJobId: string } },
) {
  await prisma.extrasJob.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - EXTRAS_JOB_TTL_MS) } },
  });

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | null)?.id;
  if (!userId) {
    console.warn("[extras/status] unauthorized request", { extrasJobId: params.extrasJobId });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const job = await prisma.extrasJob.findUnique({ where: { id: params.extrasJobId } });
  if (!job || job.userId !== userId) {
    console.warn("[extras/status] forbidden request", { userId, extrasJobId: params.extrasJobId });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/generate/extras/status/${params.extrasJobId}`,
      { signal: AbortSignal.timeout(10_000), cache: "no-store" },
    );
    if (!res.ok) return NextResponse.json({ status: "error", ready: [] });
    const data = await res.json();
    if (data.status === "done") {
      console.info("[extras/status] job done", { userId, extrasJobId: params.extrasJobId });
    } else if (data.status === "error") {
      console.error("[extras/status] job error", { userId, extrasJobId: params.extrasJobId, error: data.error });
    }
    if (data.status === "done" || data.status === "error" || data.status === "not_found") {
      await prisma.extrasJob.delete({ where: { id: params.extrasJobId } }).catch(() => {});
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch {
    return NextResponse.json({ status: "error", ready: [] });
  }
}
