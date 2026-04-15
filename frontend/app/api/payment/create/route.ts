import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WORK_PRICES, EXTRAS_PRICES } from "@/lib/prices";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const sessionUserId = (session?.user as { id?: string } | null)?.id;
  if (!session?.user || !sessionUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workType, extras, method } = await request.json() as {
    workType: string;
    extras?: string[];
    method?: "sbp" | "card";
  };
  const priceInfo = WORK_PRICES[workType];
  if (!priceInfo) {
    return NextResponse.json({ error: "Неизвестный тип работы" }, { status: 400 });
  }
  const extrasAmount = (extras ?? []).reduce((sum, item) => sum + (EXTRAS_PRICES[item] ?? 0), 0);
  const totalAmount = priceInfo.price + extrasAmount;

  const user = await prisma.user.findUnique({
    where: { id: sessionUserId },
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
        amount: totalAmount,
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
  const extrasDesc = (extras ?? []).map(i => i === "presentation" ? "+ Презентация" : "+ Текст выступления").join(" ");

  const isSbp = method === "sbp";

  const yokassaRes = await fetch("https://api.yookassa.ru/v3/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${credentials}`,
      "Idempotence-Key": idempotenceKey,
    },
    body: JSON.stringify({
      amount: { value: totalAmount.toFixed(2), currency: "RUB" },
      capture: true,
      ...(isSbp ? { payment_method_data: { type: "sbp" } } : {}),
      confirmation: isSbp
        ? { type: "redirect", return_url: `${appUrl}/payment/success` }
        : { type: "embedded" },
      description: `Генерация: ${workType}${extrasDesc ? " " + extrasDesc : ""}`,
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
      amount: totalAmount,
      status: "pending",
      yokassaId: yokassaData.id,
    },
  });

  if (isSbp) {
    return NextResponse.json({
      confirmationUrl: yokassaData.confirmation.confirmation_url,
      yokassaPaymentId: yokassaData.id,
      paymentId: payment.id,
    });
  }

  return NextResponse.json({
    confirmationToken: yokassaData.confirmation.confirmation_token,
    paymentId: payment.id,
  });
}
