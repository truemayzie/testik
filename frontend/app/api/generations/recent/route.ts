import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Публичный эндпоинт — только тема, тип работы, дата (без личных данных)
export async function GET() {
  try {
    const generations = await prisma.generation.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, topic: true, workType: true, createdAt: true },
    });
    return NextResponse.json(generations);
  } catch {
    return NextResponse.json([]);
  }
}
