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

type ExtrasJson = Record<string, unknown>;

function safeParseExtras(raw: string | null | undefined): ExtrasJson {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as ExtrasJson) : {};
  } catch {
    return {};
  }
}

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

// ── Создать запись о запущенной генерации (чтобы она появилась в «Мои работы») ─
export async function createRunningGeneration(params: {
  userId: string;
  topic: string;
  pages: number;
  workType: string;
  jobId: string;
}) {
  const extras = { _jobId: params.jobId };
  return await prisma.generation.create({
    data: {
      userId: params.userId,
      topic: params.topic,
      pages: params.pages,
      workType: params.workType,
      result: JSON.stringify({}),
      status: "running",
      isPublic: false,
      slug: null,
      extras: JSON.stringify(extras),
    },
    select: { id: true, createdAt: true },
  });
}

// ── Завершить ранее созданную running-генерацию ─────────────────────────────
export async function finalizeRunningGeneration(params: {
  id: string;
  userId: string;
  result: ReferatResult;
}) {
  const slug = randomBytes(6).toString("hex");
  const gen = await prisma.generation.findFirst({
    where: { id: params.id, userId: params.userId },
    select: { id: true, slug: true, extras: true },
  });
  if (!gen) return null;

  const extras = safeParseExtras(gen.extras);
  // удаляем служебный _jobId, оставляем возможные presentation/speech и т.п.
  delete extras._jobId;
  const extrasStr = Object.keys(extras).length ? JSON.stringify(extras) : null;

  return await prisma.generation.update({
    where: { id: params.id },
    data: {
      result: JSON.stringify(params.result),
      status: "completed",
      isPublic: true,
      slug: gen.slug || slug,
      extras: extrasStr,
    },
    select: { id: true, slug: true },
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
  if (generation.status !== "completed") {
    return {
      ...generation,
      result: null,
    };
  }
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
