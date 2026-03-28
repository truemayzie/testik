import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Укажите email и пароль" }, { status: 400 });
    }

    // Только для тестового аккаунта ЮКасса
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, password: true, banned: true },
    });

    if (!user || user.role !== "yukassa_test") {
      return NextResponse.json({ error: "Неверные данные" }, { status: 401 });
    }

    if (!user.password) {
      return NextResponse.json({ error: "Пароль не задан" }, { status: 401 });
    }

    const valid = await compare(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
    }

    if (user.banned) {
      return NextResponse.json({ error: "Аккаунт заблокирован" }, { status: 403 });
    }

    // Создаём NextAuth-совместимую сессию в БД
    const sessionToken = randomUUID();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 дней

    await prisma.session.create({
      data: { sessionToken, userId: user.id, expires },
    });

    // Определяем имя куки (NextAuth использует __Secure- только при HTTPS)
    const secure = (process.env.NEXTAUTH_URL || "").startsWith("https://");
    const cookieName = secure ? "__Secure-next-auth.session-token" : "next-auth.session-token";

    const response = NextResponse.json({ ok: true });
    response.cookies.set(cookieName, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expires,
      secure,
    });

    return response;
  } catch (err) {
    console.error("[yukassa-login]", err);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}
