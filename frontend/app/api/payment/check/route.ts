import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const workType = searchParams.get("workType") || "Реферат";

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ hasPaid: false });

  const payment = await prisma.payment.findFirst({
    where: {
      userId: user.id,
      workType,
      status: "succeeded",
      usedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    hasPaid: !!payment,
    paymentId: payment?.id ?? null,
  });
}
