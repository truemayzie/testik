import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  deletePreviewTaskForUser,
  getPreviewTaskForUser,
  parseTaskExtras,
} from "@/lib/previewTask";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | null)?.id;
  if (!session?.user || !userId) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  const task = await getPreviewTaskForUser(params.id, userId);
  if (!task) {
    return NextResponse.json({ error: "Заказ не найден или истёк" }, { status: 404 });
  }

  return NextResponse.json({
    id: task.id,
    topic: task.topic,
    workType: task.workType,
    pages: task.pages,
    extras: parseTaskExtras(task.extras),
    createdAt: task.createdAt.toISOString(),
    status: "awaiting_payment",
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | null)?.id;
  if (!session?.user || !userId) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  const ok = await deletePreviewTaskForUser(params.id, userId);
  if (!ok) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
