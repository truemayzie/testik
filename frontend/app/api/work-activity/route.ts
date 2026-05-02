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

export const dynamic = "force-dynamic";

/** Клиент: фиксация extras-скачиваний и др., где нельзя встроить _activity в POST /api/download */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | null)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const action = body.action as string;
  const source = body.source as string;
  if (!WORK_ACTIVITY_ACTIONS.includes(action as WorkActivityAction)) {
    return NextResponse.json({ error: "Неизвестный action" }, { status: 400 });
  }
  if (!WORK_ACTIVITY_SOURCES.includes(source as WorkActivitySource)) {
    return NextResponse.json({ error: "Неизвестный source" }, { status: 400 });
  }

  const generationId = typeof body.generationId === "string" ? body.generationId : null;
  const slug = typeof body.slug === "string" ? body.slug : null;
  const workType = typeof body.workType === "string" ? body.workType : null;
  const meta =
    typeof body.meta === "object" && body.meta !== null && !Array.isArray(body.meta)
      ? (body.meta as Record<string, unknown>)
      : null;

  try {
    await recordWorkActivity({
      userId,
      generationId,
      action: action as WorkActivityAction,
      source: source as WorkActivitySource,
      slug,
      workType,
      meta,
    });
  } catch {
    /* не блокируем UX */
  }

  return NextResponse.json({ ok: true });
}
