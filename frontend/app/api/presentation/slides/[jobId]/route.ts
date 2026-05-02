import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

export async function GET(
  _request: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | null)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ownsJob = await prisma.generation.findFirst({
    where: {
      userId,
      extras: { contains: params.jobId },
    },
    select: { id: true },
  });
  if (!ownsJob) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/extras/presentation-json/${params.jobId}`,
      { signal: AbortSignal.timeout(15_000), cache: "no-store" },
    );
    if (!res.ok) {
      return NextResponse.json({ error: "нет JSON на сервере" }, { status: 404 });
    }
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch {
    return NextResponse.json({ error: "backend недоступен" }, { status: 503 });
  }
}
