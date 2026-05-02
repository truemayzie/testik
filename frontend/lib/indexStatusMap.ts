import { prisma } from "@/lib/prisma";

export async function loadIndexStatusMap(fullUrls: string[]): Promise<Map<string, { googleVerdict: string | null; googleCoverageState: string | null; googleLastCheck: Date | null; yandexState: string | null }>> {
  if (fullUrls.length === 0) return new Map();
  const rows = await prisma.urlIndexStatus.findMany({
    where: { url: { in: fullUrls } },
    select: {
      url: true,
      googleVerdict: true,
      googleCoverageState: true,
      googleLastCheck: true,
      yandexState: true,
    },
  });
  const m = new Map<string, { googleVerdict: string | null; googleCoverageState: string | null; googleLastCheck: Date | null; yandexState: string | null }>();
  for (const r of rows) {
    m.set(r.url, {
      googleVerdict: r.googleVerdict,
      googleCoverageState: r.googleCoverageState,
      googleLastCheck: r.googleLastCheck,
      yandexState: r.yandexState,
    });
  }
  return m;
}
