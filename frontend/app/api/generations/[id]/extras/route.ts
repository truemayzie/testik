import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { updateGenerationExtras } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const userId = (session.user as typeof session.user & { id: string }).id;
  const body   = await request.json();
  const { extras } = body;

  if (!extras || typeof extras !== "object") {
    return NextResponse.json({ error: "Неверный формат extras" }, { status: 400 });
  }

  await updateGenerationExtras(params.id, userId, JSON.stringify(extras));
  return NextResponse.json({ success: true });
}
