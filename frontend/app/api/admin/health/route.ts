import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runHealthCheck } from "@/app/lib/healthMonitor";

export const dynamic = "force-dynamic";

async function assertAdmin() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | null)?.role;
  if (role !== "admin") return null;
  return session;
}

export async function GET() {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const checks = await prisma.healthCheck.findMany({
    orderBy: { checkedAt: "desc" },
    take: 20,
  });

  return NextResponse.json(checks);
}

export async function POST(request: NextRequest) {
  void request;
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await runHealthCheck();

  const latest = await prisma.healthCheck.findFirst({
    orderBy: { checkedAt: "desc" },
  });

  return NextResponse.json(latest);
}
