import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/feedback?generationId=X&rating=N
 * Сохраняет оценку (1–5) в Generation.rating.
 * Вызывается из ссылки в письме — без требования авторизации
 * (generationId = random cuid, труднопредсказуем).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const generationId = searchParams.get("generationId");
  const ratingStr    = searchParams.get("rating");
  const appUrl       = process.env.NEXT_PUBLIC_APP_URL || "https://ref-ai.ru";

  const rating = parseInt(ratingStr ?? "", 10);
  if (!generationId || isNaN(rating) || rating < 1 || rating > 5) {
    return NextResponse.redirect(`${appUrl}/dashboard`);
  }

  try {
    // Обновляем только если запись существует
    const gen = await prisma.generation.findUnique({
      where: { id: generationId },
      select: { id: true },
    });
    if (gen) {
      await prisma.generation.update({
        where: { id: generationId },
        data:  { rating },
      });
    }
  } catch {
    // Не блокируем редирект при ошибке БД
  }

  // Низкая оценка → спрашиваем детали
  const isBad = rating <= 3;
  const redirectUrl = isBad
    ? `${appUrl}/dashboard?rated=1&bad=1&generationId=${generationId}`
    : `${appUrl}/dashboard?rated=1`;

  return NextResponse.redirect(redirectUrl);
}
