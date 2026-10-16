import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Публичная анонимная лента тем: только тема, тип работы и время создания.
 * Без slug, без автора, без админских работ — полная анонимность.
 */
export async function GET(req: NextRequest) {
  try {
    // ?take=N — размер ленты (1..48), по умолчанию 12 (главная)
    const takeRaw = parseInt(req.nextUrl.searchParams.get("take") || "12", 10);
    const take = Number.isFinite(takeRaw) ? Math.min(Math.max(takeRaw, 1), 48) : 12;

    const generations = await prisma.generation.findMany({
      where: {
        status: "completed",
        isPublic: true,
        user: { role: { not: "admin" } },
      },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        topic: true,
        workType: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      generations.map((g) => ({
        id: g.id,
        topic: g.topic,
        workType: g.workType,
        createdAt: g.createdAt.toISOString(),
      })),
    );
  } catch {
    return NextResponse.json([]);
  }
}
