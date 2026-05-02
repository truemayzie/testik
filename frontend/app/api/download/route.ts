import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  recordWorkActivity,
  WORK_ACTIVITY_ACTIONS,
  WORK_ACTIVITY_SOURCES,
  type WorkActivityAction,
  type WorkActivitySource,
} from "@/lib/workActivity";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | null)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = (await request.json()) as Record<string, unknown>;
  const actRaw = raw._activity;
  delete raw._activity;
  const payload = raw;

  if (actRaw && typeof actRaw === "object" && !Array.isArray(actRaw)) {
    const a = actRaw as Record<string, unknown>;
    const action = a.action;
    const source = a.source;
    if (
      typeof action === "string" &&
      typeof source === "string" &&
      WORK_ACTIVITY_ACTIONS.includes(action as WorkActivityAction) &&
      action === "DOCX_DOWNLOAD" &&
      WORK_ACTIVITY_SOURCES.includes(source as WorkActivitySource)
    ) {
      void recordWorkActivity({
        userId,
        generationId: typeof a.generationId === "string" ? a.generationId : null,
        action: action as WorkActivityAction,
        source: source as WorkActivitySource,
        slug: typeof a.slug === "string" ? a.slug : null,
        workType: typeof a.workType === "string" ? a.workType : null,
      }).catch(() => {});
    }
  }

  const docxRes = await fetch(`${BACKEND_URL}/api/download/referat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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
