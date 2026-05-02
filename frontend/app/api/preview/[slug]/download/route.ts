import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordWorkActivity } from "@/lib/workActivity";

export async function POST(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const userId = (session.user as typeof session.user & { id: string }).id;

  const generation = await prisma.generation.findUnique({
    where: { slug: params.slug },
    select: { id: true, userId: true, result: true, slug: true, workType: true },
  });

  if (!generation || generation.userId !== userId) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  void recordWorkActivity({
    userId,
    generationId: generation.id,
    action: "DOCX_DOWNLOAD",
    source: "preview",
    slug: generation.slug,
    workType: generation.workType,
  }).catch(() => {});

  const result = JSON.parse(generation.result);

  const docxRes = await fetch("http://127.0.0.1:8000/api/download/referat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });

  if (!docxRes.ok) {
    return NextResponse.json({ error: "Ошибка генерации файла" }, { status: 500 });
  }

  const blob = await docxRes.arrayBuffer();
  return new NextResponse(blob, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="referat.docx"`,
    },
  });
}
