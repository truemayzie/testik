import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const page  = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1"));
  const limit = 20;
  const issue = req.nextUrl.searchParams.get("issue") ?? "";

  // Если фильтр по issue — LIKE по JSON-строке (insensitive: в PostgreSQL LIKE регистрозависим)
  const where = issue ? { issues: { contains: issue, mode: "insensitive" as const } } : {};

  const [total, items] = await Promise.all([
    prisma.feedbackComment.count({ where }),
    prisma.feedbackComment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        generation: {
          select: {
            topic:    true,
            workType: true,
            rating:   true,
            user:     { select: { email: true, name: true } },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    items: items.map(item => ({
      id:        item.id,
      createdAt: item.createdAt,
      issues:    (() => { try { return JSON.parse(item.issues); } catch { return []; } })(),
      comment:   item.comment,
      topic:     item.generation.topic,
      workType:  item.generation.workType,
      rating:    item.generation.rating,
      userEmail: item.generation.user.email,
      userName:  item.generation.user.name,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}
