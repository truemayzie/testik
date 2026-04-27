import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const sessionUserId = (session?.user as { id?: string } | null)?.id;
  if (!session?.user || !sessionUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const yokassaPaymentId = searchParams.get("yokassaPaymentId");

  // Прямая проверка статуса конкретного платежа в ЮКассе (для поллинга СБП)
  if (yokassaPaymentId) {
    const shopId = process.env.YOKASSA_SHOP_ID;
    const secretKey = process.env.YOKASSA_SECRET_KEY;
    if (!shopId || !secretKey) {
      return NextResponse.json({ status: "pending" });
    }
    const credentials = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
    try {
      const res = await fetch(`https://api.yookassa.ru/v3/payments/${yokassaPaymentId}`, {
        headers: { "Authorization": `Basic ${credentials}` },
      });
      if (!res.ok) return NextResponse.json({ status: "pending" });
      const data = await res.json();
      if (data.status === "succeeded") {
        // Обновляем статус в нашей БД
        await prisma.payment.updateMany({
          where: { yokassaId: yokassaPaymentId },
          data: { status: "succeeded" },
        });
        return NextResponse.json({ status: "succeeded" });
      }
      if (data.status === "canceled") {
        return NextResponse.json({ status: "canceled" });
      }
      return NextResponse.json({ status: "pending" });
    } catch {
      return NextResponse.json({ status: "pending" });
    }
  }

  // Стандартная проверка: есть ли неиспользованный платёж для данного типа работы
  const workType = searchParams.get("workType") || "Реферат";

  const user = await prisma.user.findUnique({
    where: { id: sessionUserId },
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

  const devMode = !process.env.YOKASSA_SHOP_ID;

  return NextResponse.json({
    hasPaid: !!payment,
    paymentId: payment?.id ?? null,
    devMode,
  });
}
