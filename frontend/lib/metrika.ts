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

/**
 * Шаги воронки (Этап 4 «Конфетка»):
 *   form_start      — пользователь начал вводить тему
 *   preview_opened  — открылась страница заказа с превью
 *   checkout_opened — пользователь на платёжном блоке
 *   payment_success — оплата прошла (см. reachPaymentSuccessGoalOnce)
 *   generation_done — генерация завершена, работа готова
 *   extras_upsell_shown — показан блок апселла extras
 *   extras_upsell_buy   — клик «Добавить» в апселле extras
 *
 * Каждое событие шлётся один раз за сессию (dedupe по ключу
 * `ym_funnel_<name>`), чтобы не задваивать при перерисовках.
 */
export type FunnelStep =
  | "form_start"
  | "preview_opened"
  | "checkout_opened"
  | "generation_done"
  | "extras_upsell_shown"
  | "extras_upsell_buy";

export function reachFunnelGoal(step: FunnelStep): void {
  try {
    if (typeof window === "undefined") return;
    const key = `ym_funnel_${step}`;
    if (window.sessionStorage.getItem(key) === "1") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ymFn = (window as any).ym as undefined | ((...args: any[]) => void);
    if (typeof ymFn !== "function") return;
    ymFn(YM_COUNTER_ID, "reachGoal", step);
    window.sessionStorage.setItem(key, "1");
  } catch {
    /* аналитика не должна ломать UI */
  }
}
