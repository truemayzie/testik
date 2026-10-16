/**
 * lib/abandonedOrderRecovery.ts — возврат брошенных заказов (Этап 5 «Конфетка»).
 *
 * Пользователь создал PreviewTask (превью заказа), но не оплатил.
 * Через ABANDONED_MIN_AGE_MS после создания шлём одно письмо-напоминание
 * со ссылкой на заказ. Повторно не шлём (флаг `_abandonedNotifiedAt`
 * в JSON-поле PreviewTask.extras — без миграции БД).
 *
 * Не отправляем, если:
 *   - у task уже есть Generation (по `_taskId` в extras) — заказ ушёл в генерацию;
 *   - у пользователя есть Payment по тому же workType, созданный ПОСЛЕ task —
 *     он уже начал/завершил оплату;
 *   - письмо уже отправляли.
 */

import { prisma } from "@/lib/prisma";
import { abandonedOrderHtml, sendEmail } from "@/lib/email";

/** Не раньше этого возраста — чтобы не слать сразу после создания превью. */
const MIN_AGE_MS = Number(process.env.ABANDONED_MIN_AGE_MS) || 45 * 60 * 1000;
/** Не позже этого возраста — письмо ещё имеет смысл (TTL заказа 48 ч). */
const MAX_AGE_MS = Number(process.env.ABANDONED_MAX_AGE_MS) || 24 * 60 * 60 * 1000;
/** Как часто сканируем БД. */
const INTERVAL_MS = Number(process.env.ABANDONED_RECOVER_INTERVAL_MS) || 15 * 60 * 1000;
/** Сколько кандидатов за один тик. */
const MAX_PER_TICK = 20;

const FLAG_KEY = "_abandonedNotifiedAt";

let started = false;
let ticking = false;

/** Служебный флаг храним как объект в JSON-массиве extras (строки — user extras). */
function readNotifiedAt(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    for (const item of parsed) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>)[FLAG_KEY] === "string"
      ) {
        return (item as Record<string, string>)[FLAG_KEY] as string;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function withNotifiedFlag(raw: string | null, notifiedAtIso: string): string {
  let arr: unknown[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      /* ignore — начнём с пустого массива */
    }
  }
  // Убираем старый флаг, если вдруг есть
  arr = arr.filter(
    (item) => !(item && typeof item === "object" && FLAG_KEY in (item as object)),
  );
  arr.push({ [FLAG_KEY]: notifiedAtIso });
  return JSON.stringify(arr);
}

export async function runAbandonedOrderRecovery(): Promise<{ processed: number; sent: number }> {
  if (ticking) return { processed: 0, sent: 0 };
  ticking = true;

  let processed = 0;
  let sent = 0;

  try {
    const now = Date.now();
    const minDate = new Date(now - MAX_AGE_MS);
    const maxDate = new Date(now - MIN_AGE_MS);

    const tasks = await prisma.previewTask.findMany({
      where: {
        createdAt: { gte: minDate, lte: maxDate },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "asc" },
      take: 64,
      select: {
        id: true,
        userId: true,
        topic: true,
        workType: true,
        pages: true,
        extras: true,
        createdAt: true,
        user: { select: { email: true } },
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    for (const task of tasks) {
      if (processed >= MAX_PER_TICK) break;
      processed++;

      // Уже напоминали
      if (readNotifiedAt(task.extras)) continue;

      // Без email некуда отправлять
      if (!task.user.email) continue;

      // Есть генерация по этому task — заказ ушёл в работу
      const existingGen = await prisma.generation.findFirst({
        where: { userId: task.userId },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { extras: true },
      });
      let hasGeneration = false;
      try {
        if (existingGen?.extras) {
          const ex = JSON.parse(existingGen.extras) as Record<string, unknown>;
          if (ex._taskId === task.id) hasGeneration = true;
        }
      } catch {
        /* ignore */
      }
      if (hasGeneration) continue;

      // Пользователь начал/завершил оплату по этому типу ПОСЛЕ создания заказа
      const paid = await prisma.payment.findFirst({
        where: {
          userId: task.userId,
          workType: task.workType,
          createdAt: { gte: task.createdAt },
        },
        select: { id: true },
      });
      if (paid) continue;

      const orderUrl = `${appUrl}/order/${encodeURIComponent(task.id)}`;

      try {
        await sendEmail(
          task.user.email,
          `${task.workType} на тему «${task.topic}» ещё ждёт вас — Refai`,
          abandonedOrderHtml(task.topic, task.workType, orderUrl, appUrl),
        );
        await prisma.previewTask.update({
          where: { id: task.id },
          data: { extras: withNotifiedFlag(task.extras, new Date().toISOString()) },
        });
        sent++;
        console.info("[abandoned/recovery] reminder sent", {
          taskId: task.id,
          workType: task.workType,
        });
      } catch (err) {
        console.warn("[abandoned/recovery] send failed", { taskId: task.id, err });
      }
    }
  } catch (err) {
    console.error("[abandoned/recovery] tick error", err);
  } finally {
    ticking = false;
  }

  if (sent > 0) {
    console.info("[abandoned/recovery] tick done", { processed, sent });
  }

  return { processed, sent };
}

/** Запускает периодический возврат брошенных (один раз на процесс Node). */
export function startAbandonedOrderRecovery() {
  if (started) return;
  if (process.env.ABANDONED_RECOVER_DISABLED === "1") {
    console.info("[abandoned/recovery] disabled by env");
    return;
  }

  started = true;
  const intervalMs = INTERVAL_MS;

  console.info("[abandoned/recovery] started", { intervalMs });

  // Первый проход сразу после старта (подхватит накопившиеся брошенные).
  void runAbandonedOrderRecovery();

  const timer = setInterval(() => {
    void runAbandonedOrderRecovery();
  }, intervalMs);

  if (typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }
}
