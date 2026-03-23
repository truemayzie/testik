import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const search = req.nextUrl.searchParams.get("search") ?? "";

  const users = await prisma.user.findMany({
    where: search
      ? {
          OR: [
            { name:  { contains: search } },
            { email: { contains: search } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, email: true, image: true,
      createdAt: true, role: true, banned: true,
      _count: { select: { generations: true } },
    },
  });

  // Суммарные платежи по каждому пользователю
  const payments = await prisma.payment.groupBy({
    by: ["userId"],
    where: { status: "succeeded" },
    _sum: { amount: true },
  });
  const payMap = new Map(payments.map(p => [p.userId, p._sum.amount ?? 0]));

  const result = users.map(u => ({
    ...u,
    genCount:   u._count.generations,
    totalSpent: payMap.get(u.id) ?? 0,
  }));

  return NextResponse.json(result);
}
