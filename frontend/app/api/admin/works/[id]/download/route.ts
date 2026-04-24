import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const generation = await prisma.generation.findUnique({
    where: { id: params.id },
    select: { result: true, topic: true },
  });

  if (!generation) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  const result = JSON.parse(generation.result);

  const docxRes = await fetch("http://localhost:8000/api/download/referat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });

  if (!docxRes.ok) {
    return NextResponse.json({ error: "Ошибка генерации файла" }, { status: 500 });
  }

  const blob = await docxRes.arrayBuffer();
  const filename = encodeURIComponent((generation.topic || "work").slice(0, 60)) + ".docx";

  return new NextResponse(blob, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
