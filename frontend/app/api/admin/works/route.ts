import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const search   = req.nextUrl.searchParams.get("search") ?? "";
  const dateFrom = req.nextUrl.searchParams.get("from");
  const dateTo   = req.nextUrl.searchParams.get("to");

  const works = await prisma.generation.findMany({
    where: {
      ...(search ? { topic: { contains: search } } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo   ? { lte: new Date(dateTo + "T23:59:59Z") } : {}),
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, topic: true, workType: true, pages: true,
      status: true, createdAt: true, slug: true, rating: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  // Находим оплату для каждой генерации
  const userIdSet = new Set(works.map(w => w.user.id));
  const userIds = Array.from(userIdSet);
  const payments = await prisma.payment.findMany({
    where: { userId: { in: userIds }, status: "succeeded", usedAt: { not: null } },
    select: { userId: true, workType: true, amount: true, usedAt: true },
  });

  // Матчим платёж к работе по userId + workType (ближайший по дате)
  const result = works.map(w => {
    const pay = payments
      .filter(p => p.userId === w.user.id && p.workType === w.workType)
      .sort((a, b) => {
        const da = Math.abs((a.usedAt?.getTime() ?? 0) - w.createdAt.getTime());
        const db = Math.abs((b.usedAt?.getTime() ?? 0) - w.createdAt.getTime());
        return da - db;
      })[0];
    return { ...w, amount: pay?.amount ?? null };
  });

  return NextResponse.json(result);
}
