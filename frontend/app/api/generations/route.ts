// app/api/generations/route.ts
// Сохраняет и получает генерации пользователя

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { saveGeneration, getUserGenerations } from "@/lib/db";
export const dynamic = "force-dynamic";

// POST — сохранить генерацию
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { topic, pages, workType, result } = await request.json();
  const userId = (session.user as typeof session.user & { id: string }).id;

  const generation = await saveGeneration(userId, topic, pages, workType || "Реферат", result);
  return NextResponse.json(generation);
}

// GET — получить все генерации
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const userId = (session.user as typeof session.user & { id: string }).id;
  const generations = await getUserGenerations(userId);
  return NextResponse.json(generations);
}
