import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { id?: string } | null)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/download/presentation/${params.jobId}`,
      { signal: AbortSignal.timeout(30_000) },
    );
    if (!res.ok) {
      return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
    }
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": "attachment; filename=presentation.pptx",
      },
    });
  } catch {
    return NextResponse.json({ error: "Backend недоступен" }, { status: 503 });
  }
}
