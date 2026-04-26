import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/feedback/comment
 * Body: { generationId: string, issues: string[], comment?: string }
 * Сохраняет детальный фидбэк в FeedbackComment.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  const { generationId, issues, comment } = await request.json();
  if (!generationId || !Array.isArray(issues)) {
    return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
  }

  await prisma.feedbackComment.create({
    data: {
      generationId,
      issues:  JSON.stringify(issues),
      comment: comment || null,
    },
  });

  return NextResponse.json({ ok: true });
}
