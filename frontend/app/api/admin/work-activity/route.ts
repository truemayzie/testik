import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Последние события скачиваний (DOCX/PPTX/Speech) — поддержка и отладка */
export async function GET(req: NextRequest) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, parseInt(sp.get("limit") || "50", 10)));
  const email = sp.get("email")?.trim();
  let userId: string | undefined;
  if (email) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    userId = u?.id;
    if (!userId) return NextResponse.json([]);
  }

  const rows = await prisma.workActivity.findMany({
    where: userId ? { userId } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      createdAt: true,
      action: true,
      source: true,
      slug: true,
      workType: true,
      meta: true,
      generationId: true,
      user: { select: { email: true } },
      generation: { select: { topic: true } },
    },
  });

  return NextResponse.json(rows);
}
