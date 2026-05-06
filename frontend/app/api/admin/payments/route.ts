import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";

export async function GET() {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true, amount: true, status: true,
      workType: true, createdAt: true, yokassaId: true,
      provider: true,
      providerPaymentId: true,
      usedAt: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  const total = payments
    .filter(p => p.status === "succeeded")
    .reduce((s, p) => s + p.amount, 0);

  return NextResponse.json({ payments, total });
}
