import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tgNotify } from "@/lib/tgNotify";
import { internalApiHeaders } from "@/lib/internalApi";
import { prepareTopic } from "@/lib/topicValidate";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

/** Как у клиента (sessionStorage) — не держим вечный кэш */
const PREVIEW_DEDUP_TTL_MS = 2 * 60 * 60 * 1000;

const ALLOWED_TYPES: readonly string[] = [
  "Сочинение",
  "Эссе",
  "Доклад",
  "Реферат",
  "Курсовая",
  "ВКР",
  "Тест",
];

function previewDedupeKey(userId: string, workType: string, topic: string): string {
  return `${userId}\n${workType}\n${topic}`;
}

type ResolvedPreview = { previewJson: Record<string, unknown>; savedAt: number };

const previewResolvedCache = new Map<string, ResolvedPreview>();
const previewInflight = new Map<string, Promise<ResolvedPreview>>();

function sweepResolvedPreviewCache(now: number) {
  if (previewResolvedCache.size < 500) return;
  for (const [k, v] of Array.from(previewResolvedCache.entries())) {
    if (now - v.savedAt > PREVIEW_DEDUP_TTL_MS) previewResolvedCache.delete(k);
  }
}

class PreviewGenHttpError extends Error {
  constructor(readonly response: NextResponse) {
    super("PreviewGenHttpError");
    this.name = "PreviewGenHttpError";
  }
}

async function generatePreviewOnce(
  topic: string,
  workType: string,
  user: {
    id: string;
    role: string;
    fullName: string | null;
    name: string | null;
    email: string | null;
  },
): Promise<Record<string, unknown>> {
  let previewJson: Record<string, unknown>;
  try {
    const res = await fetch(`${BACKEND_URL}/api/generate/preview`, {
      method: "POST",
      headers: internalApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ topic, work_type: workType }),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new PreviewGenHttpError(
        NextResponse.json({ error: "Некорректный ответ сервера генерации" }, { status: 502 }),
      );
    }
    if (!res.ok) {
      const detail = (parsed as { detail?: unknown })?.detail;
      const msg =
        typeof detail === "string"
          ? detail
          : detail && typeof detail === "object" && "message" in detail
            ? String((detail as { message?: unknown }).message)
            : "Ошибка генерации превью";
      throw new PreviewGenHttpError(
        NextResponse.json({ error: msg }, { status: res.status >= 400 && res.status < 600 ? res.status : 502 }),
      );
    }
    if (!parsed || typeof parsed !== "object") {
      throw new PreviewGenHttpError(
        NextResponse.json({ error: "Пустой ответ превью" }, { status: 502 }),
      );
    }
    previewJson = parsed as Record<string, unknown>;
  } catch (e) {
    if (e instanceof PreviewGenHttpError) throw e;
    console.error("[generate/preview]", e);
    throw new PreviewGenHttpError(
      NextResponse.json({ error: "Сервер генерации недоступен" }, { status: 503 }),
    );
  }

  const who = user.fullName || user.name || user.email || user.id;
  const topicShort = topic.length > 140 ? `${topic.slice(0, 140)}…` : topic;
  const costRaw = previewJson._cost_usd;
  let costStr = "";
  if (typeof costRaw === "number" && Number.isFinite(costRaw)) {
    costStr = `\n💰 ~$${costRaw.toFixed(4)}`;
  } else if (typeof costRaw === "string") {
    const n = Number(costRaw);
    if (!Number.isNaN(n)) costStr = `\n💰 ~$${n.toFixed(4)}`;
  }
  const adminTag = user.role === "admin" ? " <i>(админ)</i>" : "";
  tgNotify(`👁 <b>Предпросмотр до оплаты</b>${adminTag}\n👤 ${who}\n📄 ${workType}: «${topicShort}»${costStr}`);

  return previewJson;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const sessionUserId = (session?.user as { id?: string } | null)?.id;
  if (!session?.user || !sessionUserId) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  let body: { topic?: string; workType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  function normalizeWorkType(raw?: string): string {
    const s = String(raw ?? "").trim().toLowerCase();
    for (const t of ALLOWED_TYPES) {
      if (t.toLowerCase() === s) return t;
    }
    if (s.includes("курсов")) return "Курсовая";
    if (s.includes("диплом") || s.includes("вкр")) return "ВКР";
    return "Реферат";
  }

  const workType = normalizeWorkType(body.workType);

  const prepared = prepareTopic(String(body.topic ?? ""));
  if (!prepared.ok) {
    return NextResponse.json({ error: prepared.message }, { status: 400 });
  }
  const topic = prepared.topic;

  const user = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: {
      id: true,
      role: true,
      fullName: true,
      name: true,
      email: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  const dKey = previewDedupeKey(sessionUserId, workType, topic);
  const now = Date.now();

  const hit = previewResolvedCache.get(dKey);
  if (hit && now - hit.savedAt <= PREVIEW_DEDUP_TTL_MS) {
    return NextResponse.json(hit.previewJson);
  }

  let inflightPromise = previewInflight.get(dKey);
  if (inflightPromise) {
    try {
      const awaited = await inflightPromise;
      return NextResponse.json(awaited.previewJson);
    } catch (e) {
      if (e instanceof PreviewGenHttpError) return e.response;
      throw e;
    }
  }

  inflightPromise = (async (): Promise<ResolvedPreview> => {
    try {
      const previewJson = await generatePreviewOnce(topic, workType, user);
      const boxed = { previewJson, savedAt: Date.now() };
      previewResolvedCache.set(dKey, boxed);
      sweepResolvedPreviewCache(boxed.savedAt);
      return boxed;
    } finally {
      previewInflight.delete(dKey);
    }
  })();

  previewInflight.set(dKey, inflightPromise);

  try {
    const resolved = await inflightPromise;
    return NextResponse.json(resolved.previewJson);
  } catch (e) {
    if (e instanceof PreviewGenHttpError) return e.response;
    console.error("[generate/preview] unexpected", e);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}
