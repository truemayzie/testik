import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — получить количество кредитов текущего пользователя
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { credits: true },
  });

  return NextResponse.json({ credits: user?.credits ?? 0 });
}

// POST — списать 1 кредит
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, credits: true },
  });

  if (!user || user.credits <= 0) {
    return NextResponse.json({ success: false, credits: 0 }, { status: 403 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { credits: { decrement: 1 } },
    select: { credits: true },
  });

  return NextResponse.json({ success: true, credits: updated.credits });
}
