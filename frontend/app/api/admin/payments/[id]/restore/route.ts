import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payment = await prisma.payment.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, usedAt: true },
  });
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Возвращаем возможность повторной генерации: сбрасываем usedAt только для успешных платежей.
  if (payment.status !== "succeeded") {
    return NextResponse.json({ error: "Only succeeded payments can be restored" }, { status: 400 });
  }

  await prisma.payment.update({
    where: { id: params.id },
    data: { usedAt: null },
  });

  return NextResponse.json({ ok: true });
}

