import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAdminUser } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function isBoolOrNull(v: unknown): v is boolean | null {
  return v === null || typeof v === "boolean";
}

/** Ручные отметки «в индексе» Google / Яндекс для строки SeoPage (по одному или оба поля). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
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

  const data: Prisma.SeoPageUpdateInput = {};
  if (hasGoogle && !isBoolOrNull(body.adminInSearchGoogle)) {
    return NextResponse.json({ error: "adminInSearchGoogle: только boolean или null" }, { status: 400 });
  }
  if (hasYandex && !isBoolOrNull(body.adminInSearchYandex)) {
    return NextResponse.json({ error: "adminInSearchYandex: только boolean или null" }, { status: 400 });
  }
  if (hasGoogle) data.adminInSearchGoogle = body.adminInSearchGoogle as boolean | null;
  if (hasYandex) data.adminInSearchYandex = body.adminInSearchYandex as boolean | null;

  try {
    await prisma.seoPage.update({
      where: { id },
      data,
    });
  } catch {
    return NextResponse.json({ error: "Страница не найдена" }, { status: 404 });
  }

  const out: Record<string, boolean | null> = {};
  if (hasGoogle) out.adminInSearchGoogle = (body.adminInSearchGoogle ?? null) as boolean | null;
  if (hasYandex) out.adminInSearchYandex = (body.adminInSearchYandex ?? null) as boolean | null;

  return NextResponse.json({ ok: true, ...out });
}
