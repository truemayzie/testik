import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tgNotify } from "@/lib/tgNotify";
import { internalApiHeaders } from "@/lib/internalApi";
import { tryConsumePreviewSlot, releasePreviewSlot } from "@/lib/previewQuota";
import { prepareTopic } from "@/lib/topicValidate";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

const ALLOWED_TYPES = new Set([
  "Сочинение",
  "Эссе",
  "Доклад",
  "Реферат",
  "Курсовая",
  "ВКР",
  "Тест",
]);

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

  const rawType = String(body.workType ?? "Реферат").trim();
  const workType = ALLOWED_TYPES.has(rawType) ? rawType : "Реферат";

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
      freePreviewUses: true,
      freePreviewQuota: true,
      fullName: true,
      name: true,
      email: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  const isAdmin = user.role === "admin";
  const quota = Math.max(0, user.freePreviewQuota ?? 1);
  const used = Math.max(0, user.freePreviewUses ?? 0);

  if (!isAdmin && used >= quota) {
    return NextResponse.json(
      { error: "Лимит бесплатных предпросмотров исчерпан", code: "PREVIEW_USED" },
      { status: 403 },
    );
  }

  let slotReserved = false;
  if (!isAdmin) {
    const ok = await tryConsumePreviewSlot(user.id, quota);
    if (!ok) {
      return NextResponse.json(
        { error: "Лимит бесплатных предпросмотров исчерпан", code: "PREVIEW_USED" },
        { status: 403 },
      );
    }
    slotReserved = true;
  }

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
      if (slotReserved) await releasePreviewSlot(user.id);
      return NextResponse.json({ error: "Некорректный ответ сервера генерации" }, { status: 502 });
    }
    if (!res.ok) {
      if (slotReserved) await releasePreviewSlot(user.id);
      const detail = (parsed as { detail?: unknown })?.detail;
      const msg =
        typeof detail === "string"
          ? detail
          : detail && typeof detail === "object" && "message" in detail
            ? String((detail as { message?: unknown }).message)
            : "Ошибка генерации превью";
      return NextResponse.json({ error: msg }, { status: res.status >= 400 && res.status < 600 ? res.status : 502 });
    }
    if (!parsed || typeof parsed !== "object") {
      if (slotReserved) await releasePreviewSlot(user.id);
      return NextResponse.json({ error: "Пустой ответ превью" }, { status: 502 });
    }
    previewJson = parsed as Record<string, unknown>;
  } catch (e) {
    if (slotReserved) await releasePreviewSlot(user.id);
    console.error("[generate/preview]", e);
    return NextResponse.json({ error: "Сервер генерации недоступен" }, { status: 503 });
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
  const adminTag = isAdmin ? " <i>(админ)</i>" : "";
  tgNotify(`👁 <b>Предпросмотр до оплаты</b>${adminTag}\n👤 ${who}\n📄 ${workType}: «${topicShort}»${costStr}`);

  return NextResponse.json(previewJson);
}
