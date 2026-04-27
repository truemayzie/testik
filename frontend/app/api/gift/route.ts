import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | null)?.id;
  if (!userId) return NextResponse.json({ hasGift: false });

  const gift = await prisma.payment.findFirst({
    where: {
      userId,
      status: "succeeded",
      usedAt: null,
      yokassaId: { startsWith: "gift_" },
    },
  });

  return NextResponse.json({
    hasGift: !!gift,
    workType: gift?.workType ?? null,
  });
}
