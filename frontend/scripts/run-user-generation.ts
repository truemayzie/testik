/**
 * Разовый запуск генерации от имени пользователя (оплаченный платёж + поллинг до готовности).
 * Запуск: cd frontend && npx tsx scripts/run-user-generation.ts
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { createRunningGeneration, finalizeRunningGeneration } from "../lib/db";
import type { ReferatResult } from "../lib/db";
import { tgNotify } from "../lib/tgNotify";

const USER_ID = "cmpa23dx40002xfx7cr3w66zr";
const TOPIC =
  "Мои знаменитые земляки и их вклад в развитие медицины, науки, образования, искусства";
const WORK_TYPE = "Эссе";
const PAGES = 5;
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { id: USER_ID },
    select: {
      id: true,
      fullName: true,
      email: true,
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
  if (!user) throw new Error("User not found");

  const payment = await prisma.payment.findFirst({
    where: { userId: USER_ID, workType: WORK_TYPE, status: "succeeded", usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!payment) throw new Error("No unused succeeded payment");

  const claimed = await prisma.payment.updateMany({
    where: { id: payment.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) throw new Error("Payment already used");

  const { id: _id, fullName, email, ...profile } = user;
  const startRes = await fetch(`${BACKEND_URL}/api/generate/referat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: TOPIC,
      pages: PAGES,
      work_type: WORK_TYPE,
      profile,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!startRes.ok) {
    await prisma.payment.update({ where: { id: payment.id }, data: { usedAt: null } });
    throw new Error(`Backend start failed: ${startRes.status} ${await startRes.text()}`);
  }
  const { jobId } = (await startRes.json()) as { jobId?: string };
  if (!jobId) throw new Error("No jobId");

  const running = await createRunningGeneration({
    userId: USER_ID,
    topic: TOPIC,
    pages: PAGES,
    workType: WORK_TYPE,
    jobId,
  });

  console.log("Started:", { jobId, generationId: running.id, topic: TOPIC });
  tgNotify(
    `🛠 <b>Ручной запуск генерации</b>\n👤 ${fullName || USER_ID}\n📄 ${WORK_TYPE}: «${TOPIC}»`,
  );

  for (let i = 0; i < 240; i++) {
    await sleep(5000);
    const statusRes = await fetch(`${BACKEND_URL}/api/generate/status/${jobId}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!statusRes.ok) {
      console.log(`poll ${i}: status HTTP ${statusRes.status}`);
      continue;
    }
    const st = (await statusRes.json()) as { status?: string; error?: string };
    if (st.status === "running") {
      console.log(`poll ${i}: running`);
      continue;
    }
    if (st.status === "error") {
      await prisma.payment.update({ where: { id: payment.id }, data: { usedAt: null } });
      throw new Error(st.error || "backend error");
    }
    if (st.status === "done") {
      const resultRes = await fetch(`${BACKEND_URL}/api/generate/result/${jobId}`, {
        signal: AbortSignal.timeout(120_000),
      });
      if (!resultRes.ok) throw new Error(`result fetch ${resultRes.status}`);
      const data = (await resultRes.json()) as ReferatResult & { _cost_usd?: number };
      const saved = await finalizeRunningGeneration({
        id: running.id,
        userId: USER_ID,
        result: data,
      });
      if (!saved) throw new Error("finalizeRunningGeneration returned null");
      await fetch(`${BACKEND_URL}/api/generate/job/${jobId}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(5_000),
      }).catch(() => {});
      console.log("Done:", saved.slug, saved.id);
      tgNotify(`✅ <b>Ручная генерация готова</b>\n👤 ${fullName}\n📄 ${WORK_TYPE}\n🔗 /preview/${saved.slug}`);
      return;
    }
    console.log(`poll ${i}:`, st.status);
  }
  throw new Error("Timeout waiting for job");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
