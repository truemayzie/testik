/** Создаёт черновик заказа на сервере и возвращает id для /order/[id]. */
import { savePendingOrderDraft } from "./pendingOrderDraft";

export async function createOrderTask(input: {
  topic: string;
  workType: string;
  pages: number;
  extras?: string[];
}): Promise<{ id: string } | { error: string }> {
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: typeof data.error === "string" ? data.error : "Не удалось создать заказ" };
  }
  if (!data.id || typeof data.id !== "string") {
    return { error: "Некорректный ответ сервера" };
  }
  return { id: data.id };
}

export function savePendingGeneration(payload: {
  taskId?: string;
  topic: string;
  workType: string;
  pages: number;
  paymentId?: string;
}) {
  savePendingOrderDraft(payload);
}

export { savePendingOrderDraft, loadPendingOrderDraft, clearPendingOrderDraft } from "./pendingOrderDraft";
