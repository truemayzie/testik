import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { maskAuthorDisplay } from "@/lib/maskAuthor";

export const dynamic = "force-dynamic";

/** Публичная лента: тема, тип, slug, маскированный автор. Без админских работ. */
export async function GET() {
  try {
    const generations = await prisma.generation.findMany({
      where: {
        status: "completed",
        isPublic: true,
        slug: { not: null },
        user: { role: { not: "admin" } },
      },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        id: true,
        topic: true,
        workType: true,
        slug: true,
        user: {
          select: { name: true, fullName: true, email: true },
        },
      },
    });

    return NextResponse.json(
      generations.map((g) => ({
        id: g.id,
        topic: g.topic,
        workType: g.workType,
        slug: g.slug as string,
        authorLabel: maskAuthorDisplay(g.user.fullName ?? g.user.name, g.user.email),
      })),
    );
  } catch {
    return NextResponse.json([]);
  }
}
