/**
 * Выбор приватности работы на checkout (/order/[taskId]).
 *
 * По умолчанию работа приватна: не попадает в публичную витрину /preview и sitemap.
 * Пользователь может явно разрешить публикацию ползунком в PaymentWidget.
 *
 * Храним в localStorage (не sessionStorage!) — выбор должен пережить редирект
 * на оплату (ЮKassa/Robokassa) и возврат на /order/[taskId]?autoGenerate=1.
 */

function publicChoiceKey(taskId: string): string {
  return `refai_public_choice_${taskId}`;
}

/** Сохранить выбор публикации для заказа. true = опубликовать, false = приватно. */
export function savePublicChoiceForTask(taskId: string, isPublic: boolean): void {
  if (!taskId) return;
  try {
    localStorage.setItem(publicChoiceKey(taskId), isPublic ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/**
 * Прочитать выбор публикации для заказа.
 * Возвращает false, если выбор не сохранён (приватность по умолчанию).
 */
export function loadPublicChoiceForTask(taskId: string): boolean {
  if (!taskId) return false;
  try {
    return localStorage.getItem(publicChoiceKey(taskId)) === "1";
  } catch {
    return false;
  }
}

export function clearPublicChoiceForTask(taskId: string): void {
  if (!taskId) return;
  try {
    localStorage.removeItem(publicChoiceKey(taskId));
  } catch {
    /* ignore */
  }
}
