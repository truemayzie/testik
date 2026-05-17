import { prisma } from "@/lib/prisma";

/** Атомарно занимает один слот предпросмотра. false = лимит исчерпан. */
export async function tryConsumePreviewSlot(userId: string, quota: number): Promise<boolean> {
  const q = Math.max(1, quota);
  const updated = await prisma.$executeRaw`
    UPDATE User
    SET freePreviewUses = freePreviewUses + 1,
        freePreviewUsedAt = CURRENT_TIMESTAMP
    WHERE id = ${userId}
      AND freePreviewUses < ${q}
  `;
  return Number(updated) === 1;
}

/** Откат слота, если генерация превью на бэкенде не удалась. */
export async function releasePreviewSlot(userId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE User
    SET freePreviewUses = CASE WHEN freePreviewUses > 0 THEN freePreviewUses - 1 ELSE 0 END
    WHERE id = ${userId}
  `;
}
