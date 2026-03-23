import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";

export async function GET() {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const todayStart  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart  = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 29);

  const [
    totalUsers,
    genToday, genMonth, genAll,
    revToday, revMonth, revAll,
    recentGens,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.generation.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.generation.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.generation.count(),
    prisma.payment.aggregate({ where: { status: "succeeded", createdAt: { gte: todayStart } }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { status: "succeeded", createdAt: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { status: "succeeded" }, _sum: { amount: true } }),
    prisma.generation.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    }),
  ]);

  // Группируем по дням в JS
  const grouped: Record<string, number> = {};
  for (const g of recentGens) {
    const day = g.createdAt.toISOString().slice(0, 10);
    grouped[day] = (grouped[day] ?? 0) + 1;
  }

  const chart = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (29 - i));
    const date = d.toISOString().slice(0, 10);
    return { date, count: grouped[date] ?? 0 };
  });

  return NextResponse.json({
    totalUsers,
    generations: { today: genToday, month: genMonth, all: genAll },
    revenue: {
      today: revToday._sum.amount ?? 0,
      month: revMonth._sum.amount ?? 0,
      all:   revAll._sum.amount  ?? 0,
    },
    chart,
  });
}
