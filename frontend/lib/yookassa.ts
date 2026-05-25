import { prisma } from "@/lib/prisma";

/** Запрос статуса платежа в ЮKassa (таймаут 25 с — раньше webhook падал на 10 с). */
export async function fetchYookassaPayment(yokassaId: string): Promise<{
  status?: string;
  paid?: boolean;
} | null> {
  const shopId = process.env.YOKASSA_SHOP_ID;
  const secretKey = process.env.YOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) return null;

  const credentials = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
  try {
    const res = await fetch(`https://api.yookassa.ru/v3/payments/${yokassaId}`, {
      headers: { Authorization: `Basic ${credentials}` },
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Синхронизирует статус Payment в БД с ЮKassa. Возвращает актуальный status. */
export async function syncPaymentFromYookassa(payment: {
  id: string;
  yokassaId: string | null;
  status: string;
}): Promise<string> {
  if (!payment.yokassaId || payment.status === "succeeded") return payment.status;

  const remote = await fetchYookassaPayment(payment.yokassaId);
  if (!remote?.status) return payment.status;

  if (remote.status === "succeeded" && payment.status !== "succeeded") {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: { not: "succeeded" } },
      data: { status: "succeeded" },
    });
    return "succeeded";
  }
  if (remote.status === "canceled" && payment.status === "pending") {
    await prisma.payment.updateMany({
      where: { id: payment.id },
      data: { status: "canceled" },
    });
    return "canceled";
  }
  return payment.status;
}

const RECONCILE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/** Сверяет недавние pending/canceled с ЮKassa (в т.ч. ошибочно отменённые после оплаты). */
export async function reconcileUserWorkTypePayments(
  userId: string,
  workType: string,
): Promise<void> {
  const since = new Date(Date.now() - RECONCILE_MAX_AGE_MS);
  const rows = await prisma.payment.findMany({
    where: {
      userId,
      workType,
      provider: "yookassa",
      yokassaId: { not: null },
      status: { in: ["pending", "canceled"] },
      createdAt: { gte: since },
    },
    select: { id: true, yokassaId: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  for (const pay of rows) {
    await syncPaymentFromYookassa(pay);
  }
}
