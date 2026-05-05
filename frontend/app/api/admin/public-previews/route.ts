import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAdminUser } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";
import { WORK_PRICES } from "@/lib/prices";
import { canonicalPublicUrl } from "@/lib/siteOrigin";

export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 200;

function applyIndexedTriState(
  where: Prisma.GenerationWhereInput,
  indexedRaw: string | null,
  field: "adminInSearchGoogle" | "adminInSearchYandex"
) {
  if (indexedRaw == null) return;
  const v = indexedRaw.trim().toLowerCase();
  if (!v || v === "all") return;
  if (v === "yes" || v === "1" || v === "true") {
    where[field] = true;
    return;
  }
  if (v === "no" || v === "0" || v === "false") {
    where[field] = false;
    return;
  }
  if (v === "unset") {
    where[field] = null;
  }
}

/** Продающие страницы `/preview/{slug}` из генераций (`isPublic` + `slug`). */
export async function GET(req: NextRequest) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const search = (sp.get("search") || "").trim();
  const workType = (sp.get("workType") || "").trim();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(10, parseInt(sp.get("pageSize") || "50", 10)));

  const where: Prisma.GenerationWhereInput = {
    isPublic: true,
    slug: { not: null },
  };

  if (workType) where.workType = workType;
  if (search) {
    where.OR = [{ topic: { contains: search } }, { slug: { contains: search } }];
  }

  applyIndexedTriState(where, sp.get("indexedGoogle"), "adminInSearchGoogle");
  applyIndexedTriState(where, sp.get("indexedYandex"), "adminInSearchYandex");

  const [total, rows, byWorkType] = await Promise.all([
    prisma.generation.count({ where }),
    prisma.generation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        slug: true,
        topic: true,
        workType: true,
        pages: true,
        adminInSearchGoogle: true,
        adminInSearchYandex: true,
        createdAt: true,
      },
    }),
    prisma.generation.groupBy({
      by: ["workType"],
      where,
      _count: { _all: true },
    }),
  ]);

  const summary = byWorkType
    .map((g) => ({
      workType: g.workType,
      count: g._count._all,
      label: WORK_PRICES[g.workType]?.label ?? g.workType,
    }))
    .sort((a, b) => b.count - a.count);

  const pages = rows
    .filter((r): r is typeof r & { slug: string } => r.slug != null)
    .map((r) => {
      const path = `/preview/${r.slug}`;
      return {
        id: r.id,
        slug: r.slug,
        topic: r.topic,
        workType: r.workType,
        pages: r.pages,
        adminInSearchGoogle: r.adminInSearchGoogle,
        adminInSearchYandex: r.adminInSearchYandex,
        createdAt: r.createdAt,
        path,
        fullUrl: canonicalPublicUrl(path),
      };
    });

  return NextResponse.json({
    pages,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    byWorkType: summary,
  });
}
