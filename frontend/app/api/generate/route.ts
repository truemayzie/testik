import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { activeJobs } from "@/app/lib/activeJobs";
import { tgNotify } from "@/lib/tgNotify";
import { createRunningGeneration } from "@/lib/db";
import { prepareTopic } from "@/lib/topicValidate";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

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
    console.warn("[generate] unauthorized request");
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

  const prepared = prepareTopic(String(body.topic ?? ""));
  if (!prepared.ok) {
    return NextResponse.json({ error: prepared.message }, { status: 400 });
  }
  const topic = prepared.topic;

  const isAdmin   = user.role === "admin";
  const isYukassa = user.role === "yukassa_test";
  let paymentId: string | null = null;

  // Тип «Тест» — только для администраторов
  if (workType === "Тест" && !isAdmin) {
    console.warn("[generate] forbidden test work type", { userId: user.id });
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  if (isAdmin) {
    // Администратор генерирует бесплатно — пропускаем проверку оплаты
  } else if (isYukassa) {
    // Проверяем ограничение по типу работы
    if (!YUKASSA_ALLOWED_TYPES.includes(workType)) {
      console.warn("[generate] yukassa trial restricted", { userId: user.id, workType });
      return NextResponse.json(
        { error: "Тестовому аккаунту доступны только: Сочинение, Эссе, Доклад", code: "TRIAL_RESTRICTED" },
        { status: 403 }
      );
    }
    // Проверяем лимит генераций (только 1)
    const genCount = await prisma.generation.count({ where: { userId: user.id } });
    if (genCount >= 1) {
      console.warn("[generate] yukassa trial already used", { userId: user.id });
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
      console.warn("[generate] payment required", { userId: user.id, workType });
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
    console.warn("[generate] active job already exists", { userId: user.id });
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
      console.warn("[generate] daily limit exceeded", { userId: user.id, todayCount });
      return NextResponse.json(
        { error: "Дневной лимит генераций исчерпан. Попробуйте завтра." },
        { status: 429 }
      );
    }
  }

  // ── Шаг 1: запускаем задание на backend (быстрый запрос) ──────────────────
  let jobId: string;
  let generationId: string | null = null;
  try {
    const { id: _id, role: _role, ...profile } = user;
    const backendBody = {
      topic,
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
    // Важно: создаём запись в БД сразу, чтобы работа появилась в «Мои работы»
    // даже если пользователь закрыл вкладку и не дождался финального поллинга.
    const running = await createRunningGeneration({
      userId: user.id,
      topic,
      pages: body.pages,
      workType,
      jobId,
    });
    generationId = running.id;

    // Регистрируем задание в памяти — ускоряет поллинг без доп. запросов к БД
    activeJobs.set(user.id, { jobId, generationId: running.id, topic, pages: body.pages, workType, paymentId });
    console.info("[generate] job started", { userId: user.id, jobId, workType });
    tgNotify(`📝 <b>Генерация началась</b>\n👤 ${user.fullName || user.id}\n📄 ${workType}: «${topic}»\n📃 ${body.pages} стр.`);
  } catch (err) {
    console.error("[generate] Не удалось запустить задание:", err);
    await revertPayment(paymentId);
    return NextResponse.json(
      { error: "Сервис сейчас перегружен. Ваш баланс не списан — попробуйте через минуту." },
      { status: 503 }
    );
  }

  // Возвращаемся сразу, без long-wait. Дальше фронтенд опрашивает /api/generate/poll.
  return NextResponse.json({ status: "running", jobId, generationId });
}
