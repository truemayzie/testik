import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveGeneration } from "@/lib/db";
import type { ReferatResult } from "@/lib/db";
import { activeJobs } from "@/app/lib/activeJobs";
import { sendEmail, generationReadyHtml } from "@/lib/email";
import { tgNotify } from "@/lib/tgNotify";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

/** Максимальное время ожидания результата от backend (25 минут). */
const MAX_WAIT_MS   = 25 * 60 * 1000;
/** Интервал опроса статуса задания. */
const POLL_INTERVAL = 5_000;

/** Типы работ, доступные тестовому аккаунту ЮКасса */
const YUKASSA_ALLOWED_TYPES = ["Сочинение", "Эссе", "Доклад"];

/** Откатывает платёж (usedAt → null), чтобы пользователь мог повторить. */
async function revertPayment(paymentId: string | null) {
  if (!paymentId) return;
  try {
    await prisma.payment.update({ where: { id: paymentId }, data: { usedAt: null } });
  } catch { /* не блокируем основной путь */ }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const sessionUserId = (session?.user as { id?: string } | null)?.id;
  if (!session?.user || !sessionUserId) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: {
      id: true, role: true,
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

  const isAdmin   = user.role === "admin";
  const isYukassa = user.role === "yukassa_test";
  let paymentId: string | null = null;

  // Тип «Тест» — только для администраторов
  if (workType === "Тест" && !isAdmin) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  if (isAdmin) {
    // Администратор генерирует бесплатно — пропускаем проверку оплаты
  } else if (isYukassa) {
    // Проверяем ограничение по типу работы
    if (!YUKASSA_ALLOWED_TYPES.includes(workType)) {
      return NextResponse.json(
        { error: "Тестовому аккаунту доступны только: Сочинение, Эссе, Доклад", code: "TRIAL_RESTRICTED" },
        { status: 403 }
      );
    }
    // Проверяем лимит генераций (только 1)
    const genCount = await prisma.generation.count({ where: { userId: user.id } });
    if (genCount >= 1) {
      return NextResponse.json(
        { error: "Пробная генерация уже использована. Работа доступна в разделе «Мои работы».", code: "TRIAL_USED" },
        { status: 403 }
      );
    }
    // Оплата не требуется — продолжаем
  } else {
    // Стандартный путь: находим платёж и атомарно помечаем использованным
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
    paymentId = payment.id;
  }

  // ── Rate limiting ─────────────────────────────────────────────────────────

  // Проверка 1: активная генерация у этого юзера
  if (activeJobs.get(user.id)) {
    return NextResponse.json(
      { error: "У вас уже идёт генерация. Дождитесь завершения." },
      { status: 429 }
    );
  }

  // Проверка 2: дневной лимит (5 генераций в день)
  if (!isAdmin) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayCount = await prisma.payment.count({
      where: {
        userId: user.id,
        status: "succeeded",
        createdAt: { gte: startOfDay },
      },
    });
    if (todayCount >= 5) {
      return NextResponse.json(
        { error: "Дневной лимит генераций исчерпан. Попробуйте завтра." },
        { status: 429 }
      );
    }
  }

  // ── Шаг 1: запускаем задание на backend (быстрый запрос) ──────────────────
  let jobId: string;
  try {
    const { id: _id, role: _role, ...profile } = user;
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
      signal:  AbortSignal.timeout(30_000),
    });

    if (!startRes.ok) {
      await revertPayment(paymentId);
      return NextResponse.json(
        { error: "Сервис сейчас перегружен. Ваш баланс не списан — попробуйте через минуту." },
        { status: 503 }
      );
    }

    const { jobId: id } = await startRes.json();
    if (!id) {
      await revertPayment(paymentId);
      return NextResponse.json({ error: "Backend не вернул jobId" }, { status: 502 });
    }
    jobId = id;
    // Регистрируем задание — для poll-эндпоинта при восстановлении после F5
    activeJobs.set(user.id, { jobId, topic: body.topic, pages: body.pages, workType });
    tgNotify(`📝 <b>Генерация началась</b>\n👤 ${user.fullName || user.id}\n📄 ${workType}: «${body.topic}»\n📃 ${body.pages} стр.`);
  } catch (err) {
    console.error("[generate] Не удалось запустить задание:", err);
    await revertPayment(paymentId);
    return NextResponse.json(
      { error: "Сервис сейчас перегружен. Ваш баланс не списан — попробуйте через минуту." },
      { status: 503 }
    );
  }

  // ── Шаг 2: опрашиваем статус каждые 5 секунд ─────────────────────────────
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
      if (!statusRes.ok) continue;
      const json = await statusRes.json();
      status   = json.status;
      jobError = json.error;
    } catch {
      continue;
    }

    if (status === "not_found") {
      activeJobs.clear(user.id);
      await revertPayment(paymentId);
      return NextResponse.json(
        { error: "Сервис сейчас перегружен. Ваш баланс не списан — попробуйте через минуту." },
        { status: 503 }
      );
    }

    if (status === "error") {
      activeJobs.clear(user.id);
      await revertPayment(paymentId);
      console.error("[generate] Backend error:", jobError);
      return NextResponse.json(
        { error: "Сервис сейчас перегружен. Ваш баланс не списан — попробуйте через минуту." },
        { status: 500 }
      );
    }

    if (status === "done") {
      try {
        const resultRes = await fetch(
          `${BACKEND_URL}/api/generate/result/${jobId}`,
          { signal: AbortSignal.timeout(30_000) }
        );
        if (!resultRes.ok) {
          await revertPayment(paymentId);
          return NextResponse.json(
            { error: "Не удалось получить результат от backend" },
            { status: 502 }
          );
        }

        const data = await resultRes.json() as ReferatResult & { _cost_usd?: number };

        let savedId: string | undefined;
        try {
          const saved = await saveGeneration(user.id, body.topic, body.pages, workType, data);
          savedId = saved.id;

          const costStr = data._cost_usd != null ? `\n💰 Стоимость: $${data._cost_usd.toFixed(4)}` : "";
          tgNotify(`✅ <b>Генерация завершена</b>\n👤 ${user.fullName || user.id}\n📄 ${workType}: «${body.topic}»${costStr}`);

          // Отправляем письмо пользователю после успешной генерации
          const userEmail = session.user?.email;
          if (userEmail && savedId) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ref-ai.ru";
            sendEmail(
              userEmail,
              `Ваша работа готова: ${body.topic}`,
              generationReadyHtml(body.topic, workType, savedId, appUrl)
            ).catch(() => { /* не блокируем ответ при ошибке письма */ });
          }
        } catch { /* не блокируем ответ */ }

        activeJobs.clear(user.id);
        return NextResponse.json({ ...data, _generationId: savedId });
      } catch (err) {
        console.error("[generate] Ошибка при получении результата:", err);
        activeJobs.clear(user.id);
        await revertPayment(paymentId);

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

  activeJobs.clear(user.id);
  await revertPayment(paymentId);
  return NextResponse.json(
    { error: "Превышено время ожидания (25 минут). Платёж возвращён — попробуйте снова." },
    { status: 503 }
  );
}
