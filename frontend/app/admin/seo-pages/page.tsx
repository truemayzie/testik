"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "../admin.module.css";
import { SEO_WORK_TYPE_LABELS } from "@/lib/seo-work-type-labels";
import { WORK_PRICES } from "@/lib/prices";
import { IndexCheckLinks } from "../components/IndexCheckLinks";

type TabKey = "templates" | "previews";

type IndexGoogleRow = {
  verdict: string | null;
  coverageState: string | null;
  lastCheck: string | null;
};

function GoogleGscBadge({ row }: { row: IndexGoogleRow | null }) {
  if (!row?.lastCheck && !row?.verdict && !row?.coverageState) {
    return <span style={{ color: "#94A3B8", fontSize: "0.8rem" }}>—</span>;
  }
  const v = row.verdict ?? "";
  let color = "#64748B";
  let label = row.coverageState || v || "проверено";
  if (v === "PASS") {
    color = "#15803D";
    label = "В индексе";
  } else if (v === "FAIL") {
    color = "#B91C1C";
    label = "Нет в индексе";
  } else if (v === "PARTIAL") {
    color = "#B45309";
    label = "Частично";
  } else if (v === "NEUTRAL") {
    color = "#475569";
    label = "Нейтрально";
  }
  const tip = [row.verdict, row.coverageState].filter(Boolean).join(" · ");
  return (
    <div style={{ fontSize: "0.78rem", lineHeight: 1.35 }} title={tip || undefined}>
      <div style={{ fontWeight: 700, color }}>{label}</div>
      {row.lastCheck && (
        <div style={{ color: "#94A3B8", marginTop: 2 }}>{new Date(row.lastCheck).toLocaleString("ru-RU")}</div>
      )}
    </div>
  );
}

