import { prisma } from "@/lib/prisma";

/** Скидка на первую оплаченную работу (только базовая цена типа, не extras). */
export const FIRST_ORDER_DISCOUNT_PERCENT = 20;

export function applyFirstOrderDiscount(amountRub: number): number {
  if (amountRub <= 0) return 0;
  return Math.round(amountRub * (1 - FIRST_ORDER_DISCOUNT_PERCENT / 100));
}

export function isRoleEligibleForFirstOrderDiscount(role?: string | null): boolean {
  return !role || role === "user";
}

/** Уже была успешная оплата (не gift). */
export async function userHasCompletedPaidOrder(userId: string): Promise<boolean> {
  const paid = await prisma.payment.findFirst({
    where: {
      userId,
      status: "succeeded",
      NOT: {
        OR: [
          { yokassaId: { startsWith: "gift_" } },
          { providerPaymentId: { startsWith: "gift_" } },
        ],
      },
    },
    select: { id: true },
  });
  return !!paid;
}

export async function isFirstOrderDiscountEligible(
  userId: string,
  role?: string | null
): Promise<boolean> {
  if (!isRoleEligibleForFirstOrderDiscount(role)) return false;
  return !(await userHasCompletedPaidOrder(userId));
}

export function calcWorkOrderTotals(
  baseRub: number,
  extrasRub: number,
  discountEligible: boolean
): {
  baseRub: number;
  totalRub: number;
  originalTotalRub: number;
  discountApplied: boolean;
} {
  const discountedBase = discountEligible ? applyFirstOrderDiscount(baseRub) : baseRub;
  const discountApplied =
    discountEligible && baseRub > 0 && discountedBase < baseRub;
  return {
    baseRub: discountedBase,
    totalRub: discountedBase + extrasRub,
    originalTotalRub: baseRub + extrasRub,
    discountApplied,
  };
}
