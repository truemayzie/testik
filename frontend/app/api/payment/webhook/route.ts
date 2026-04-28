import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tgNotify } from "@/lib/tgNotify";

export async function POST(request: NextRequest) {
  try {
    const event = await request.json();

    const yokassaId: string | undefined = event.object?.id;
    if (!yokassaId) {
      return NextResponse.json({ error: "No payment id" }, { status: 400 });
    }

    // Верифицируем webhook запросом в ЮКассу (единственный надёжный способ)
    const shopId    = process.env.YOKASSA_SHOP_ID;
    const secretKey = process.env.YOKASSA_SECRET_KEY;

    if (shopId && secretKey) {
      const credentials = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
      const verifyRes = await fetch(`https://api.yookassa.ru/v3/payments/${yokassaId}`, {
        headers: { "Authorization": `Basic ${credentials}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!verifyRes.ok) {
        console.error("[webhook] ЮКасса вернула ошибку при верификации:", verifyRes.status);
        return NextResponse.json({ error: "Verification failed" }, { status: 400 });
      }

      const verified = await verifyRes.json();

      // Статус в webhook должен совпадать с реальным статусом в ЮКассе
      if (verified.status !== event.object?.status) {
        console.error("[webhook] Статус не совпадает:", verified.status, "vs", event.object?.status);
        return NextResponse.json({ error: "Status mismatch" }, { status: 400 });
      }
    }

    if (event.type === "payment.succeeded") {
      const payment = await prisma.payment.findFirst({
        where: { yokassaId },
        include: { user: { select: { name: true, email: true } } },
      });
      await prisma.payment.updateMany({
        where: { yokassaId },
        data:  { status: "succeeded" },
      });
      const amount = event.object?.amount?.value;
      const name = payment?.user?.name || payment?.user?.email || "—";
      tgNotify(`💳 <b>Оплата получена</b>\n👤 ${name}\n📄 ${payment?.workType || "—"}\n💰 ${amount} ₽`);
      console.log("[webhook] Платёж подтверждён:", yokassaId);
    }

    if (event.type === "payment.canceled") {
      await prisma.payment.updateMany({
        where: { yokassaId },
        data:  { status: "cancelled" },
      });
      console.log("[webhook] Платёж отменён:", yokassaId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook] Ошибка обработки:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
