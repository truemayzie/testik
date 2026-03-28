/**
 * Фоновый монитор состояния системы.
 * Запускается один раз при старте Next.js через instrumentation.ts.
 * Каждые 5 минут проверяет доступность компонентов и сохраняет результат в БД.
 */

import { prisma } from "@/lib/prisma";

const BACKEND_URL  = process.env.BACKEND_URL  || "http://localhost:8000";
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 минут
const KEEP_RECORDS  = 100; // сколько последних записей хранить

export async function runHealthCheck(): Promise<void> {
  const errors: Record<string, string> = {};
  const results = { frontend: true, backend: false, database: false, groq: false };

  // Backend: FastAPI на порту 8000
  try {
    const res = await fetch(`${BACKEND_URL}/`, {
      signal: AbortSignal.timeout(5_000),
    });
    results.backend = true; // любой ответ — бэкенд жив
    void res; // consume to avoid leak
  } catch (err) {
    errors.backend = String(err);
  }

  // Database: простой запрос к SQLite
  try {
    await prisma.user.count();
    results.database = true;
  } catch (err) {
    errors.database = String(err);
  }

  // Groq/API: проверяем наличие ключа в backend .env
  try {
    const fs = await import("fs");
    const envPath = "/var/www/ref-ai/backend/.env";
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      results.groq = content.includes("GROQ_API_KEY=") || content.includes("ANTHROPIC_API_KEY=");
    }
    if (!results.groq) errors.groq = "API ключ не найден в backend/.env";
  } catch (err) {
    errors.groq = String(err);
  }

  // Сохраняем результат
  try {
    await prisma.healthCheck.create({
      data: {
        frontend: results.frontend,
        backend:  results.backend,
        database: results.database,
        groq:     results.groq,
        details:  Object.keys(errors).length > 0 ? JSON.stringify(errors) : null,
      },
    });

    // Чистим старые записи
    const allIds = await prisma.healthCheck.findMany({
      orderBy: { checkedAt: "desc" },
      select:  { id: true },
      skip:    KEEP_RECORDS,
    });
    if (allIds.length > 0) {
      await prisma.healthCheck.deleteMany({
        where: { id: { in: allIds.map(r => r.id) } },
      });
    }
  } catch (err) {
    console.error("[HealthMonitor] Ошибка сохранения в БД:", err);
  }

  const status = Object.entries(results)
    .map(([k, v]) => `${k}:${v ? "✓" : "✗"}`)
    .join(" ");
  console.log(`[HealthMonitor] ${new Date().toISOString()} — ${status}`);
}

let started = false;

export function startHealthMonitor(): void {
  if (started) return;
  started = true;

  // Первая проверка через 10 секунд после старта
  setTimeout(async () => {
    await runHealthCheck();
    // Затем каждые 5 минут
    setInterval(() => { void runHealthCheck(); }, CHECK_INTERVAL_MS);
  }, 10_000);

  console.log("[HealthMonitor] Запущен — проверки каждые 5 минут");
}
