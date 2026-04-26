import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";

export async function GET() {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const todayStart    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart    = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 29);
  const sevenDaysAgo  = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7);

  const [
    totalUsers,
    genToday, genMonth, genAll,
    revToday, revMonth, revAll,
    recentGens,
    avgRatingAgg,
    feedbackWeek,
    allFeedbackIssues,
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
    prisma.generation.aggregate({
      where:  { rating: { not: null } },
      _avg:   { rating: true },
      _count: { rating: true },
    }),
    prisma.feedbackComment.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.feedbackComment.findMany({ select: { issues: true } }),
  ]);

  // Топ-3 проблемы из FeedbackComment
  const issueCounts: Record<string, number> = {};
  for (const f of allFeedbackIssues) {
    let arr: string[] = [];
    try { arr = JSON.parse(f.issues); } catch { /* skip */ }
    for (const issue of arr) {
      issueCounts[issue] = (issueCounts[issue] ?? 0) + 1;
    }
  }
  const topIssues = Object.entries(issueCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([issue, count]) => ({ issue, count }));

  // Группируем генерации по дням
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
    feedback: {
      avgRating:    avgRatingAgg._avg.rating ? Math.round(avgRatingAgg._avg.rating * 10) / 10 : null,
      ratedCount:   avgRatingAgg._count.rating,
      feedbackWeek,
      topIssues,
    },
  });
}
