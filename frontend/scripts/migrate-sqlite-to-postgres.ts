/**
 * migrate-sqlite-to-postgres.ts — разовый перенос данных SQLite → PostgreSQL.
 *
 * Запуск: cd frontend && npx tsx scripts/migrate-sqlite-to-postgres.ts
 *
 * Как работает:
 *  - Читает все таблицы из prisma/prisma/dev.db напрямую через @libsql/client
 *    (raw SQL, без Prisma-клиента на SQLite);
 *  - Конвертирует epoch-миллисекунды (как хранит SQLite) в Date;
 *  - Пишет данные в PostgreSQL (DATABASE_URL из .env) через Prisma Client
 *    в правильном порядке (родители → дети), с сохранением исходных id;
 *  - Идемпотентен: перед переносом чистит целевые таблицы.
 *
 * Важно: dev-сервер (npm run dev) при запуске должен быть остановлен —
 * иначе он может concurrently писать в целевую базу.
 */

import { createClient } from "@libsql/client";
import { PrismaClient } from "@prisma/client";

// ---------- Утилиты ----------

type Row = Record<string, unknown>;

/** epoch-ms (number) | null → Date | null */
function toDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? new Date(n) : null;
}

/** SQLite хранит boolean как 0/1 */
function toBool(v: unknown): boolean {
  return Number(v) === 1;
}

function toInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toStr(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

async function main() {
  const sqliteUrl = process.env.SQLITE_SOURCE_URL ?? "file:./prisma/prisma/dev.db";
  const src = createClient({ url: sqliteUrl });
  const target = new PrismaClient();

  console.log(`Источник: ${sqliteUrl}`);
  console.log("Цель:     PostgreSQL (DATABASE_URL из .env)\n");

  try {
    // ---------- Читаем всё из SQLite ----------
    const [
      usersR, accountsR, sessionsR, tokensR, previewTasksR,
      paymentsR, extrasJobsR, generationsR, workActivitiesR,
      feedbackCommentsR, seoPagesR,
    ] = await Promise.all([
      src.execute("SELECT * FROM User"),
      src.execute("SELECT * FROM Account"),
      src.execute("SELECT * FROM Session"),
      src.execute("SELECT * FROM VerificationToken"),
      src.execute("SELECT * FROM PreviewTask"),
      src.execute("SELECT * FROM Payment"),
      src.execute("SELECT * FROM ExtrasJob"),
      src.execute("SELECT * FROM Generation"),
      src.execute("SELECT * FROM WorkActivity"),
      src.execute("SELECT * FROM FeedbackComment"),
      src.execute("SELECT * FROM SeoPage"),
    ]);

    const rows = (r: { rows: Row[] }) => r.rows;
    const users = rows(usersR);
    const accounts = rows(accountsR);
    const sessions = rows(sessionsR);
    const tokens = rows(tokensR);
    const previewTasks = rows(previewTasksR);
    const payments = rows(paymentsR);
    const extrasJobs = rows(extrasJobsR);
    const generations = rows(generationsR);
    const workActivities = rows(workActivitiesR);
    const feedbackComments = rows(feedbackCommentsR);
    const seoPages = rows(seoPagesR);

    const counts = {
      users: users.length,
      accounts: accounts.length,
      sessions: sessions.length,
      verificationTokens: tokens.length,
      previewTasks: previewTasks.length,
      payments: payments.length,
      extrasJobs: extrasJobs.length,
      generations: generations.length,
      workActivities: workActivities.length,
      feedbackComments: feedbackComments.length,
      seoPages: seoPages.length,
    };
    console.log("Прочитано из SQLite:", counts, "\n");

    // ---------- Чистим целевую БД (идемпотентность) ----------
    await target.workActivity.deleteMany();
    await target.feedbackComment.deleteMany();
    await target.generation.deleteMany();
    await target.extrasJob.deleteMany();
    await target.previewTask.deleteMany();
    await target.payment.deleteMany();
    await target.session.deleteMany();
    await target.account.deleteMany();
    await target.verificationToken.deleteMany();
    await target.user.deleteMany();
    await target.seoPage.deleteMany();

    // ---------- Перенос: родители → дети ----------
    for (const p of seoPages) {
      await target.seoPage.create({
        data: {
          id: toInt(p.id),
          slug: String(p.slug),
          workType: String(p.workType),
          subject: String(p.subject),
          title: String(p.title),
          metaTitle: String(p.metaTitle),
          metaDescription: String(p.metaDescription),
          previewText: String(p.previewText),
          bodyText: String(p.bodyText ?? ""),
          adminInSearchGoogle: p.adminInSearchGoogle === null ? null : toBool(p.adminInSearchGoogle),
          adminInSearchYandex: p.adminInSearchYandex === null ? null : toBool(p.adminInSearchYandex),
          createdAt: toDate(p.createdAt)!,
          updatedAt: toDate(p.updatedAt)!,
        },
      });
    }

    for (const u of users) {
      await target.user.create({
        data: {
          id: String(u.id),
          name: toStr(u.name),
          email: toStr(u.email),
          emailVerified: toDate(u.emailVerified),
          image: toStr(u.image),
          createdAt: toDate(u.createdAt)!,
          updatedAt: toDate(u.updatedAt)!,
          university: toStr(u.university),
          faculty: toStr(u.faculty),
          department: toStr(u.department),
          speciality: toStr(u.speciality),
          discipline: toStr(u.discipline),
          course: toStr(u.course),
          groupNumber: toStr(u.groupNumber),
          fullName: toStr(u.fullName),
          teacherName: toStr(u.teacherName),
          city: toStr(u.city),
          role: String(u.role ?? "user"),
          banned: toBool(u.banned),
          password: toStr(u.password),
          freePreviewUsedAt: toDate(u.freePreviewUsedAt),
          freePreviewUses: toInt(u.freePreviewUses),
          freePreviewQuota: toInt(u.freePreviewQuota),
        },
      });
    }

    for (const a of accounts) {
      await target.account.create({
        data: {
          id: String(a.id),
          userId: String(a.userId),
          type: String(a.type),
          provider: String(a.provider),
          providerAccountId: String(a.providerAccountId),
          refresh_token: toStr(a.refresh_token),
          access_token: toStr(a.access_token),
          expires_at: a.expires_at === null ? null : toInt(a.expires_at),
          token_type: toStr(a.token_type),
          scope: toStr(a.scope),
          id_token: toStr(a.id_token),
          session_state: toStr(a.session_state),
        },
      });
    }

    for (const s of sessions) {
      await target.session.create({
        data: {
          id: String(s.id),
          sessionToken: String(s.sessionToken),
          userId: String(s.userId),
          expires: toDate(s.expires)!,
        },
      });
    }

    for (const v of tokens) {
      await target.verificationToken.create({
        data: {
          identifier: String(v.identifier),
          token: String(v.token),
          expires: toDate(v.expires)!,
        },
      });
    }

    for (const pt of previewTasks) {
      await target.previewTask.create({
        data: {
          id: String(pt.id),
          userId: String(pt.userId),
          topic: String(pt.topic),
          workType: String(pt.workType),
          pages: toInt(pt.pages),
          extras: toStr(pt.extras),
          createdAt: toDate(pt.createdAt)!,
          expiresAt: toDate(pt.expiresAt)!,
        },
      });
    }

    for (const p of payments) {
      await target.payment.create({
        data: {
          id: String(p.id),
          userId: String(p.userId),
          workType: String(p.workType),
          amount: toInt(p.amount),
          status: String(p.status ?? "pending"),
          provider: String(p.provider ?? "yookassa"),
          providerPaymentId: toStr(p.providerPaymentId),
          yokassaId: toStr(p.yokassaId),
          createdAt: toDate(p.createdAt)!,
          usedAt: toDate(p.usedAt),
        },
      });
    }

    for (const e of extrasJobs) {
      await target.extrasJob.create({
        data: {
          id: String(e.id),
          userId: String(e.userId),
          createdAt: toDate(e.createdAt)!,
        },
      });
    }

    for (const g of generations) {
      await target.generation.create({
        data: {
          id: String(g.id),
          userId: String(g.userId),
          createdAt: toDate(g.createdAt)!,
          topic: String(g.topic),
          pages: toInt(g.pages),
          workType: String(g.workType ?? "Реферат"),
          status: String(g.status ?? "completed"),
          result: String(g.result),
          isPublic: toBool(g.isPublic),
          slug: toStr(g.slug),
          adminInSearchGoogle: g.adminInSearchGoogle === null ? null : toBool(g.adminInSearchGoogle),
          adminInSearchYandex: g.adminInSearchYandex === null ? null : toBool(g.adminInSearchYandex),
          extras: toStr(g.extras),
          rating: g.rating === null ? null : toInt(g.rating),
        },
      });
    }

    for (const wa of workActivities) {
      await target.workActivity.create({
        data: {
          id: String(wa.id),
          userId: String(wa.userId),
          generationId: toStr(wa.generationId),
          action: String(wa.action),
          source: String(wa.source),
          slug: toStr(wa.slug),
          workType: toStr(wa.workType),
          meta: toStr(wa.meta),
          createdAt: toDate(wa.createdAt)!,
        },
      });
    }

    for (const fc of feedbackComments) {
      await target.feedbackComment.create({
        data: {
          id: String(fc.id),
          generationId: String(fc.generationId),
          issues: String(fc.issues),
          comment: toStr(fc.comment),
          createdAt: toDate(fc.createdAt)!,
        },
      });
    }

    // ---------- Проверка ----------
    const check = {
      users: await target.user.count(),
      accounts: await target.account.count(),
      sessions: await target.session.count(),
      verificationTokens: await target.verificationToken.count(),
      previewTasks: await target.previewTask.count(),
      payments: await target.payment.count(),
      extrasJobs: await target.extrasJob.count(),
      generations: await target.generation.count(),
      workActivities: await target.workActivity.count(),
      feedbackComments: await target.feedbackComment.count(),
      seoPages: await target.seoPage.count(),
    };

    console.log("Записано в PostgreSQL:", check, "\n");

    let mismatches = 0;
    for (const [table, expected] of Object.entries(counts)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const actual = (check as any)[table];
      if (expected !== actual) {
        console.error(`❌ ${table}: в SQLite ${expected}, в PostgreSQL ${actual}`);
        mismatches++;
      }
    }

    if (mismatches === 0) {
      console.log("✅ Миграция завершена успешно: счётчики всех таблиц совпадают.");
    } else {
      console.error(`⚠️ Есть расхождения в ${mismatches} таблицах — смотри логи выше.`);
      process.exitCode = 1;
    }
  } finally {
    src.close();
    await target.$disconnect();
  }
}

main().catch((e) => {
  console.error("Ошибка миграции:", e);
  process.exit(1);
});
