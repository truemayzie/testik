import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveGeneration } from "@/lib/db";
import type { ReferatResult } from "@/lib/db";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

/** Максимальное время ожидания результата от backend (25 минут). */
const MAX_WAIT_MS   = 25 * 60 * 1000;
/** Интервал опроса статуса задания. */
const POLL_INTERVAL = 5_000;

/** Откатывает платёж (usedAt → null), чтобы пользователь мог повторить. */
async function revertPayment(paymentId: string) {
  try {
    await prisma.payment.update({ where: { id: paymentId }, data: { usedAt: null } });
  } catch { /* не блокируем основной путь */ }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      fullName: true, university: true, faculty: true,
      department: true, speciality: true, discipline: true, course: true,
      groupNumber: true, teacherName: true, city: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  const body     = await request.json();
  const workType = body.workType || "Реферат";

  // Находим платёж и атомарно помечаем использованным
  const payment = await prisma.payment.findFirst({
    where: { userId: user.id, workType, status: "succeeded", usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!payment) {
    return NextResponse.json(
      { error: "Требуется оплата", code: "PAYMENT_REQUIRED", workType },
      { status: 403 }
    );
  }

  const claimed = await prisma.payment.updateMany({
    where: { id: payment.id, usedAt: null },
    data:  { usedAt: new Date() },
  });
  if (claimed.count === 0) {
    return NextResponse.json(
      { error: "Требуется оплата", code: "PAYMENT_REQUIRED", workType },
      { status: 403 }
    );
  }

  // ── Шаг 1: запускаем задание на backend (быстрый запрос) ──────────────────
  let jobId: string;
  try {
    const { id: _id, ...profile } = user;
    const backendBody = {
      topic:     body.topic,
      pages:     body.pages,
      work_type: workType,
      profile,
    };

    const startRes = await fetch(`${BACKEND_URL}/api/generate/referat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(backendBody),
      signal:  AbortSignal.timeout(30_000), // 30 сек — только на старт
    });

    if (!startRes.ok) {
      await revertPayment(payment.id);
      return NextResponse.json(
        { error: "Не удалось запустить генерацию на backend" },
        { status: startRes.status }
      );
    }

    const { jobId: id } = await startRes.json();
    if (!id) {
      await revertPayment(payment.id);
      return NextResponse.json({ error: "Backend не вернул jobId" }, { status: 502 });
    }
    jobId = id;
  } catch (err) {
    console.error("[generate] Не удалось запустить задание:", err);
    await revertPayment(payment.id);
    return NextResponse.json(
      { error: "Сервер генерации недоступен. Запустите backend (uvicorn)." },
      { status: 503 }
    );
  }

  // ── Шаг 2: опрашиваем статус каждые 5 секунд (без долгого соединения) ────
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));

    let status: string;
    let jobError: string | undefined;

    try {
      const statusRes = await fetch(
        `${BACKEND_URL}/api/generate/status/${jobId}`,
        { signal: AbortSignal.timeout(10_000) }
      );
      if (!statusRes.ok) continue; // временная ошибка сети — ждём следующего тика
      const json = await statusRes.json();
      status   = json.status;
      jobError = json.error;
    } catch {
      // backend не отвечает в этом тике — пробуем снова
      continue;
    }

    if (status === "not_found") {
      // Backend был перезапущен (uvicorn --reload): задание потеряно
      await revertPayment(payment.id);
      return NextResponse.json(
        { error: "Сервер был перезапущен во время генерации. Платёж возвращён — попробуйте снова. Запускайте backend командой: uvicorn main:app (без --reload)." },
        { status: 503 }
      );
    }

    if (status === "error") {
      await revertPayment(payment.id);
      return NextResponse.json(
        { error: jobError || "Ошибка генерации на backend" },
        { status: 500 }
      );
    }

    if (status === "done") {
      // ── Шаг 3: забираем результат ─────────────────────────────────────────
      try {
        const resultRes = await fetch(
          `${BACKEND_URL}/api/generate/result/${jobId}`,
          { signal: AbortSignal.timeout(30_000) }
        );
        if (!resultRes.ok) {
          await revertPayment(payment.id);
          return NextResponse.json(
            { error: "Не удалось получить результат от backend" },
            { status: 502 }
          );
        }

        const data = await resultRes.json() as ReferatResult;

        // Сохраняем в БД — не зависим от клиентского подключения
        try {
          await saveGeneration(user.id, body.topic, body.pages, workType, data);
        } catch { /* не блокируем ответ */ }

        return NextResponse.json(data);
      } catch (err) {
        console.error("[generate] Ошибка при получении результата:", err);
        await revertPayment(payment.id);

        // Проверяем: вдруг saveGeneration уже успел записать до ошибки
        const saved = await prisma.generation.findFirst({
          where: { userId: user.id, topic: body.topic, workType },
          orderBy: { createdAt: "desc" },
        });
        if (saved) {
          return NextResponse.json(
            { error: "Соединение прервалось, но работа была сохранена.", code: "SAVED", slug: saved.slug },
            { status: 503 }
          );
        }
        return NextResponse.json(
          { error: "Не удалось получить результат. Платёж возвращён — попробуйте снова." },
          { status: 503 }
        );
      }
    }

    // status === "running" — продолжаем ждать
  }

  // Превышено MAX_WAIT_MS
  await revertPayment(payment.id);
  return NextResponse.json(
    { error: "Превышено время ожидания (25 минут). Платёж возвращён — попробуйте снова." },
    { status: 503 }
  );
}
