import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const EXTRAS_PRICES: Record<string, number> = {
  presentation: 199,
  speech: 149,
};

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const sessionUserId = (session?.user as { id?: string } | null)?.id;
  if (!session?.user || !sessionUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { items } = await request.json() as { items: string[] };
  if (!items?.length) {
    return NextResponse.json({ error: "No items selected" }, { status: 400 });
  }

  const amount = items.reduce((sum, item) => sum + (EXTRAS_PRICES[item] ?? 0), 0);
  if (amount === 0) {
    return NextResponse.json({ error: "Invalid items" }, { status: 400 });
  }

  const shopId    = process.env.YOKASSA_SHOP_ID;
  const secretKey = process.env.YOKASSA_SECRET_KEY;
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const workType  = `extras:${items.slice().sort().join("+")}`;

  // Dev mode — авто-успех
  if (!shopId || !secretKey) {
    const payment = await prisma.payment.create({
      data: {
        userId:    sessionUserId,
        workType,
        amount,
        status:    "succeeded",
        yokassaId: `dev_${crypto.randomUUID()}`,
      },
    });
    return NextResponse.json({ paymentId: payment.id, autoSucceed: true });
  }

  // ЮКасса
  const idempotenceKey = crypto.randomUUID();
  const credentials = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
  const desc = items.map(i => i === "presentation" ? "Презентация" : "Текст выступления").join(" + ");

  const yokassaRes = await fetch("https://api.yookassa.ru/v3/payments", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Basic ${credentials}`,
      "Idempotence-Key": idempotenceKey,
    },
    body: JSON.stringify({
      amount:       { value: amount.toFixed(2), currency: "RUB" },
      capture:      true,
      confirmation: { type: "redirect", return_url: `${appUrl}/payment/success?mode=extras` },
      description:  `Дополнительно: ${desc}`,
      metadata:     { userId: sessionUserId, workType },
    }),
  });

  if (!yokassaRes.ok) {
    const err = await yokassaRes.text();
    return NextResponse.json({ error: "Ошибка ЮКассы: " + err }, { status: 500 });
  }

  const yokassaData = await yokassaRes.json();
  const payment = await prisma.payment.create({
    data: {
      userId:    sessionUserId,
      workType,
      amount,
      status:    "pending",
      yokassaId: yokassaData.id,
    },
  });

  return NextResponse.json({
    paymentUrl:   yokassaData.confirmation.confirmation_url,
    paymentId:    payment.id,
    autoSucceed:  false,
  });
}
