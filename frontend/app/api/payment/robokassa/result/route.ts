import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { tgNotify } from "@/lib/tgNotify";

function md5(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex");
}

function getRobokassaPass2(isTest: boolean): string | undefined {
  if (isTest) {
    return process.env.ROBOKASSA_TEST_PASSWORD2 || process.env.ROBOKASSA_PASSWORD2;
  }
  return process.env.ROBOKASSA_PASSWORD2;
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const outSum = String(form.get("OutSum") || "");
    const invId = String(form.get("InvId") || "");
    const signatureValue = String(form.get("SignatureValue") || "").toLowerCase();
    const isTest = String(form.get("IsTest") || "0") === "1";
    return handleResult({ outSum, invId, signatureValue, isTest });
  } catch (err) {
    console.error("[robokassa/result] error", err);
    return new NextResponse("error", { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const outSum = String(searchParams.get("OutSum") || "");
    const invId = String(searchParams.get("InvId") || "");
    const signatureValue = String(searchParams.get("SignatureValue") || "").toLowerCase();
    const isTest = String(searchParams.get("IsTest") || "0") === "1";
    return handleResult({ outSum, invId, signatureValue, isTest });
  } catch (err) {
    console.error("[robokassa/result] error", err);
    return new NextResponse("error", { status: 500 });
  }
}

async function handleResult({
  outSum,
  invId,
  signatureValue,
  isTest,
}: {
  outSum: string;
  invId: string;
  signatureValue: string;
  isTest: boolean;
}) {
  if (!outSum || !invId || !signatureValue) {
    return new NextResponse("bad request", { status: 400 });
  }

  const pass2 = getRobokassaPass2(isTest);
  if (!pass2) {
    return new NextResponse("misconfigured", { status: 500 });
  }

  const expected = md5(`${outSum}:${invId}:${pass2}`).toLowerCase();
  if (expected !== signatureValue) {
    return new NextResponse("invalid signature", { status: 400 });
  }

  const payment = await prisma.payment.findFirst({
    where: { provider: "robokassa", providerPaymentId: invId },
    include: { user: { select: { name: true, email: true } } },
  });

  const updated = await prisma.payment.updateMany({
    where: { provider: "robokassa", providerPaymentId: invId, status: { not: "succeeded" } },
    data: { status: "succeeded" },
  });

  if (payment && updated.count > 0) {
    const name = payment.user?.name || payment.user?.email || "—";
    tgNotify(`💳 <b>Оплата получена</b>\n👤 ${name}\n📄 ${payment.workType}\n💰 ${outSum} ₽`);
  }

  return new NextResponse(`OK${invId}`, { status: 200 });
}

