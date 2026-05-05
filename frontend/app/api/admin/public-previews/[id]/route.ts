import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAdminUser } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function isBoolOrNull(v: unknown): v is boolean | null {
  return v === null || typeof v === "boolean";
}

/** Ручные отметки Google / Яндекс для публичного превью (Generation с slug). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = params.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const hasGoogle = Object.prototype.hasOwnProperty.call(body, "adminInSearchGoogle");
  const hasYandex = Object.prototype.hasOwnProperty.call(body, "adminInSearchYandex");

  if (!hasGoogle && !hasYandex) {
    return NextResponse.json(
      { error: "Укажите adminInSearchGoogle и/или adminInSearchYandex" },
      { status: 400 }
    );
  }

  const data: Prisma.GenerationUpdateInput = {};
  if (hasGoogle && !isBoolOrNull(body.adminInSearchGoogle)) {
    return NextResponse.json({ error: "adminInSearchGoogle: только boolean или null" }, { status: 400 });
  }
  if (hasYandex && !isBoolOrNull(body.adminInSearchYandex)) {
    return NextResponse.json({ error: "adminInSearchYandex: только boolean или null" }, { status: 400 });
  }
  if (hasGoogle) data.adminInSearchGoogle = body.adminInSearchGoogle as boolean | null;
  if (hasYandex) data.adminInSearchYandex = body.adminInSearchYandex as boolean | null;

  const gen = await prisma.generation.findFirst({
    where: { id, isPublic: true, slug: { not: null } },
    select: { id: true },
  });
  if (!gen) {
    return NextResponse.json({ error: "Превью не найдено" }, { status: 404 });
  }

  await prisma.generation.update({
    where: { id },
    data,
  });

  const out: Record<string, boolean | null> = {};
  if (hasGoogle) out.adminInSearchGoogle = (body.adminInSearchGoogle ?? null) as boolean | null;
  if (hasYandex) out.adminInSearchYandex = (body.adminInSearchYandex ?? null) as boolean | null;

  return NextResponse.json({ ok: true, ...out });
}
