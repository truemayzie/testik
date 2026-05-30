"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { WORK_PRICES } from "@/lib/prices";
import {
  previewBodySections,
  sourceDisplayLine,
  stripLeadingNumber,
  tocDisplayItems,
} from "@/lib/orderPreviewText";
import { useClientGeneration, type ReferatResult } from "@/lib/useClientGeneration";
import { loadOrderGenSession } from "@/lib/orderGenerationSession";
import payStyles from "@/app/components/PaymentWidget.module.css";
import styles from "./order.module.css";

type OrderState = {
  taskId: string;
  topic: string;
  workType: string;
  pages: number;
  extras: string[];
};

function extrasLabel(items: string[]): string {
  const parts: string[] = [];
  if (items.includes("presentation")) parts.push("презентацию");
  if (items.includes("speech")) parts.push("текст выступления");
  if (!parts.length) return "дополнительные материалы";
  if (parts.length === 2) return `${parts[0]} и ${parts[1]}`;
  return parts[0]!;
}

function parseExtrasReady(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const ready: string[] = [];
    if (typeof o.presentation === "string") ready.push("presentation");
    if (typeof o.speech === "string") ready.push("speech");
    return ready;
  } catch {
    return [];
  }
}

function renderSectionText(text: string) {
  const parts = text.split(/(\[TABLE\][\s\S]*?\[\/TABLE\])/g);
  return parts.map((part, i) => {
    if (part.startsWith("[TABLE]")) {
      try {
        const json = part.replace("[TABLE]", "").replace("[/TABLE]", "").trim();
        const data = JSON.parse(json) as {
          caption?: string;
          headers: string[];
          rows: string[][];
        };
        return (
          <div key={i} className={styles.doneTableWrap}>
            {data.caption ? <p className={styles.doneTableCaption}>{data.caption}</p> : null}
            <table className={styles.doneTable}>
              <thead>
                <tr>
                  {data.headers.map((h, j) => (
                    <th key={j}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, j) => (
                  <tr key={j}>
                    {row.map((cell, k) => (
                      <td key={k}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      } catch {
        return null;
      }
    }
    return part
      .split("\n")
      .filter((p) => p.trim())
      .map((para, j) => (
        <p key={`${i}-${j}`} className={styles.donePara}>
          {para}
        </p>
      ));
  });
}

function OrderResultPreview({
  workType,
  result,
}: {
  workType: string;
  result: ReferatResult;
}) {
  const isEssayLike = workType === "Сочинение" || workType === "Эссе";
  const tocItems = useMemo(() => tocDisplayItems(result.structure), [result.structure]);
  const bodySections = useMemo(
    () => previewBodySections(result.structure, result.content),
    [result.structure, result.content],
  );
  const showToc = !isEssayLike && tocItems.length > 0;
  const showSources = !isEssayLike && result.sources.length > 0;

  return (
    <div className={payStyles.previewColPage}>
      <div className={payStyles.pageTopicCard}>
        <span className={payStyles.pageTopicBadge}>{workType}</span>
        <h1 className={payStyles.pageTopicTitle}>{result.title}</h1>
        <p className={payStyles.pageTopicMeta}>
          {WORK_PRICES[workType]?.pages ?? ""} · DOCX по ГОСТ
        </p>
      </div>

      {showToc ? (
        <div className={payStyles.pageSectionCard}>
          <h2 className={payStyles.pageSectionTitle}>Содержание</h2>
          <ol className={styles.doneToc}>
            {tocItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {bodySections.map((section) => {
        const text = result.content[section];
        if (!text?.trim()) return null;
        return (
          <div key={section} className={payStyles.pageSectionCard}>
            <h2 className={payStyles.pageSectionTitle}>{stripLeadingNumber(section)}</h2>
            <div className={styles.doneSectionBody}>{renderSectionText(text)}</div>
          </div>
        );
      })}

      {showSources ? (
        <div className={payStyles.pageSectionCard}>
          <h2 className={payStyles.pageSectionTitle}>Список литературы</h2>
          <ol className={styles.doneSources}>
            {result.sources.map((src, i) => (
              <li key={i}>{sourceDisplayLine(src)}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

export default function OrderDoneView({ order }: { order: OrderState }) {
  const gen = useClientGeneration();
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const orderedExtras = order.extras.length
    ? order.extras
    : (loadOrderGenSession(order.taskId)?.extras ?? []);
  const missingExtras = orderedExtras.filter((x) => !gen.extrasReady.includes(x));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let genId = loadOrderGenSession(order.taskId)?.generationId;
        if (!genId) {
          const linkRes = await fetch(
            `/api/generations/by-task/${encodeURIComponent(order.taskId)}`,
            { cache: "no-store" },
          );
          if (linkRes.ok) {
            const link = (await linkRes.json()) as { id?: string };
            if (link.id) genId = link.id;
          }
        }
        if (!genId) {
          if (!cancelled) setLoadState("error");
          return;
        }

        const fullRes = await fetch(`/api/generations/${encodeURIComponent(genId)}`, {
          cache: "no-store",
        });
        if (!fullRes.ok) {
          if (!cancelled) setLoadState("error");
          return;
        }

        const data = (await fullRes.json()) as {
          id: string;
          topic: string;
          workType: string;
          slug?: string | null;
          extras?: string | null;
          result?: ReferatResult | null;
        };

        if (!data.result) {
          if (!cancelled) setLoadState("error");
          return;
        }

        if (!cancelled) {
          gen.hydrateCompleted({
            result: data.result,
            generationId: data.id,
            generationSlug: data.slug ?? null,
            workType: data.workType || order.workType,
            topic: data.topic || order.topic,
            extrasRaw: data.extras ?? null,
          });
          setLoadState("ready");
        }
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.taskId]);

  useEffect(() => {
    if (loadState !== "ready" || !gen.result || !missingExtras.length) return;
    if (gen.extrasGenerating) return;

    let cancelled = false;
    const pollDb = async () => {
      if (!gen.generationId || cancelled) return;
      try {
        const res = await fetch(`/api/generations/${gen.generationId}`, { cache: "no-store" });
        if (!res.ok) return;
        const row = (await res.json()) as { extras?: string | null; result?: ReferatResult };
        if (parseExtrasReady(row.extras).length) {
          gen.hydrateCompleted({
            result: row.result ?? gen.result!,
            generationId: gen.generationId,
            generationSlug: gen.generationSlug,
            workType: gen.workType || order.workType,
            topic: gen.topic || order.topic,
            extrasRaw: row.extras ?? null,
          });
        }
      } catch {
        /* retry */
      }
    };

    void pollDb();
    const id = setInterval(pollDb, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [
    loadState,
    gen.result,
    gen.generationId,
    gen.generationSlug,
    gen.workType,
    gen.topic,
    gen.extrasGenerating,
    gen.extrasReady,
    missingExtras.length,
    order.workType,
    order.topic,
    gen,
  ]);

  useEffect(() => {
    if (loadState !== "ready" || !gen.result || !missingExtras.length) return;
    if (gen.extrasGenerating || gen.extrasReady.length >= orderedExtras.length) return;
    void gen.startExtras(
      missingExtras,
      gen.result,
      gen.workType || order.workType,
      gen.topic || order.topic,
    );
  }, [
    loadState,
    gen.result,
    gen.workType,
    gen.topic,
    gen.extrasGenerating,
    gen.extrasReady.length,
    missingExtras,
    orderedExtras.length,
    order.workType,
    order.topic,
    gen,
  ]);

  const showPresentation =
    gen.extrasReady.includes("presentation") || orderedExtras.includes("presentation");
  const showSpeech = gen.extrasReady.includes("speech") || orderedExtras.includes("speech");
  const presReady = gen.extrasReady.includes("presentation");
  const speechReady = gen.extrasReady.includes("speech");
  const extrasPending = orderedExtras.length > 0 && missingExtras.length > 0;

  return (
    <div className={payStyles.pageRoot}>
      <div className={payStyles.pageMain}>
        <div className={payStyles.pageLayoutGrid}>
          <div className={payStyles.pagePreviewMain}>
            {loadState === "loading" ? (
              <div className={styles.doneLoading}>
                <div className={styles.spinner} aria-hidden />
                <p>Загружаем результат…</p>
              </div>
            ) : loadState === "error" || !gen.result ? (
              <div className={payStyles.pageTopicCard}>
                <p className={styles.doneLoadError}>
                  Не удалось загрузить текст работы. Скачайте DOCX справа или откройте в «Мои
                  работы».
                </p>
              </div>
            ) : (
              <OrderResultPreview workType={order.workType} result={gen.result} />
            )}
          </div>

          <aside className={payStyles.pagePayAside}>
            <div className={payStyles.pagePaySticky}>
              <div className={styles.genDoneCard}>
                <div className={styles.genDoneHeader}>
                  <span className={styles.genDoneBadge}>Готово</span>
                  <h2 className={styles.genDoneTitle}>Работа готова</h2>
                </div>
                <p className={styles.genDoneTopic}>{gen.result?.title ?? order.topic}</p>

                {extrasPending ? (
                  <div className={styles.extrasProgress}>
                    <p className={styles.extrasProgressTitle}>Дополнительные материалы</p>
                    <div className={styles.extrasProgressBar}>
                      <div
                        className={styles.extrasProgressFill}
                        style={{ width: `${gen.extrasProgress || 12}%` }}
                      />
                    </div>
                    <p className={styles.extrasProgressLabel}>
                      Генерируем {extrasLabel(orderedExtras)}…
                    </p>
                  </div>
                ) : null}

                {gen.extrasError ? (
                  <p className={styles.extrasError}>{gen.extrasError}</p>
                ) : null}

                <div className={styles.genDoneDownloads}>
                  <button
                    type="button"
                    className={styles.genDownloadBtn}
                    disabled={!gen.result}
                    onClick={() => void gen.downloadDocx().catch(() => alert("Ошибка скачивания"))}
                  >
                    <img src="/docx-icon.png" alt="" className={styles.genDownloadIcon} />
                    Скачать DOCX
                  </button>
                  {showPresentation ? (
                    <button
                      type="button"
                      className={styles.genDownloadBtn}
                      disabled={!presReady || gen.extrasGenerating}
                      onClick={() =>
                        void gen.downloadPresentation().catch(() => alert("Ошибка скачивания"))
                      }
                    >
                      <img src="/pptx-icon.svg" alt="" className={styles.genDownloadIcon} />
                      {presReady ? "Презентация" : "Презентация…"}
                    </button>
                  ) : null}
                  {showSpeech ? (
                    <button
                      type="button"
                      className={styles.genDownloadBtn}
                      disabled={!speechReady || gen.extrasGenerating}
                      onClick={() =>
                        void gen.downloadSpeech().catch(() => alert("Ошибка скачивания"))
                      }
                    >
                      <img src="/txt-icon.svg" alt="" className={styles.genDownloadIcon} />
                      {speechReady ? "Выступление" : "Выступление…"}
                    </button>
                  ) : null}
                </div>
                <div className={styles.genDoneFooter}>
                  <Link href="/dashboard" className={styles.genDashLink}>
                    Открыть в «Мои работы» →
                  </Link>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
