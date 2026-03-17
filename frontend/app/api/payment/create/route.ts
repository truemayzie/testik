import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WORK_PRICES } from "@/lib/prices";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workType } = await request.json();
  const priceInfo = WORK_PRICES[workType];
  if (!priceInfo) {
    return NextResponse.json({ error: "Неизвестный тип работы" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const shopId = process.env.YOKASSA_SHOP_ID;
  const secretKey = process.env.YOKASSA_SECRET_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Dev mode: no real YooKassa keys — auto-succeed
  if (!shopId || !secretKey) {
    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        workType,
        amount: priceInfo.price,
        status: "succeeded",
        yokassaId: `dev_${crypto.randomUUID()}`,
      },
    });
    return NextResponse.json({
      paymentUrl: `${appUrl}/payment/success`,
      paymentId: payment.id,
    });
  }

  // Real YooKassa
  const idempotenceKey = crypto.randomUUID();
  const credentials = Buffer.from(`${shopId}:${secretKey}`).toString("base64");

  const yokassaRes = await fetch("https://api.yookassa.ru/v3/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${credentials}`,
      "Idempotence-Key": idempotenceKey,
    },
    body: JSON.stringify({
      amount: { value: priceInfo.price.toFixed(2), currency: "RUB" },
      confirmation: {
        type: "redirect",
        return_url: `${appUrl}/payment/success`,
      },
      description: `Генерация: ${workType}`,
      metadata: { userId: user.id, workType },
    }),
  });

  if (!yokassaRes.ok) {
    const err = await yokassaRes.text();
    return NextResponse.json({ error: "Ошибка ЮКассы: " + err }, { status: 500 });
  }

  const yokassaData = await yokassaRes.json();

  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      workType,
      amount: priceInfo.price,
      status: "pending",
      yokassaId: yokassaData.id,
    },
  });

  return NextResponse.json({
    paymentUrl: yokassaData.confirmation.confirmation_url,
    paymentId: payment.id,
  });
}
