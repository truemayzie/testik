import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { id?: string } | null)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const docxRes = await fetch(`${BACKEND_URL}/api/download/referat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
