import { prisma } from "@/lib/prisma";

const TASK_TTL_MS = 48 * 60 * 60 * 1000;

export function previewTaskExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + TASK_TTL_MS);
}

export async function createPreviewTask(input: {
  userId: string;
  topic: string;
  workType: string;
  pages: number;
  extras?: string[];
}) {
  return prisma.previewTask.create({
    data: {
      userId: input.userId,
      topic: input.topic,
      workType: input.workType,
      pages: input.pages,
      extras: input.extras?.length ? JSON.stringify(input.extras) : null,
      expiresAt: previewTaskExpiresAt(),
    },
    select: { id: true },
  });
}

export async function getPreviewTaskForUser(id: string, userId: string) {
  const task = await prisma.previewTask.findFirst({
    where: { id, userId },
  });
  if (!task) return null;
  if (task.expiresAt < new Date()) return null;
  return task;
}

export async function listPendingPreviewTasks(userId: string) {
  const [tasks, activeGenerations] = await Promise.all([
    prisma.previewTask.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        topic: true,
        workType: true,
        pages: true,
        createdAt: true,
      },
    }),
    prisma.generation.findMany({
      where: { userId, status: { in: ["running", "completed"] } },
      select: { topic: true, workType: true },
    }),
  ]);

  if (activeGenerations.length === 0) return tasks;

  const activeKeys = new Set(
    activeGenerations.map((g) => `${g.workType}|${g.topic.trim().toLowerCase()}`),
  );
  return tasks.filter(
    (t) => !activeKeys.has(`${t.workType}|${t.topic.trim().toLowerCase()}`),
  );
}

export async function deletePreviewTaskForUser(id: string, userId: string) {
  const r = await prisma.previewTask.deleteMany({ where: { id, userId } });
  return r.count > 0;
}

export function parseTaskExtras(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
