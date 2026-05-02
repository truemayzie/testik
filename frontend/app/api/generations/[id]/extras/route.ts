import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { updateGenerationExtras } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { tgNotify } from "@/lib/tgNotify";

function parseExtrasJson(s: string | null): Record<string, unknown> {
  if (!s) return {};
  try {
    const o = JSON.parse(s) as unknown;
    return typeof o === "object" && o !== null && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isJobRef(v: unknown): v is string {
  return typeof v === "string" && v.length >= 8;
}

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

  const genBefore = await prisma.generation.findFirst({
    where: { id: params.id, userId },
    select: { extras: true, topic: true, workType: true },
  });

  if (!genBefore) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  const prevExtras = parseExtrasJson(genBefore.extras);
  const extrasObj  = extras as Record<string, unknown>;

  await updateGenerationExtras(params.id, userId, JSON.stringify(extras));

  const presentationNew =
    isJobRef(extrasObj.presentation) &&
    (!isJobRef(prevExtras.presentation) || extrasObj.presentation !== prevExtras.presentation);
  const speechNew =
    isJobRef(extrasObj.speech) &&
    (!isJobRef(prevExtras.speech) || extrasObj.speech !== prevExtras.speech);

  if (presentationNew || speechNew) {
    const extraLabels: string[] = [];
    if (presentationNew) extraLabels.push("презентация");
    if (speechNew) extraLabels.push("текст выступления");

    prisma.user
      .findUnique({ where: { id: userId }, select: { fullName: true } })
      .then((u) => {
        const name = u?.fullName || userId;
        tgNotify(
          `✅ <b>Дополнительные материалы готовы</b>\n👤 ${name}\n📄 ${genBefore.workType}: «${genBefore.topic}»\n📎 ${extraLabels.join(", ")}`
        );
      })
      .catch(() => {
        tgNotify(
          `✅ <b>Дополнительные материалы готовы</b>\n👤 ${userId}\n📄 ${genBefore.workType}: «${genBefore.topic}»\n📎 ${extraLabels.join(", ")}`
        );
      });
  }

  return NextResponse.json({ success: true });
}
