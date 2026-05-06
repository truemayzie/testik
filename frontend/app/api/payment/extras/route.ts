import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const EXTRAS_PRICES: Record<string, number> = {
  presentation: 199,
  speech: 149,
};

function makeRoboInvoiceId(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
}

function getRobokassaPass1(isTest: boolean): string | undefined {
  if (isTest) {
    return process.env.ROBOKASSA_TEST_PASSWORD1 || process.env.ROBOKASSA_PASSWORD1;
  }
  return process.env.ROBOKASSA_PASSWORD1;
}

function md5(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex");
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const sessionUserId = (session?.user as { id?: string } | null)?.id;
  if (!session?.user || !sessionUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { items, market } = await request.json() as { items: string[]; market?: "ru" | "kz" };
  const effectiveMarket = market === "kz" ? "kz" : "ru";
  if (!items?.length) {
    return NextResponse.json({ error: "No items selected" }, { status: 400 });
  }

  const amount = items.reduce((sum, item) => sum + (EXTRAS_PRICES[item] ?? 0), 0);
  if (amount === 0) {
    return NextResponse.json({ error: "Invalid items" }, { status: 400 });
  }

  const shopId    = process.env.YOKASSA_SHOP_ID;
  const secretKey = process.env.YOKASSA_SECRET_KEY;
  const roboLogin = process.env.ROBOKASSA_MERCHANT_LOGIN;
  const roboTestMode = String(process.env.ROBOKASSA_TEST_MODE || "").toLowerCase() === "true";
  const roboPass1 = getRobokassaPass1(roboTestMode);
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const workType  = `extras:${items.slice().sort().join("+")}`;

  // Dev mode — авто-успех только когда оба провайдера не настроены
  if ((!shopId || !secretKey) && (!roboLogin || !roboPass1)) {
    const payment = await prisma.payment.create({
      data: {
        userId:    sessionUserId,
        workType,
        amount,
        status:    "succeeded",
        provider: "dev",
        providerPaymentId: `dev_${crypto.randomUUID()}`,
        yokassaId: `dev_${crypto.randomUUID()}`,
      },
    });
    return NextResponse.json({ paymentId: payment.id, autoSucceed: true });
  }

  const useRobokassa = effectiveMarket === "kz";
  const useYookassa = effectiveMarket === "ru";

  if (useRobokassa && (!roboLogin || !roboPass1)) {
    return NextResponse.json({ error: "Для KZ-платежей Robokassa не настроена (логин/пароль #1)" }, { status: 500 });
  }
  if (useYookassa && (!shopId || !secretKey)) {
    return NextResponse.json({ error: "Для RU-платежей ЮKassa не настроена" }, { status: 500 });
  }

  if (useRobokassa && roboLogin && roboPass1) {
    const invId = makeRoboInvoiceId();
    const payment = await prisma.payment.create({
      data: {
        userId: sessionUserId,
        workType,
        amount,
        status: "pending",
        provider: "robokassa",
        providerPaymentId: invId,
      },
    });

    const outSum = amount.toFixed(2);
    const signature = md5(`${roboLogin}:${outSum}:${invId}:${roboPass1}`);

    const params = new URLSearchParams({
      MerchantLogin: roboLogin,
      OutSum: outSum,
      InvId: invId,
      Description: "Dopolnitelno materialy",
      SignatureValue: signature,
      IsTest: roboTestMode ? "1" : "0",
      Culture: "ru",
    });
    const email = session?.user?.email;
    if (typeof email === "string" && email) {
      params.set("Email", email);
    }

    return NextResponse.json({
      paymentUrl: `https://auth.robokassa.ru/Merchant/Index.aspx?${params.toString()}`,
      paymentId: payment.id,
      autoSucceed: false,
      provider: "robokassa",
    });
  }

  // ЮКасса (RU)
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
      provider: "yookassa",
      providerPaymentId: yokassaData.id,
      yokassaId: yokassaData.id,
    },
  });

  return NextResponse.json({
    paymentUrl:   yokassaData.confirmation.confirmation_url,
    paymentId:    payment.id,
    autoSucceed:  false,
  });
}
