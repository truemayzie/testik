import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const event = await request.json();

    if (event.type === "payment.succeeded") {
      const yokassaId = event.object?.id;
      if (yokassaId) {
        await prisma.payment.updateMany({
          where: { yokassaId },
          data: { status: "succeeded" },
        });
      }
    }

    if (event.type === "payment.canceled") {
      const yokassaId = event.object?.id;
      if (yokassaId) {
        await prisma.payment.updateMany({
          where: { yokassaId },
          data: { status: "cancelled" },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
