import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGenerationByPreviewTaskId } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { taskId: string } },
) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | null)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  const gen = await getGenerationByPreviewTaskId(userId, params.taskId);
  if (!gen) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  return NextResponse.json(gen);
}
