import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncPaymentFromYookassa } from "@/lib/yookassa";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | null)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const payment = await prisma.payment.findFirst({
    where: { id, userId },
    select: { id: true, status: true, workType: true, yokassaId: true, provider: true },
  });

  if (!payment) {
    return NextResponse.json({ status: "not_found" });
  }

  let status = payment.status;
  if (payment.yokassaId && payment.provider === "yookassa") {
    status = await syncPaymentFromYookassa(payment);
  }

  return NextResponse.json({ status, workType: payment.workType });
}
