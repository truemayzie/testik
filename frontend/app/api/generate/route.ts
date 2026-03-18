import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

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
      department: true, speciality: true, course: true,
      groupNumber: true, teacherName: true, city: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  const body = await request.json();
  const workType = body.workType || "Реферат";

  // Находим платёж и сразу атомарно помечаем использованным.
  // updateMany(where usedAt=null) вернёт count=0 при гонке двух одновременных запросов —
  // второй уже не найдёт незанятый платёж и получит 403 без траты генерации.
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

  // Атомарно claim: обновляем только если usedAt всё ещё null (оптимистичная блокировка)
  const claimed = await prisma.payment.updateMany({
    where: { id: payment.id, usedAt: null },
    data:  { usedAt: new Date() },
  });

  if (claimed.count === 0) {
    // Параллельный запрос уже занял этот платёж
    return NextResponse.json(
      { error: "Требуется оплата", code: "PAYMENT_REQUIRED", workType },
      { status: 403 }
    );
  }

  try {
    const { id: _id, ...profile } = user;
    const backendBody = {
      topic:     body.topic,
      pages:     body.pages,
      work_type: workType,
      profile,
    };
    const response = await fetch(`${BACKEND_URL}/api/generate/referat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(backendBody),
    });

    if (!response.ok) {
      // Генерация не удалась — возвращаем платёж чтобы пользователь мог повторить
      await prisma.payment.update({
        where: { id: payment.id },
        data:  { usedAt: null },
      });
      return NextResponse.json(
        { error: "Ошибка на сервере генерации" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Сервер генерации недоступен. Запустите backend (uvicorn)." },
      { status: 503 }
    );
  }
}
