import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createPreviewTask, listPendingPreviewTasks } from "@/lib/previewTask";
import { prepareTopic } from "@/lib/topicValidate";
import { WORK_PAGES } from "@/lib/prices";

const ALLOWED = new Set([
  "Сочинение",
  "Эссе",
  "Доклад",
  "Реферат",
  "Курсовая",
  "ВКР",
  "Тест",
]);

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | null)?.id;
  if (!session?.user || !userId) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  const tasks = await listPendingPreviewTasks(userId);
  return NextResponse.json(
    tasks.map((t) => ({
      id: t.id,
      topic: t.topic,
      workType: t.workType,
      pages: t.pages,
      createdAt: t.createdAt.toISOString(),
      status: "awaiting_payment" as const,
    })),
  );
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | null)?.id;
  if (!session?.user || !userId) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  let body: { topic?: string; workType?: string; pages?: number; extras?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const rawType = String(body.workType ?? "Реферат").trim();
  const workType = ALLOWED.has(rawType) ? rawType : "Реферат";
  const prepared = prepareTopic(String(body.topic ?? ""));
  if (!prepared.ok) {
    return NextResponse.json({ error: prepared.message }, { status: 400 });
  }

  const range = WORK_PAGES[workType];
  let pages = typeof body.pages === "number" ? Math.round(body.pages) : range?.default ?? 20;
  if (range) {
    pages = Math.min(range.max, Math.max(range.min, pages));
  }

  const extras = Array.isArray(body.extras)
    ? body.extras.filter((x): x is string => typeof x === "string")
    : [];

  const task = await createPreviewTask({
    userId,
    topic: prepared.topic,
    workType,
    pages,
    extras,
  });

  return NextResponse.json({ id: task.id });
}
