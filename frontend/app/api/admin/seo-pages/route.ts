import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";
import { SEO_WORK_TYPE_LABELS } from "@/lib/seo-work-type-labels";
import { absolutePublicUrl } from "@/lib/siteOrigin";

export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 200;

/**
 * Список SEO-страниц (Prisma `SeoPage`) для админки:
 * сколько страниц, фильтр по типу, поиск по slug/title/subject/meta.
 */
export async function GET(req: NextRequest) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const search = (sp.get("search") || "").trim();
  const workType = (sp.get("workType") || "").trim();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(10, parseInt(sp.get("pageSize") || "100", 10)));

  const where: {
    workType?: string;
    OR?: Array<{
      slug?: { contains: string };
      title?: { contains: string };
      subject?: { contains: string };
      metaTitle?: { contains: string };
    }>;
  } = {};

  if (workType) where.workType = workType;
  if (search) {
    where.OR = [
      { slug: { contains: search } },
      { title: { contains: search } },
      { subject: { contains: search } },
      { metaTitle: { contains: search } },
    ];
  }

  const [total, rows, byWorkType] = await Promise.all([
    prisma.seoPage.count({ where }),
    prisma.seoPage.findMany({
      where,
      orderBy: [{ workType: "asc" }, { slug: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        slug: true,
        workType: true,
        subject: true,
        title: true,
        metaTitle: true,
        metaDescription: true,
        previewText: true,
        bodyText: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.seoPage.groupBy({
      by: ["workType"],
      _count: { _all: true },
    }),
  ]);

  const summary = byWorkType
    .map((g) => ({
      workType: g.workType,
      count: g._count._all,
      label: SEO_WORK_TYPE_LABELS[g.workType] ?? g.workType,
    }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    pages: rows.map((p) => {
      const path = `/${p.workType}/${p.slug}`;
      return {
        ...p,
        path,
        fullUrl: absolutePublicUrl(path),
        previewLen: p.previewText?.length ?? 0,
        bodyLen: p.bodyText?.length ?? 0,
      };
    }),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    byWorkType: summary,
  });
}
