/** Совпадает с id счётчика в app/layout.tsx */
export const YM_COUNTER_ID = 108284268;

/** Цель «payment_success»: один раз на paymentId, не для админов. */
export function reachPaymentSuccessGoalOnce(
  storageKey: string,
  options?: { skip?: boolean }
): void {
  if (options?.skip) return;
  try {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(storageKey) === "1") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ymFn = (window as any).ym as undefined | ((...args: any[]) => void);
    if (typeof ymFn !== "function") return;
    ymFn(YM_COUNTER_ID, "reachGoal", "payment_success");
    window.sessionStorage.setItem(storageKey, "1");
  } catch {
    /* аналитика не должна ломать UI */
  }
}

export function isAdminSessionRole(role: string | undefined): boolean {
  return role === "admin";
}
