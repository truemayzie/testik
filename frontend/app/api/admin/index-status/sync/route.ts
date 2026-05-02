import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminGuard";
import { hasGscServiceAccountConfigured, inspectGoogleIndex } from "@/lib/gscUrlInspect";
import { prisma } from "@/lib/prisma";
import { absolutePublicUrl } from "@/lib/siteOrigin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Как ресурс заведён в GSC: явно или https://host/ из NEXT_PUBLIC_APP_URL */
function resolveGscSiteProperty(): string | undefined {
  const explicit = process.env.GSC_SITE_PROPERTY?.trim();
  if (explicit) return explicit;
  const pub = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!pub || !/^https?:\/\//i.test(pub)) return undefined;
  return `${pub.replace(/\/+$/, "")}/`;
}

/**
 * POST: обновить кэш статуса индекса Google (URL Inspection) для части URL.
 * Тело: { source?: "seo"|"preview"|"all", limit?: number } (limit по умолчанию 30, макс 100).
 *
 * Переменные окружения:
 * - GSC_SITE_PROPERTY — как в Search Console: https://ref-ai.ru/ или sc-domain:ref-ai.ru
 * - GOOGLE_APPLICATION_CREDENTIALS — путь к JSON сервисного аккаунта
 *   или GSC_SERVICE_ACCOUNT_JSON — сам JSON одной строкой
 * Сервисный аккаунт нужно добавить в GSC с правами «Полный» на этот ресурс.
 */
export async function POST(req: NextRequest) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const siteProp = resolveGscSiteProperty();
  if (!siteProp) {
    return NextResponse.json(
      {
        error:
          "Не задан ресурс GSC: укажите GSC_SITE_PROPERTY (напр. https://ref-ai.ru/) или sc-domain:ref-ai.ru, либо NEXT_PUBLIC_APP_URL=https://ref-ai.ru (возьмём https://ref-ai.ru/)",
      },
      { status: 400 }
    );
  }

  if (!hasGscServiceAccountConfigured()) {
    return NextResponse.json(
      {
        error:
          "Нет ключа сервисного аккаунта Google для Search Console API (файл не найден или GSC_SERVICE_ACCOUNT_JSON битый JSON).",
        setupSteps: [
          "1) console.cloud.google.com → проект → «APIs & Services» → включить «Google Search Console API».",
          "2) «Credentials» → Create credentials → Service account → создать → Keys → Add key → JSON → скачать файл.",
          "3) Положить на сервер, напр.: /var/www/ref-ai/frontend/secrets/gsc-sa.json ( chmod 600 ).",
          "4) В frontend/.env.local добавить строку: GOOGLE_APPLICATION_CREDENTIALS=/var/www/ref-ai/frontend/secrets/gsc-sa.json",
          "5) search.google.com/search-console → твой сайт → Параметры → Пользователи → Добавить пользователя → вставить email сервисного аккаунта из JSON (поле client_email) с правом «Полный».",
          "6) pm2 restart frontend --update-env",
        ],
      },
      { status: 501 }
    );
  }

  let body: { source?: string; limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const limit = Math.min(100, Math.max(1, Number(body.limit) || 30));
  const source = body.source ?? "all";

  const urls: string[] = [];
  if (source === "seo" || source === "all") {
    const pages = await prisma.seoPage.findMany({
      select: { workType: true, slug: true },
    });
    for (const p of pages) {
      urls.push(absolutePublicUrl(`/${p.workType}/${p.slug}`));
    }
  }
  if (source === "preview" || source === "all") {
    const gens = await prisma.generation.findMany({
      where: { isPublic: true, slug: { not: null } },
      select: { slug: true },
    });
    for (const g of gens) {
      if (g.slug) urls.push(absolutePublicUrl(`/preview/${g.slug}`));
    }
  }

  const unique = Array.from(new Set(urls));
  const existing = await prisma.urlIndexStatus.findMany({
    where: { url: { in: unique } },
    select: { url: true, googleLastCheck: true },
  });
  const t = new Map(existing.map((e) => [e.url, e.googleLastCheck?.getTime() ?? 0]));
  unique.sort((a, b) => (t.get(a) ?? 0) - (t.get(b) ?? 0));

  const batch = unique.slice(0, limit);
  const results: Array<{ url: string; ok: boolean; verdict?: string | null; error?: string }> = [];

  for (const url of batch) {
    try {
      const r = await inspectGoogleIndex(url, siteProp);
      if (r.error === "missing_credentials" || r.error === "no_access_token") {
        return NextResponse.json(
          {
            error:
              "Нет учётных данных Google: задайте GOOGLE_APPLICATION_CREDENTIALS или GSC_SERVICE_ACCOUNT_JSON",
            partial: results,
          },
          { status: 501 }
        );
      }
      if (r.error) {
        results.push({ url, ok: false, error: r.error });
      } else {
        const now = new Date();
        await prisma.urlIndexStatus.upsert({
          where: { url },
          create: {
            url,
            googleVerdict: r.verdict,
            googleCoverageState: r.coverageState,
            googleLastCheck: now,
          },
          update: {
            googleVerdict: r.verdict,
            googleCoverageState: r.coverageState,
            googleLastCheck: now,
          },
        });
        results.push({ url, ok: true, verdict: r.verdict });
      }
    } catch (e: unknown) {
      results.push({ url, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    await sleep(280);
  }

  return NextResponse.json({
    processed: results.length,
    siteProperty: siteProp,
    results,
  });
}
