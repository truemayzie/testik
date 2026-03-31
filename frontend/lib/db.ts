// lib/db.ts — функции для работы с базой данных

import { randomBytes } from "crypto";
import { prisma } from "./prisma";

// Тип результата генерации
export type ReferatResult = {
  title: string;
  structure: string[];
  content: Record<string, string>;
  sources: string[];
  meta: Record<string, string | number>;
};

// ── Сохранить генерацию ──────────────────────────────────────────
export async function saveGeneration(
  userId: string,
  topic: string,
  pages: number,
  workType: string,
  result: ReferatResult
) {
  const slug = randomBytes(6).toString("hex");

  return await prisma.generation.create({
    data: {
      userId,
      topic,
      pages,
      workType,
      result: JSON.stringify(result),
      status: "completed",
      isPublic: true,
      slug,
    },
  });
}

// ── Получить все генерации пользователя ──────────────────────────
export async function getUserGenerations(userId: string) {
  const generations = await prisma.generation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id:        true,
      topic:     true,
      pages:     true,
      workType:  true,
      status:    true,
      createdAt: true,
      slug:      true,
      extras:    true,
      // result не включаем — он большой, загружаем отдельно
    },
  });
  return generations;
}

// ── Обновить поле extras у генерации ─────────────────────────────
export async function updateGenerationExtras(id: string, userId: string, extras: string) {
  return await prisma.generation.updateMany({
    where: { id, userId },
    data: { extras },
  });
}

// ── Получить одну генерацию ──────────────────────────────────────
export async function getGeneration(id: string, userId: string) {
  const generation = await prisma.generation.findFirst({
    where: { id, userId },
  });
  if (!generation) return null;
  return {
    ...generation,
    result: JSON.parse(generation.result) as ReferatResult,
  };
}

// ── Удалить генерацию ────────────────────────────────────────────
export async function deleteGeneration(id: string, userId: string) {
  return await prisma.generation.deleteMany({
    where: { id, userId },
  });
}
