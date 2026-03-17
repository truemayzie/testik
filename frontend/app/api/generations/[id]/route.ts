// app/api/generations/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGeneration, deleteGeneration } from "@/lib/db";

// GET — получить одну генерацию с полным содержимым
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const userId = (session.user as typeof session.user & { id: string }).id;
  const generation = await getGeneration(params.id, userId);

  if (!generation) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  return NextResponse.json(generation);
}

// DELETE — удалить генерацию
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const userId = (session.user as typeof session.user & { id: string }).id;
  await deleteGeneration(params.id, userId);
  return NextResponse.json({ success: true });
}
