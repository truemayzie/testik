/**
 * Разовая ВКР по фиксированному плану → аккаунт по email (без оплаты).
 * cd frontend && npx tsx scripts/run-oneoff-vkr-didactic.ts
 */
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env.local") });
dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../../backend/.env") });
import { prisma } from "../lib/prisma";
import { createRunningGeneration, finalizeRunningGeneration } from "../lib/db";
import type { ReferatResult } from "../lib/db";
import { internalApiHeaders } from "../lib/internalApi";

const EMAIL = process.env.ONEOFF_EMAIL || "irotow@yandex.ru";
const PAGES = Number(process.env.ONEOFF_PAGES || "55");
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const TOPIC =
  "Дидактические игры как средство формирования знаний о времени у детей старшего дошкольного возраста";

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: EMAIL },
    select: {
      id: true,
      email: true,
      name: true,
      fullName: true,
      university: true,
      faculty: true,
      department: true,
      speciality: true,
      discipline: true,
      course: true,
      groupNumber: true,
      teacherName: true,
      city: true,
    },
  });

  if (!user) {
    console.error(`Пользователь ${EMAIL} не найден. Нужен хотя бы один вход на сайт.`);
    process.exit(1);
  }

  const { id: _id, email, name, fullName, ...profile } = user;
  console.log("User:", user.id, fullName || name || email);

  const startRes = await fetch(`${BACKEND_URL}/api/generate/oneoff-vkr-didactic-time`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...internalApiHeaders(),
    },
    body: JSON.stringify({ pages: PAGES, profile }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!startRes.ok) {
    console.error("Start failed:", startRes.status, await startRes.text());
    process.exit(1);
  }

  const { jobId } = (await startRes.json()) as { jobId?: string };
  if (!jobId) {
    console.error("No jobId");
    process.exit(1);
  }

  const running = await createRunningGeneration({
    userId: user.id,
    topic: TOPIC,
    pages: PAGES,
    workType: "ВКР",
    jobId,
  });

  console.log("Started:", { jobId, generationId: running.id, topic: TOPIC, pages: PAGES });

  for (let i = 0; i < 360; i++) {
    await sleep(5000);
    const statusRes = await fetch(`${BACKEND_URL}/api/generate/status/${jobId}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!statusRes.ok) {
      console.log(`poll ${i}: HTTP ${statusRes.status}`);
      continue;
    }
    const st = (await statusRes.json()) as { status?: string; error?: string; progress?: unknown };
    if (st.status === "running") {
      const p = st.progress as { percent?: number; label?: string } | undefined;
      console.log(`poll ${i}:`, p?.percent ?? "?", p?.label ?? "running");
      continue;
    }
    if (st.status === "error") {
      console.error("Job error:", st.error);
      process.exit(1);
    }
    if (st.status === "done") {
      const resultRes = await fetch(`${BACKEND_URL}/api/generate/result/${jobId}`, {
        signal: AbortSignal.timeout(180_000),
      });
      if (!resultRes.ok) {
        console.error("Result fetch failed:", resultRes.status);
        process.exit(1);
      }
      const data = (await resultRes.json()) as ReferatResult & { _cost_usd?: number };
      const saved = await finalizeRunningGeneration({
        id: running.id,
        userId: user.id,
        result: data,
      });
      if (!saved) {
        console.error("finalize failed");
        process.exit(1);
      }
      await fetch(`${BACKEND_URL}/api/generate/job/${jobId}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(5_000),
      }).catch(() => {});
      console.log("\n✅ Готово!");
      console.log("Generation id:", saved.id);
      console.log("Slug:", saved.slug);
      console.log("Preview:", `https://ref-ai.ru/preview/${saved.slug}`);
      console.log("Dashboard: https://ref-ai.ru/dashboard");
      console.log("Cost USD:", data._cost_usd);
      return;
    }
  }

  console.error("Timeout");
  process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
