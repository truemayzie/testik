import { prisma } from "./prisma";

export const WORK_ACTIVITY_ACTIONS = ["DOCX_DOWNLOAD", "PPTX_DOWNLOAD", "SPEECH_DOWNLOAD"] as const;
export type WorkActivityAction = (typeof WORK_ACTIVITY_ACTIONS)[number];

export const WORK_ACTIVITY_SOURCES = ["home", "dashboard", "preview"] as const;
export type WorkActivitySource = (typeof WORK_ACTIVITY_SOURCES)[number];

export async function recordWorkActivity(opts: {
  userId: string;
  generationId?: string | null;
  action: WorkActivityAction;
  source: WorkActivitySource;
  slug?: string | null;
  workType?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  if (opts.generationId) {
    const owns = await prisma.generation.findFirst({
      where: { id: opts.generationId, userId: opts.userId },
      select: { id: true },
    });
    if (!owns) return;
  }

  await prisma.workActivity.create({
    data: {
      userId: opts.userId,
      generationId: opts.generationId || null,
      action: opts.action,
      source: opts.source,
      slug: opts.slug ?? null,
      workType: opts.workType ?? null,
      meta: opts.meta ? JSON.stringify(opts.meta) : null,
    },
  });
}
