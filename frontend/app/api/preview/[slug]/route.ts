import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const generation = await prisma.generation.findUnique({
    where: { slug: params.slug, isPublic: true },
    select: {
      id: true, topic: true, workType: true,
      pages: true, createdAt: true, result: true,
    },
  });

  if (!generation) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  const result = JSON.parse(generation.result);

  // Возвращаем только превью — первые 2 предложения каждого раздела
  const previewContent: Record<string, string> = {};
  for (const [key, value] of Object.entries(result.content as Record<string, string>)) {
    const sentences = value.match(/[^.!?]+[.!?]+/g) || [];
    previewContent[key] = sentences.slice(0, 2).join(" ").trim();
  }

  return NextResponse.json({
    topic:          generation.topic,
    workType:       generation.workType,
    pages:          generation.pages,
    createdAt:      generation.createdAt,
    structure:      result.structure,
    previewContent,
    sources:        (result.sources as string[]).slice(0, 3),
  });
}