async function parseAdminFetch<T>(response: Response): Promise<T> {
  const bodyText = await response.text();
  if (!response.ok) {
    let msg =
      response.status === 403
        ? "API вернул 403: нет прав администратора (перелогиньтесь)."
        : response.status === 404
          ? "Маршрут не найден. Сделайте npm run build и перезапустите frontend на сервере."
          : `Ошибка ${response.status}`;
    try {
      const j = JSON.parse(bodyText) as { error?: string };
      if (j?.error && response.status !== 403) msg = `${msg}: ${j.error}`;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return JSON.parse(bodyText) as T;
}

/* ── Вкладка SeoPage ── */

type SeoRow = {
  id: number;
  slug: string;
  workType: string;
  subject: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  path: string;
  fullUrl: string;
  previewLen: number;
  bodyLen: number;
  createdAt: string;
  updatedAt: string;
  indexGoogle: IndexGoogleRow | null;
};

type SeoApiPayload = {
  pages: SeoRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  byWorkType: { workType: string; count: number; label: string }[];
};

/* ── Вкладка публичных превью (sitemap) ── */

type PreviewRow = {
  id: string;
  slug: string;
  topic: string;
  workType: string;
  pages: number;
  createdAt: string;
  path: string;
  fullUrl: string;
  indexGoogle: IndexGoogleRow | null;
};

type PreviewApiPayload = {
  pages: PreviewRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  byWorkType: { workType: string; count: number; label: string }[];
};

const PREVIEW_WORK_TYPES = Object.keys(WORK_PRICES)
  .filter((k) => k !== "Тест")
  .sort((a, b) => WORK_PRICES[a].label.localeCompare(WORK_PRICES[b].label, "ru"));

export default function AdminSeoPages() {
  const [tab, setTab] = useState<TabKey>("templates");
  const [gscSyncBusy, setGscSyncBusy] = useState(false);
  const [gscSyncMsg, setGscSyncMsg] = useState<string | null>(null);
  const [gscBatchLimit, setGscBatchLimit] = useState(30);

  /* SeoPage */
  const [seoData, setSeoData] = useState<SeoApiPayload | null>(null);
  const [seoLoading, setSeoLoading] = useState(true);
  const [seoLoadError, setSeoLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [workType, setWorkType] = useState("");
  const [seoPage, setSeoPage] = useState(1);
  const seoSearchRef = useRef(search);
  seoSearchRef.current = search;

  const loadSeo = useCallback(
    (pageOverride?: number) => {
      const pageNum = pageOverride ?? seoPage;
      setSeoLoading(true);
      setSeoLoadError(null);
      const p = new URLSearchParams();
      const s = seoSearchRef.current.trim();
      if (s) p.set("search", s);
      if (workType) p.set("workType", workType);
      p.set("page", String(pageNum));
      p.set("pageSize", "100");
      fetch(`/api/admin/seo-pages?${p}`)
        .then(parseAdminFetch<SeoApiPayload>)
        .then((d) => {
          setSeoData(d);
          setSeoLoading(false);
        })
        .catch((e: unknown) => {
          const msg =
            e instanceof Error && e.message
              ? e.message
              : "Не удалось загрузить список. Проверьте вкладку «Сеть» в DevTools.";
          setSeoLoadError(msg);
          setSeoData(null);
          setSeoLoading(false);
        });
    },
    [seoPage, workType]
  );

  useEffect(() => {
    if (tab !== "templates") return;
    loadSeo();
  }, [tab, seoPage, workType, loadSeo]);

  /* Превью в sitemap */
  const [prevData, setPrevData] = useState<PreviewApiPayload | null>(null);
  const [prevLoading, setPrevLoading] = useState(false);
  const [prevLoadError, setPrevLoadError] = useState<string | null>(null);
  const [prevSearch, setPrevSearch] = useState("");
  const [prevWorkType, setPrevWorkType] = useState("");
  const [prevPage, setPrevPage] = useState(1);
  const prevSearchRef = useRef(prevSearch);
  prevSearchRef.current = prevSearch;

  const loadPreviews = useCallback(
    (pageOverride?: number) => {
      const pageNum = pageOverride ?? prevPage;
      setPrevLoading(true);
      setPrevLoadError(null);
      const p = new URLSearchParams();
      const s = prevSearchRef.current.trim();
      if (s) p.set("search", s);
      if (prevWorkType) p.set("workType", prevWorkType);
      p.set("page", String(pageNum));
      p.set("pageSize", "50");
      fetch(`/api/admin/public-previews?${p}`)
        .then(parseAdminFetch<PreviewApiPayload>)
        .then((d) => {
          setPrevData(d);
          setPrevLoading(false);
        })
        .catch((e: unknown) => {
          const msg =
            e instanceof Error && e.message
              ? e.message
              : "Не удалось загрузить список. Проверьте вкладку «Сеть» в DevTools.";
          setPrevLoadError(msg);
          setPrevData(null);
          setPrevLoading(false);
        });
    },
    [prevPage, prevWorkType]
  );

  useEffect(() => {
    if (tab !== "previews") return;
    loadPreviews();
  }, [tab, prevPage, prevWorkType, loadPreviews]);

  const fmt = (d: string) =>
    new Date(d).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const typeOptionsSeo = Object.entries(SEO_WORK_TYPE_LABELS).sort((a, b) => a[1].localeCompare(b[1], "ru"));

  const runGscSync = () => {
    const source = tab === "templates" ? "seo" : "preview";
    setGscSyncBusy(true);
    setGscSyncMsg(null);
    fetch("/api/admin/index-status/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, limit: gscBatchLimit }),
    })
      .then(async (r) => {
        const text = await r.text();
        type SyncErr = { error?: string; processed?: number; results?: unknown; setupSteps?: string[] };
        let j: SyncErr = {};
        try {
          j = JSON.parse(text) as SyncErr;
        } catch {
          /* ignore */
        }
        if (!r.ok) {
          let msg = j.error || `Ошибка ${r.status}`;
          if (Array.isArray(j.setupSteps) && j.setupSteps.length) {
            msg += `\n\n${j.setupSteps.join("\n")}`;
          }
          throw new Error(msg);
        }
        const n = j.processed ?? 0;
        setGscSyncMsg(`Google: обработано запросов: ${n} (ещё есть лимит ~2000 URL/день на сайт в GSC). Обновите список — колонка «GSC» заполнится.`);
        if (tab === "templates") loadSeo();
        else loadPreviews();
      })
      .catch((e: unknown) => {
        setGscSyncMsg(e instanceof Error ? e.message : "Сбой синхронизации");
      })
      .finally(() => setGscSyncBusy(false));
  };

  const prevWaitingFirstFetch =
    tab === "previews" && prevData === null && !prevLoadError;
  const loading =
    tab === "templates" ? seoLoading : prevLoading || prevWaitingFirstFetch;
  const loadError = tab === "templates" ? seoLoadError : prevLoadError;
  const pageNumActive = tab === "templates" ? seoPage : prevPage;
  const totalPagesActive =
    tab === "templates" ? seoData?.totalPages : prevData?.totalPages;
  const data = tab === "templates" ? seoData : prevData;

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Страницы для SEO и продаж</h1>
        <p className={styles.pageSubtitle}>
          {tab === "templates" ? (
            <>
              Ручные шаблоны в Prisma <strong>SeoPage</strong>: URL{" "}
              <code style={{ fontSize: "0.85em", background: "#0F172A", padding: "2px 6px", borderRadius: 4 }}>
                /{`{тип}`}/{`{slug}`}
              </code>
            </>
          ) : (
            <>
              Публичные превью сгенерированных работ (
              <code style={{ fontSize: "0.85em", background: "#0F172A", padding: "2px 6px", borderRadius: 4 }}>
                /preview/{`{slug}`}
              </code>
              ). Тот же список, что уходит в <strong>sitemap.xml</strong> (priority 0.7).
            </>
          )}
        </p>

        <div className={styles.tabRow} role="tablist" aria-label="Раздел страниц">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "templates"}
            className={`${styles.tabBtn} ${tab === "templates" ? styles.tabBtnActive : ""}`}
            onClick={() => setTab("templates")}
          >
            Шаблоны (SeoPage)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "previews"}
            className={`${styles.tabBtn} ${tab === "previews" ? styles.tabBtnActive : ""}`}
            onClick={() => setTab("previews")}
          >
            Превью работ → sitemap
          </button>
        </div>
      </div>

      <div className={styles.pageBody}>
        {loadError && (
          <div
            className={styles.statCard}
            style={{ marginBottom: 16, borderColor: "#B91C1C", background: "rgba(239,68,68,0.08)" }}
          >
            <div className={styles.statLabel}>Ошибка</div>
            <div style={{ marginTop: 6, fontSize: "0.95rem", lineHeight: 1.45 }}>{loadError}</div>
          </div>
        )}

        {/* Сводка */}
        {tab === "templates" && seoData && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 10,
              marginBottom: 20,
            }}
          >
            <div className={styles.statCard} style={{ gridColumn: "span 2" }}>
              <div className={styles.statLabel}>Всего SEO-шаблонов</div>
              <div className={`${styles.statValue} ${styles.statAccent}`}>
                {seoData.total.toLocaleString("ru-RU")}
              </div>
            </div>
            {seoData.byWorkType.map((x) => (
              <div key={x.workType} className={styles.statCard}>
                <div className={styles.statLabel}>{x.label}</div>
                <div className={styles.statValue}>{x.count}</div>
                <div className={styles.statSub} style={{ fontSize: "0.72rem", opacity: 0.75 }}>
                  {x.workType}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "previews" && prevData && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 10,
              marginBottom: 20,
            }}
          >
            <div className={styles.statCard} style={{ gridColumn: "span 2" }}>
              <div className={styles.statLabel}>Страниц в sitemap</div>
              <div className={`${styles.statValue} ${styles.statAccent}`}>
                {prevData.total.toLocaleString("ru-RU")}
              </div>
              <div className={styles.statSub} style={{ marginTop: 8 }}>
                только <code style={{ fontSize: "0.78em" }}>isPublic + slug</code>
              </div>
            </div>
            {prevData.byWorkType.map((x) => (
              <div key={x.workType} className={styles.statCard}>
                <div className={styles.statLabel}>{x.label}</div>
                <div className={styles.statValue}>{x.count}</div>
              </div>
            ))}
          </div>
        )}

        {(tab === "templates" ? seoData : prevData) && (
          <p className={styles.seoIndexHint}>
            <strong>GSC</strong> — данные из Google Search Console (<em>URL Inspection API</em>): нужны переменные{" "}
            <code style={{ fontSize: "0.82em" }}>GSC_SITE_PROPERTY</code>,{" "}
            <code style={{ fontSize: "0.82em" }}>GOOGLE_APPLICATION_CREDENTIALS</code> или{" "}
            <code style={{ fontSize: "0.82em" }}>GSC_SERVICE_ACCOUNT_JSON</code>; сервисный аккаунт добавьте в GSC с
            правами на сайт. Лимит ~2000 проверок/сутки. <strong>G / Я</strong> — ручная проверка через запрос{" "}
            <code style={{ fontSize: "0.82em" }}>site:URL</code> (Яндекс так в API официально не отдаёт — только вручную
            или в кабинете).
          </p>
        )}

        {gscSyncMsg && (
          <div
            className={styles.statCard}
            style={{
              marginBottom: 14,
              borderColor: gscSyncMsg.startsWith("Google:") ? "#86EFAC" : "#FCA5A5",
              background: gscSyncMsg.startsWith("Google:") ? "rgba(34,197,94,0.08)" : "rgba(248,113,113,0.09)",
            }}
          >
            <div className={styles.statLabel}>Синхронизация GSC</div>
            <div style={{ marginTop: 6, fontSize: "0.88rem", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {gscSyncMsg}
            </div>
          </div>
        )}

        {/* Панель */}
        <div className={styles.toolbar}>
          {tab === "templates" ? (
            <>
              <div className={styles.searchWrap}>
                <span className={styles.searchIcon}>🔍</span>
                <input
                  className={styles.searchInput}
                  placeholder="Поиск: slug, заголовок, предмет, meta title…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setSeoPage(1);
                      loadSeo(1);
                    }
                  }}
                />
              </div>
              <select
                className={styles.filterInput}
                value={workType}
                onChange={(e) => {
                  setWorkType(e.target.value);
                  setSeoPage(1);
                }}
                title="Тип работы (URL)"
                style={{ minWidth: 160 }}
              >
                <option value="">Все типы</option>
                {typeOptionsSeo.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label} ({key})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                onClick={() => {
                  if (seoPage !== 1) setSeoPage(1);
                  else loadSeo(1);
                }}
              >
                Применить
              </button>
              <select
                className={styles.filterInput}
                title="Сколько URL проверить за один запрос (старые в очереди — первые)"
                value={gscBatchLimit}
                onChange={(e) => setGscBatchLimit(Number(e.target.value))}
                style={{ minWidth: 72 }}
              >
                {[15, 30, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    GSC ×{n}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.actionBtn}
                disabled={gscSyncBusy || tab !== "templates"}
                onClick={() => tab === "templates" && runGscSync()}
                title="Обновить кэш индекса Google для типа «шаблоны»"
              >
                {gscSyncBusy ? "Запрос GSC…" : "Синхр. Google (шаблоны)"}
              </button>
              {seoData && (
                <span className={styles.toolbarCount}>
                  Стр. {seoPage} / {seoData.totalPages} · на странице {seoData.pages.length}
                </span>
              )}
            </>
          ) : (
            <>
              <div className={styles.searchWrap}>
                <span className={styles.searchIcon}>🔍</span>
                <input
                  className={styles.searchInput}
                  placeholder="Поиск по теме или slug превью…"
                  value={prevSearch}
                  onChange={(e) => setPrevSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setPrevPage(1);
                      loadPreviews(1);
                    }
                  }}
                />
              </div>
              <select
                className={styles.filterInput}
                value={prevWorkType}
                onChange={(e) => {
                  setPrevWorkType(e.target.value);
                  setPrevPage(1);
                }}
                title="Тип работы (как в генерации)"
                style={{ minWidth: 190 }}
              >
                <option value="">Все типы</option>
                {PREVIEW_WORK_TYPES.map((key) => (
                  <option key={key} value={key}>
                    {WORK_PRICES[key].label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                onClick={() => {
                  if (prevPage !== 1) setPrevPage(1);
                  else loadPreviews(1);
                }}
              >
                Применить
              </button>
              <select
                className={styles.filterInput}
                title="Сколько URL проверить за один запрос"
                value={gscBatchLimit}
                onChange={(e) => setGscBatchLimit(Number(e.target.value))}
                style={{ minWidth: 72 }}
              >
                {[15, 30, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    GSC ×{n}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.actionBtn}
                disabled={gscSyncBusy || tab !== "previews"}
                onClick={() => tab === "previews" && runGscSync()}
                title="Обновить кэш индекса Google для превью в sitemap"
              >
                {gscSyncBusy ? "Запрос GSC…" : "Синхр. Google (превью)"}
              </button>
              {prevData && (
                <span className={styles.toolbarCount}>
                  Стр. {prevPage} / {prevData.totalPages} · на странице {prevData.pages.length}
                </span>
              )}
            </>
          )}
        </div>

        {/* Таблица */}
        <div className={styles.tableWrap}>
          {loading ? (
            <div className={styles.loading}>
              <div className={styles.spinner} /> Загружаем...
            </div>
          ) : loadError ? (
            <p style={{ color: "#94A3B8", fontSize: "0.9rem" }}>Таблица недоступна до исправления ошибки выше.</p>
          ) : tab === "templates" ? (
            !seoData ? (
              <p style={{ color: "#EF4444" }}>Нет данных</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Тип / предмет</th>
                    <th>Slug → URL</th>
                    <th>Заголовок (H1)</th>
                    <th>Meta title</th>
                    <th>Объём текста</th>
                    <th>Обновлено</th>
                    <th title="URL Inspection API, кэш в БД">GSC индекс</th>
                    <th title="Проверка через site: в Google и Яндексе">site:</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {seoData.pages.length === 0 ? (
                    <tr className={styles.emptyRow}>
                      <td colSpan={9}>
                        {seoData.total === 0 && !seoSearchRef.current.trim() && !workType ? (
                          <>
                            В базе нет строк в{" "}
                            <code style={{ fontSize: "0.85em" }}>SeoPage</code>. На сервере из{" "}
                            <code style={{ fontSize: "0.85em" }}>frontend</code>:{" "}
                            <code style={{ fontSize: "0.85em" }}>npm run seed-seo</code>
                          </>
                        ) : (
                          "Нет страниц по фильтрам или поиску"
                        )}
                      </td>
                    </tr>
                  ) : (
                    seoData.pages.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{SEO_WORK_TYPE_LABELS[r.workType] ?? r.workType}</div>
                          <div style={{ fontSize: "0.82rem", color: "#94A3B8" }}>{r.subject}</div>
                        </td>
                        <td>
                          <code style={{ fontSize: "0.78rem", wordBreak: "break-all" }}>{r.slug}</code>
                          <div style={{ marginTop: 4 }}>
                            <a href={r.path} target="_blank" rel="noopener noreferrer" className={styles.tableLink}>
                              {r.path} ↗
                            </a>
                          </div>
                        </td>
                        <td style={{ maxWidth: 220 }}>
                          <span title={r.title}>{r.title.length > 90 ? `${r.title.slice(0, 90)}…` : r.title}</span>
                        </td>
                        <td style={{ maxWidth: 200, fontSize: "0.86rem", color: "#CBD5E1" }}>
                          <span title={r.metaTitle}>
                            {r.metaTitle.length > 80 ? `${r.metaTitle.slice(0, 80)}…` : r.metaTitle}
                          </span>
                        </td>
                        <td style={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                          превью {r.previewLen.toLocaleString("ru-RU")} зн.<br />
                          body {r.bodyLen.toLocaleString("ru-RU")} зн.
                        </td>
                        <td style={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>{fmt(r.updatedAt)}</td>
                        <td style={{ maxWidth: 120 }}>
                          <GoogleGscBadge row={r.indexGoogle} />
                        </td>
                        <td>{r.fullUrl ? <IndexCheckLinks fullUrl={r.fullUrl} /> : "—"}</td>
                        <td>
                          <Link href={r.path} className={styles.tableLink} target="_blank" rel="noopener noreferrer">
                            Открыть →
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )
          ) : !prevData ? (
            <p style={{ color: "#EF4444" }}>Нет данных</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Тип</th>
                  <th>Тема</th>
                  <th>Slug / URL</th>
                  <th>Страниц</th>
                  <th>Создана</th>
                  <th title="URL Inspection API">GSC</th>
                  <th title="site: в выдаче">site:</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {prevData.pages.length === 0 ? (
                  <tr className={styles.emptyRow}>
                    <td colSpan={8}>
                      {prevData.total === 0 && !prevSearchRef.current.trim() && !prevWorkType ? (
                        <>
                          Нет публичных превью с slug. После сохранения работы они появятся здесь и в{" "}
                          <code style={{ fontSize: "0.85em" }}>sitemap.xml</code>.
                        </>
                      ) : (
                        "Нет записей по фильтрам"
                      )}
                    </td>
                  </tr>
                ) : (
                  prevData.pages.map((r) => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 600 }}>{WORK_PRICES[r.workType]?.label ?? r.workType}</div>
                      </td>
                      <td style={{ maxWidth: 280 }}>
                        <span title={r.topic}>{r.topic.length > 100 ? `${r.topic.slice(0, 100)}…` : r.topic}</span>
                      </td>
                      <td>
                        <code style={{ fontSize: "0.78rem", wordBreak: "break-all" }}>{r.slug}</code>
                        <div style={{ marginTop: 4 }}>
                          <a href={r.path} target="_blank" rel="noopener noreferrer" className={styles.tableLink}>
                            {r.path} ↗
                          </a>
                        </div>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{r.pages}</td>
                      <td style={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>{fmt(r.createdAt)}</td>
                      <td style={{ maxWidth: 120 }}>
                        <GoogleGscBadge row={r.indexGoogle} />
                      </td>
                      <td>{r.fullUrl ? <IndexCheckLinks fullUrl={r.fullUrl} /> : "—"}</td>
                      <td>
                        <Link href={r.path} className={styles.tableLink} target="_blank" rel="noopener noreferrer">
                          Открыть →
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {data && totalPagesActive && totalPagesActive > 1 && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
            <button
              type="button"
              className={styles.actionBtn}
              disabled={pageNumActive <= 1}
              onClick={() =>
                tab === "templates"
                  ? setSeoPage((p) => Math.max(1, p - 1))
                  : setPrevPage((p) => Math.max(1, p - 1))
              }
            >
              ← Назад
            </button>
            <span style={{ alignSelf: "center", fontSize: "0.9rem", color: "#94A3B8" }}>
              {pageNumActive} / {totalPagesActive}
            </span>
            <button
              type="button"
              className={styles.actionBtn}
              disabled={pageNumActive >= (totalPagesActive ?? 1)}
              onClick={() =>
                tab === "templates"
                  ? setSeoPage((p) => p + 1)
                  : setPrevPage((p) => p + 1)
              }
            >
              Вперёд →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
