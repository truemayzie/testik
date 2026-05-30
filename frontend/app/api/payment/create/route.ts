import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WORK_PRICES, EXTRAS_PRICES } from "@/lib/prices";
import {
  applyFirstOrderDiscount,
  isFirstOrderDiscountEligible,
} from "@/lib/firstOrderDiscount";
import crypto from "crypto";
import { reconcileUserWorkTypePayments } from "@/lib/yookassa";

type Market = "ru" | "kz";
function makeRoboInvoiceId(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
}

function md5(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex");
}

function getRobokassaPass1(isTest: boolean): string | undefined {
  if (isTest) {
    return process.env.ROBOKASSA_TEST_PASSWORD1 || process.env.ROBOKASSA_PASSWORD1;
  }
  return process.env.ROBOKASSA_PASSWORD1;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const sessionUserId = (session?.user as { id?: string } | null)?.id;
  if (!session?.user || !sessionUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workType, extras, method, market, taskId } = await request.json() as {
    workType: string;
    extras?: string[];
    method?: "sbp" | "card";
    market?: "ru" | "kz";
    taskId?: string;
  };
  const effectiveMarket: Market = market === "kz" ? "kz" : "ru";
  const priceInfo = WORK_PRICES[workType];
  if (!priceInfo) {
    return NextResponse.json({ error: "Неизвестный тип работы" }, { status: 400 });
  }
  const extrasAmount = (extras ?? []).reduce((sum, item) => sum + (EXTRAS_PRICES[item] ?? 0), 0);

  const user = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { id: true, email: true, role: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const firstOrderDiscount = await isFirstOrderDiscountEligible(user.id, user.role);
  const workAmount = firstOrderDiscount
    ? applyFirstOrderDiscount(priceInfo.price)
    : priceInfo.price;
  const totalAmount = workAmount + extrasAmount;

  const shopId = process.env.YOKASSA_SHOP_ID;
  const secretKey = process.env.YOKASSA_SECRET_KEY;
  const roboLogin = process.env.ROBOKASSA_MERCHANT_LOGIN;
  const roboTestMode = String(process.env.ROBOKASSA_TEST_MODE || "").toLowerCase() === "true";
  const roboPass1 = getRobokassaPass1(roboTestMode);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Старые pending/canceled за 48 ч: сверка с ЮKassa, затем отмена только реально висящих pending
  await reconcileUserWorkTypePayments(user.id, workType);
  await prisma.payment.updateMany({
    where: { userId: user.id, workType, status: "pending" },
    data: { status: "canceled" },
  });

  // Dev mode: no real payment keys — auto-succeed
  if ((!shopId || !secretKey) && (!roboLogin || !roboPass1)) {
    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        workType,
        amount: totalAmount,
        status: "succeeded",
        provider: "dev",
        providerPaymentId: `dev_${crypto.randomUUID()}`,
        yokassaId: `dev_${crypto.randomUUID()}`,
      },
    });
    return NextResponse.json({
      paymentUrl: `${appUrl}/payment/success`,
      paymentId: payment.id,
    });
  }

  const useRobokassa = effectiveMarket === "kz";
  const useYookassa = effectiveMarket === "ru";

  if (useRobokassa && (!roboLogin || !roboPass1)) {
    return NextResponse.json(
      { error: "Для KZ-платежей Robokassa не настроена (логин/пароль #1)" },
      { status: 500 }
    );
  }

  if (useYookassa && (!shopId || !secretKey)) {
    return NextResponse.json(
      { error: "Для RU-платежей ЮKassa не настроена" },
      { status: 500 }
    );
  }

  if (useRobokassa && roboLogin && roboPass1) {
    const invId = makeRoboInvoiceId();
    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        workType,
        amount: totalAmount,
        status: "pending",
        provider: "robokassa",
        providerPaymentId: invId,
      },
    });

    const outSum = totalAmount.toFixed(2);
    // Robokassa recommends avoiding special chars in Description.
    const desc = `Генерация ${workType}`.slice(0, 95);
    // Minimal signature per Robokassa docs (MD5):
    // MerchantLogin:OutSum:InvId:Password#1
    const signature = md5(`${roboLogin}:${outSum}:${invId}:${roboPass1}`);

    const base = roboTestMode
      ? "https://auth.robokassa.ru/Merchant/Index.aspx"
      : "https://auth.robokassa.ru/Merchant/Index.aspx";

    const params = new URLSearchParams({
      MerchantLogin: roboLogin,
      OutSum: outSum,
      InvId: invId,
      Description: desc,
      SignatureValue: signature,
      IsTest: roboTestMode ? "1" : "0",
      Culture: "ru",
    });
    if (user.email) {
      params.set("Email", user.email);
    }
    const failUrl =
      typeof taskId === "string" && taskId.trim()
        ? `${appUrl}/order/${encodeURIComponent(taskId.trim())}`
        : `${appUrl}/dashboard`;
    params.set("SuccessURL", `${appUrl}/payment/success`);
    params.set("FailURL", failUrl);

    return NextResponse.json({
      paymentUrl: `${base}?${params.toString()}`,
      paymentId: payment.id,
      provider: "robokassa",
    });
  }

  // Real YooKassa (RU)
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
      provider: "yookassa",
      providerPaymentId: yokassaData.id,
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
