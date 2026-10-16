"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { QRCodeSVG } from "qrcode.react";
import styles from "./PaymentWidget.module.css";
import { detectPaymentMarket } from "@/lib/paymentMarket";
import { WORK_PRICES, EXTRAS_PRICES } from "@/lib/prices";
import { calcWorkOrderTotals, FIRST_ORDER_DISCOUNT_PERCENT } from "@/lib/firstOrderDiscount";
import { isAdminSessionRole, reachPaymentSuccessGoalOnce } from "@/lib/metrika";
import {
  type PreviewPayload,
  fetchPaymentPreviewDeduped,
  getMemoryPreviewPayload,
  loadPreviewSessionCache,
  previewCacheKey,
  rememberPaymentPreview,
} from "@/lib/paymentPreviewClient";
import {
  type PreviewTocRow,
  isLockedTocRow,
  savePreviewStructureForTask,
  supportsPreviewStructure,
  tocToStructure,
} from "@/lib/previewStructure";
import { savePublicChoiceForTask } from "@/lib/orderPublicChoice";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { YooMoneyCheckoutWidget: any; }
}

interface Props {
  workType: string;
  extras: string[];
  topic: string;
  returnUrl: string;
  onSuccess: (ctx?: { extras?: string[] }) => void;
  taskId?: string;
  asideSlot?: ReactNode;
}

type Screen = "select" | "sbp" | "card";
type Provider = "yookassa" | "robokassa";

const SBP_TIMEOUT_SEC = 600; // 10 минут

type DetectedLang = "ru" | "kz" | "en";
function detectDominantLang(text: string): DetectedLang {
  const t = (text || "").trim();
  if (!t) return "ru";

  // Kazakh-specific letters (Cyrillic)
  const kz = (t.match(/[әғқңөұүіһ]/gi) || []).length;
  // Russian Cyrillic letters (excluding KZ-specific to avoid double counting)
  const ru = (t.match(/[а-яё]/gi) || []).length;
  const en = (t.match(/[a-z]/gi) || []).length;

  // Если есть казахские спец-буквы — почти наверняка KZ
  if (kz > 0) return "kz";

  // Казахские “якорные” слова/транслит (на случай, когда спец-букв нет)
  // Примеры: "salem", "kalai", "rahmet", "kazakhstan", а также кириллица без "әғқ..."
  const kzWordHints = /\b(салем|сәлем|саламатсыз|кал(ай|аи)|қал(ай|аи)|рахмет|рақмет|казах(стан)?|қазақ(стан)?|куни|күнi|кунi|сен|сіз|сиз|жаз|жазып|тапсырма|реферат)\b/i;
  if (kzWordHints.test(t)) return "kz";

  if (kz > ru && kz > en) return "kz";
  if (en > ru && en > kz) return "en";
  return "ru";
}

function formatAmount(amount: number, currency: "RUB" | "KZT") {
  const symbol = currency === "KZT" ? "₸" : "₽";
  const rounded = currency === "KZT" ? Math.round(amount) : Math.round(amount);
  return `${rounded.toLocaleString("ru-RU")} ${symbol}`;
}

function convertRubToKzt(rub: number) {
  // Конвертация “через USD”, чтобы совпадать с логикой Robokassa (у них часто расчёт/отображение привязано к $).
  // Пример якоря из Robokassa: 299 ₽ ≈ 3.97 $  →  RUB_PER_USD ≈ 75.31
  // Дальше переводим USD → KZT (ориентировочно).
  //
  // Важно: это только отображение “сколько примерно”, реальная сумма — в платёжке.
  const RUB_PER_USD = 299 / 3.97; // ≈ 75.31
  const KZT_PER_USD = 510;        // ориентир, чтобы пользователь понимал порядок
  const usd = rub / RUB_PER_USD;
  return usd * KZT_PER_USD;
}

type PreviewExcerptSection = NonNullable<PreviewPayload["excerpt_sections"]>[number];

function tocRowDepth(num: string | undefined): number {
  const n = (num ?? "").trim();
  if (!n) return 0;
  if (/^\d+$/.test(n)) return 0;
  if (/^\d+(\.\d+)+$/.test(n)) return n.split(".").length - 1;
  return 0;
}

function formatTocNum(num: string | undefined): string | null {
  const n = (num ?? "").trim();
  if (!n) return null;
  return n.endsWith(".") ? n : `${n}.`;
}

function isSourcesTocRow(title: string): boolean {
  const t = title.toLowerCase();
  return /(список\s+литерат|источник|references|bibliography|дерекк)/i.test(t);
}

const LOCKED_PAGE_FILLER = [
  "В данном разделе раскрываются ключевые положения темы, приводятся аргументы и примеры из научной литературы. Текст выстроен логично и соответствует требованиям оформления по ГОСТ.",
  "Анализ материалов показывает взаимосвязь теоретических основ и практических аспектов. Здесь формулируются выводы по подразделу и намечаются направления дальнейшего рассмотрения.",
  "Рассматриваются основные подходы и современные точки зрения исследователей. Абзацы связаны между собой и поддерживают общую линию рассуждения работы.",
];

function isGenericLockedTitle(title: string): boolean {
  return /^(раздел|section|бөлім)\s+\d+$/i.test(title.trim());
}

function isConclusionTocRow(title: string): boolean {
  const t = title.toLowerCase();
  return /(заключени|қорытынды|conclusion)/i.test(t);
}

function tocNumLabel(row: { num?: string; title: string }): string | null {
  if (isSourcesTocRow(row.title) || isConclusionTocRow(row.title)) return null;
  return formatTocNum(row.num);
}

function chapterTitleFromTocRow(row: { num?: string; title: string }): string {
  if (isSourcesTocRow(row.title) || isConclusionTocRow(row.title)) return "";
  const numLabel = formatTocNum(row.num ?? "");
  return numLabel ? `${numLabel} ${row.title}` : row.title;
}

function isIntroductionTocRow(title: string): boolean {
  return /^(введение|introduction|кіріспе)$/i.test(title.trim());
}

function stripLeadingNumber(text: string): string {
  return (text ?? "").replace(/^\d+(\.\d+)*\.?\s*/, "").trim();
}

function fullTocTitle(row: PreviewTocRow): string {
  const cleanTitle = stripLeadingNumber(row.title);
  const numLabel = formatTocNum(row.num);
  return numLabel ? `${numLabel} ${cleanTitle}` : cleanTitle;
}

function formatSectionTitleWithToc(title: string, toc: PreviewTocRow[]): string {
  const clean = stripLeadingNumber(title).toLowerCase().trim();
  if (!clean) return title;
  if (isIntroductionTocRow(clean)) return title;

  const match = toc.find((r) => stripLeadingNumber(r.title).toLowerCase().trim() === clean);
  if (match) {
    return fullTocTitle(match);
  }
  if (/^1(\.|\s|$)/.test(title.trim()) || title.toLowerCase().includes("глава 1")) {
    const ch1 = toc.find((r) => (r.num ?? "").trim() === "1");
    if (ch1) return fullTocTitle(ch1);
  }
  return title;
}

function getLockedChapterTitles(
  toc: PreviewTocRow[],
  shownTitles: string[],
  fallbackLocked?: string[],
): string[] {
  const shownNorm = new Set(
    shownTitles.map((s) => stripLeadingNumber(s).toLowerCase().trim())
  );

  const titles: string[] = [];

  for (const row of toc) {
    const cleanTitle = stripLeadingNumber(row.title);
    if (!cleanTitle) continue;
    // Если этот пункт оглавления уже отображен в открытом фрагменте превью (введение, глава 1)
    if (shownNorm.has(cleanTitle.toLowerCase().trim())) {
      continue;
    }
    // Включаем в закрытые листы строго по порядку оглавления с полным номером и названием
    titles.push(fullTocTitle(row));
  }

  if (titles.length > 0) {
    return titles;
  }

  const fallback = (fallbackLocked ?? []).map((t) => t.trim()).filter(Boolean);
  return fallback.slice(0, 5);
}

function isEssayOrTest(workType: string): boolean {
  const norm = (workType || "").trim().toLowerCase();
  return norm === "сочинение" || norm === "эссе" || norm === "тест";
}

function resolveExtrasSelection(workType: string, extras?: string[] | null): string[] {
  if (isEssayOrTest(workType)) return [];
  if (Array.isArray(extras) && extras.length > 0) return extras;
  return ["presentation", "speech"];
}

function LockedChapterSheet({ title, fillerIndex }: { title: string; fillerIndex: number }) {
  const fillers = [
    LOCKED_PAGE_FILLER[fillerIndex % LOCKED_PAGE_FILLER.length],
    LOCKED_PAGE_FILLER[(fillerIndex + 1) % LOCKED_PAGE_FILLER.length],
    LOCKED_PAGE_FILLER[(fillerIndex + 2) % LOCKED_PAGE_FILLER.length],
  ];

  return (
    <div className={styles.docStackWrap}>
      <div className={styles.docStackGhost2} aria-hidden />
      <div className={styles.docStackGhost1} aria-hidden />
      <div className={styles.docPage}>
        <div className={styles.docPageRuler} aria-hidden />
        <div className={styles.excerptHeadPage}>{title}</div>
        <div className={`${styles.docPageBody} ${styles.lockedSheetBody}`}>
          <div className={styles.lockedSheetText} aria-hidden>
            {fillers.map((p, i) => (
              <p key={i} className={styles.excerptPara}>{p}</p>
            ))}
          </div>
          <div className={styles.lockedSheetFrost} aria-hidden />
          <div className={styles.lockedSheetBadge}>
            <span className={styles.lockedSheetBadgeIcon} aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <span className={styles.lockedSheetBadgeTitle}>Генерация после оплаты</span>
            <span className={styles.lockedSheetBadgeSub}>Раздел появится в полном DOCX</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const PREVIEW_RETENTION_TIPS = [
  "Пока ждёте — справа уже можно выбрать способ оплаты.",
  "После оплаты скачаете полный DOCX: титульник, оглавление и список литературы.",
  "Источники подбираются через CrossRef — у многих есть DOI для проверки.",
  "Текст генерируется под вашу тему, а не из готового шаблона.",
  "Оформление — шрифт, поля и интервал — по ГОСТ 7.32-2017.",
  "Полную работу можно отредактировать в Word после скачивания.",
];

function getPreviewWaitSteps(workType: string): { label: string; at: number }[] {
  if (isEssayOrTest(workType)) {
    return [
      { label: "Анализируем тему", at: 0 },
      { label: "Составляем план работы", at: 5 },
      { label: "Пишем введение и основную часть", at: 12 },
      { label: "Связываем абзацы в единый текст", at: 20 },
      { label: "Готовим фрагмент для просмотра", at: 28 },
    ];
  }
  return [
    { label: "Анализируем тему", at: 0 },
    { label: "Составляем структуру и оглавление", at: 5 },
    { label: "Ищем источники в научных базах", at: 11 },
    { label: "Пишем введение и фрагмент разделов", at: 18 },
    { label: "Оформляем текст по ГОСТ", at: 25 },
    { label: "Собираем предпросмотр", at: 30 },
  ];
}

function truncateTopic(topic: string, max = 72): string {
  const t = topic.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Первые абзацы читаемы, остальное под блюром (страница заказа). */
function splitExcerptTeaser(text: string): { visible: string; hidden: string } {
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (!paragraphs.length) return { visible: "", hidden: "" };
  if (paragraphs.length === 1 && paragraphs[0].length <= 420) {
    return { visible: paragraphs[0], hidden: "" };
  }
  let visible = paragraphs[0];
  let rest = paragraphs.slice(1);
  if (visible.length < 220 && rest.length > 0) {
    visible = `${visible}\n\n${rest[0]}`;
    rest = rest.slice(1);
  }
  return { visible, hidden: rest.join("\n\n") };
}

function essayMainPartLabel(docLang: string): string {
  if (docLang === "kz") return "Негізгі бөлім";
  if (docLang === "en") return "Main part";
  return "Основная часть";
}

function PreviewLoadingPane({
  topic,
  workType,
}: {
  topic: string;
  workType: string;
}) {
  const steps = getPreviewWaitSteps(workType);
  const [stepIndex, setStepIndex] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    setStepIndex(0);
    setTipIndex(0);
    setProgress(0);
  }, [topic, workType]);

  useEffect(() => {
    const progressTick = window.setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      setProgress(Math.min(92, Math.round((1 - Math.exp(-elapsed / 45)) * 92)));

      let idx = 0;
      for (let i = steps.length - 1; i >= 0; i--) {
        if (elapsed >= steps[i].at) {
          idx = i;
          break;
        }
      }
      setStepIndex(idx);
    }, 350);

    const tipTick = window.setInterval(() => {
      setTipIndex((i) => (i + 1) % PREVIEW_RETENTION_TIPS.length);
    }, 6000);

    return () => {
      window.clearInterval(progressTick);
      window.clearInterval(tipTick);
    };
  }, [steps]);

  const topicShort = truncateTopic(topic);

  return (
    <div className={styles.previewLoadingPage}>
      <div className={styles.previewSpinner} role="status" aria-label="Загрузка" />
      <p className={styles.previewLoadingTitle}>Готовим вашу работу</p>
      {topicShort ? (
        <p className={styles.previewLoadingTopic}>
          Тема: <span>«{topicShort}»</span>
        </p>
      ) : null}

      <div className={styles.previewProgressWrap} aria-hidden>
        <div className={styles.previewProgressTrack}>
          <div className={styles.previewProgressFill} style={{ width: `${progress}%` }} />
        </div>
        <span className={styles.previewProgressPct}>{progress}%</span>
      </div>
      <p className={styles.previewEta}>
        {`Обычно 30–90 секунд · ${workType}. Не закрывайте страницу.`}
      </p>

      <ul className={styles.previewSteps} aria-label="Этапы подготовки">
        {steps.map((step, i) => {
          const state = i < stepIndex ? "done" : i === stepIndex ? "active" : "pending";
          const stateClass =
            state === "done"
              ? styles.previewStep_done
              : state === "active"
                ? styles.previewStep_active
                : styles.previewStep_pending;
          return (
            <li key={step.label} className={`${styles.previewStep} ${stateClass}`}>
              <span className={styles.previewStepIcon} aria-hidden>
                {state === "done" ? "✓" : state === "active" ? "●" : "○"}
              </span>
              <span className={styles.previewStepLabel}>{step.label}</span>
            </li>
          );
        })}
      </ul>

      <div className={styles.previewTipCard} key={tipIndex}>
        <p className={styles.previewTipText}>{PREVIEW_RETENTION_TIPS[tipIndex]}</p>
      </div>
    </div>
  );
}

function PaymentPreviewPane({
  loading,
  error,
  data,
  workType,
  topic,
  onRetry,
  topicOnlyFallback,
  tocRows,
  tocEditable,
  tocEditing,
  onStartTocEdit,
  onCancelTocEdit,
  onFinishTocEdit,
  onTocTitleChange,
}: {
  loading: boolean;
  error: string;
  data: PreviewPayload | null;
  workType: string;
  topic: string;
  onRetry?: () => void;
  /** Без превью оплаты — только карточка темы (режим генерации/готово) */
  topicOnlyFallback?: boolean;
  tocRows?: PreviewTocRow[];
  tocEditable?: boolean;
  tocEditing?: boolean;
  onStartTocEdit?: () => void;
  onCancelTocEdit?: () => void;
  onFinishTocEdit?: () => void;
  onTocTitleChange?: (index: number, title: string) => void;
}) {
  const colClass = styles.previewColPage;

  if (loading) {
    return (
      <div className={colClass}>
        <PreviewLoadingPane topic={topic} workType={workType} />
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className={colClass}>
        <p className={styles.previewErrorText}>{error}</p>
        {onRetry ? (
          <button type="button" className={styles.previewRetryBtn} onClick={onRetry}>
            Повторить загрузку превью
          </button>
        ) : null}
        <p className={styles.previewHintMuted}>Оплата — в блоке справа (на телефоне ниже).</p>
      </div>
    );
  }
  if (!data) {
    if (topicOnlyFallback) {
      return (
        <div className={colClass}>
          <div className={styles.pageTopicCard}>
            <span className={styles.pageTopicBadge}>{workType}</span>
            <h1 className={styles.pageTopicTitle}>{topic}</h1>
            <p className={styles.pageTopicMeta}>
              {WORK_PRICES[workType]?.pages ?? ""} · DOCX по ГОСТ · уникальность 70–90%
            </p>
          </div>
        </div>
      );
    }
    return null;
  }

  const rawSections = (data.excerpt_sections ?? []).filter((s) => (s.text || "").trim());
  const sections: PreviewExcerptSection[] =
    rawSections.length > 0
      ? rawSections
      : [{ title: data.excerpt_title, text: data.excerpt }];

  const isEssayLike = isEssayOrTest(workType);
  const displayToc = tocRows ?? data.toc;
  const showTocBlock = data.has_toc_sheet && displayToc.length > 0 && !isEssayLike;
  const tocHeadline =
    data.doc_lang === "kz"
      ? "МАЗМҰНЫ"
      : data.doc_lang === "en"
        ? "CONTENTS"
        : "СОДЕРЖАНИЕ";
  const shownSectionTitles = sections.map((s) => s.title);
  const lockedChapterTitles = isEssayLike
    ? []
    : getLockedChapterTitles(displayToc, shownSectionTitles, data.locked_section_titles);

  return (
    <div className={colClass}>
      <div className={styles.pageTopicCard}>
        <span className={styles.pageTopicBadge}>{workType}</span>
        <h1 className={styles.pageTopicTitle}>{data.topic}</h1>
        <p className={styles.pageTopicMeta}>
          {WORK_PRICES[workType]?.pages ?? ""} · DOCX по ГОСТ · уникальность 70–90%
        </p>
      </div>
      {showTocBlock && (
        <div className={styles.pageSectionCard}>
          <div className={styles.tocHeadRow}>
            <div className={styles.tocHeadPage}>{tocHeadline}</div>
            {tocEditable && !tocEditing && onStartTocEdit ? (
              <button type="button" className={styles.tocEditBtn} onClick={onStartTocEdit}>
                Изменить
              </button>
            ) : null}
            {tocEditing && onCancelTocEdit && onFinishTocEdit ? (
              <div className={styles.tocEditActions}>
                <button type="button" className={styles.tocEditCancelBtn} onClick={onCancelTocEdit}>
                  Отмена
                </button>
                <button type="button" className={styles.tocEditDoneBtn} onClick={onFinishTocEdit}>
                  Готово
                </button>
              </div>
            ) : null}
          </div>
          <ul className={styles.tocListPage}>
            {displayToc.map((row, i) => {
              const depth = tocRowDepth(row.num);
              const numLabel = tocNumLabel(row);
              const locked = isLockedTocRow(row);
              const canEditRow = tocEditing && onTocTitleChange && !locked;
              return (
                <li
                  key={`${row.num ?? ""}-${i}`}
                  className={`${styles.tocRow}${locked && tocEditing ? ` ${styles.tocRowLocked}` : ""}`}
                  style={{ paddingLeft: `${6 + depth * 15}px` }}
                >
                  <span className={styles.tocRowMain}>
                    {numLabel ? <span className={styles.tocNum}>{numLabel}</span> : null}
                    {canEditRow ? (
                      <input
                        type="text"
                        className={styles.tocTitleInput}
                        value={row.title}
                        maxLength={200}
                        aria-label={`Название раздела ${numLabel || i + 1}`}
                        onChange={(e) => onTocTitleChange(i, e.target.value)}
                      />
                    ) : (
                      <span className={locked && tocEditing ? styles.tocTitleLocked : styles.tocTitle}>
                        {row.title}
                      </span>
                    )}
                  </span>
                  {!tocEditing ? <span className={styles.tocPage}>{row.page}</span> : null}
                </li>
              );
            })}
          </ul>
          {tocEditing ? (
            <p className={styles.tocEditHint}>
              Редактируются только главы и подглавы. Введение, заключение и список литературы не меняются.
            </p>
          ) : null}
        </div>
      )}
      {!isEssayLike && (
        <h2 className={styles.pageSectionTitle}>Фрагмент документа</h2>
      )}
      {sections.map((sec, idx) => {
        const sectionTitle = isEssayLike
          ? essayMainPartLabel(data.doc_lang)
          : formatSectionTitleWithToc(sec.title, displayToc);
        const { visible, hidden } = splitExcerptTeaser(sec.text);
        const bodyParas = sec.text.split(/\n\n+/).filter(Boolean);

        return (
        <div key={idx}>
        <div className={styles.docStackWrap}>
              <div className={styles.docStackGhost2} aria-hidden />
              <div className={styles.docStackGhost1} aria-hidden />
              <div className={styles.docPage}>
                <div className={styles.docPageRuler} aria-hidden />
                <div
                  className={
                    isEssayLike
                      ? styles.pageDocSheetBar
                      : styles.excerptHeadPage
                  }
                >
                  {sectionTitle}
                </div>
                <div className={styles.docPageBody}>
                  {visible
                    .split(/\n\n+/)
                    .filter(Boolean)
                    .map((p, i) => (
                      <p key={`v-${i}`} className={styles.excerptPara}>{p}</p>
                    ))}
                  {hidden ? (
                    <div className={styles.excerptPageHidden}>
                      {hidden.split(/\n\n+/).filter(Boolean).map((p, i) => (
                        <p key={`h-${i}`} className={styles.excerptPara}>{p}</p>
                      ))}
                    </div>
                  ) : null}
                  {!hidden && bodyParas.length > 1 ? (
                    <div className={styles.excerptGhostTail} aria-hidden>
                      {bodyParas.slice(1, 3).map((p, i) => (
                        <p key={`g-${i}`} className={styles.excerptPara}>{p}</p>
                      ))}
                    </div>
                  ) : null}
                  <div className={styles.excerptFrostOverlay} aria-hidden />
                  <div className={styles.excerptPayWall}>
                    <span className={styles.excerptPayWallIcon} aria-hidden>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M8 11V8a4 4 0 118 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span className={styles.excerptPayWallTitle}>Генерация после оплаты</span>
                    <span className={styles.excerptPayWallSub}>Все главы, заключение и список литературы — в DOCX</span>
                  </div>
                </div>
              </div>
        </div>
        </div>
      );
      })}
      {lockedChapterTitles.length > 0 ? (
        <div className={styles.lockedChaptersBlock}>
          {lockedChapterTitles.map((title, li) => (
            <LockedChapterSheet key={`${title}-${li}`} title={title} fillerIndex={li} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function PaymentWidget({
  workType,
  extras,
  topic,
  returnUrl,
  onSuccess,
  taskId,
  asideSlot,
}: Props) {
  const { data: session, update: updateSession } = useSession();
  const skipMetrikaRef = useRef(false);
  useEffect(() => {
    skipMetrikaRef.current = isAdminSessionRole(
      (session?.user as { role?: string } | null)?.role
    );
  }, [session]);
  const [mounted, setMounted]           = useState(false);
  const [screen, setScreen]             = useState<Screen>("select");
  const [methodLoading, setMethodLoading] = useState<"sbp" | "card" | null>(null);
  const [provider, setProvider]         = useState<Provider>("yookassa");
  const [error, setError]               = useState("");
  const [market, setMarket]             = useState<"ru" | "kz">("ru");

  // SBP state
  const [sbpUrl, setSbpUrl]             = useState("");
  const [yokassaPayId, setYokassaPayId] = useState("");
  const [sbpTimer, setSbpTimer]         = useState(SBP_TIMEOUT_SEC);
  const sbpPollRef                      = useRef<ReturnType<typeof setInterval> | null>(null);
  const sbpTimerRef                     = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isMobile, setIsMobile]         = useState(false);
  const [isCompactPay, setIsCompactPay] = useState(false);

  // Card widget state
  const [cardLoading, setCardLoading]   = useState(true);
  const widgetRef                       = useRef<any>(null);
  const cardInitRef                     = useRef(false);
  const [confirmationToken, setConfirmationToken] = useState("");

  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewData, setPreviewData] = useState<PreviewPayload | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewRetryKey, setPreviewRetryKey] = useState(0);
  const [editedToc, setEditedToc] = useState<PreviewTocRow[] | null>(null);
  const [tocEditing, setTocEditing] = useState(false);

  const supportsTocStructure = supportsPreviewStructure(workType);
  const effectiveToc = editedToc ?? previewData?.toc ?? [];

  const supportsExtras = !isEssayOrTest(workType);
  const [selectedExtras, setSelectedExtras] = useState<string[]>(() =>
    resolveExtrasSelection(workType, extras),
  );

  useEffect(() => {
    if (Array.isArray(extras) && extras.length > 0) {
      setSelectedExtras(extras);
    }
  }, [extras]);

  useEffect(() => {
    if (!supportsExtras) return;
    try {
      sessionStorage.setItem("pendingExtrasChoice", JSON.stringify(selectedExtras));
    } catch { /* ignore */ }
  }, [selectedExtras, supportsExtras]);

  const toggleExtra = (key: "presentation" | "speech") => {
    setSelectedExtras((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
    );
  };

  useEffect(() => {
    setEditedToc(null);
    setTocEditing(false);
  }, [topic, workType, previewRetryKey]);

  useEffect(() => {
    if (!taskId || !supportsTocStructure) return;
    const toc = editedToc ?? previewData?.toc;
    if (!toc?.length) return;
    savePreviewStructureForTask(taskId, tocToStructure(toc));
  }, [taskId, supportsTocStructure, editedToc, previewData?.toc]);

  function handleTocTitleChange(index: number, title: string) {
    setEditedToc((prev) => {
      const base = prev ?? previewData?.toc ?? [];
      const row = base[index];
      if (!row || isLockedTocRow(row)) return prev ?? base;
      return base.map((r, i) => (i === index ? { ...r, title: title.slice(0, 200) } : r));
    });
  }

  function finishCheckoutSuccess(ctx?: { extras?: string[] }) {
    onSuccess(ctx);
  }

  const showPreviewColumn = true;

  const reloadPreview = () => {
    setPreviewLoading(true);
    setPreviewError("");
    setPreviewRetryKey((k) => k + 1);
  };

  useEffect(() => {
    let cancelled = false;
    const key = previewCacheKey(topic, workType);

    const cached = loadPreviewSessionCache(topic, workType) ?? getMemoryPreviewPayload(key);
    if (cached) {
      setPreviewData(cached);
      setPreviewLoading(false);
      setPreviewError("");
      return;
    }

    try {
      const restoreRaw = sessionStorage.getItem("paymentWidgetRestore");
      if (restoreRaw) {
        const restore = JSON.parse(restoreRaw) as {
          topic?: string;
          workType?: string;
          previewData?: PreviewPayload | null;
        };
        if (
          restore.topic?.trim() === topic.trim() &&
          restore.workType === workType &&
          restore.previewData
        ) {
          rememberPaymentPreview(topic, workType, restore.previewData);
          setPreviewData(restore.previewData);
          setPreviewLoading(false);
          setPreviewError("");
          return;
        }
      }
    } catch { /* ignore */ }

    // Режим генерации/готово: не запрашиваем превью оплаты повторно (иначе слева снова «6%»)
    if (asideSlot) {
      setPreviewLoading(false);
      setPreviewError("");
      return;
    }

    void (async () => {
      const result = await fetchPaymentPreviewDeduped(topic, workType);
      if (cancelled) return;
      if (result.ok) {
        setPreviewData(result.data);
        setPreviewLoading(false);
        setPreviewError("");
        void updateSession();
        return;
      }
      setPreviewError(result.error);
      setPreviewLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- тема/тип/retry; updateSession при успехе
  }, [topic, workType, previewRetryKey, asideSlot]);

  const lang = detectDominantLang(topic);
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = userRole === "admin";
  const firstOrderDiscountEligible =
    (session?.user as { firstOrderDiscountEligible?: boolean } | undefined)
      ?.firstOrderDiscountEligible === true;
  const discountActive =
    firstOrderDiscountEligible && userRole !== "admin" && userRole !== "yukassa_test";
  const base = WORK_PRICES[workType]?.price ?? 0;
  const extrasAmount = selectedExtras.reduce((sum, item) => sum + (EXTRAS_PRICES[item] ?? 0), 0);
  const orderTotals = calcWorkOrderTotals(base, extrasAmount, discountActive);
  const totalRub = orderTotals.totalRub;
  const originalTotalRub = orderTotals.originalTotalRub;
  const priceDiscountApplied = orderTotals.discountApplied;
  const totalKzt = convertRubToKzt(totalRub);
  const isKzUi = market === "kz";
  const primaryAmount = isKzUi ? formatAmount(totalKzt, "KZT") : formatAmount(totalRub, "RUB");
  const secondaryAmount = isKzUi ? `≈ ${formatAmount(totalRub, "RUB")}` : "";
  const workLabel = WORK_PRICES[workType]?.label ?? workType;
  const orderLabel = `${workLabel} • DOCX${workType === "Сочинение" || workType === "Эссе" ? "" : " + источники"}`;
  const langLabel = lang === "kz" ? "Қазақша" : lang === "en" ? "English" : "Русский";
  const useCompactPay = isCompactPay && showPreviewColumn;

  useEffect(() => {
    setMounted(true);
    setIsMobile(window.innerWidth < 768 || /Android|iPhone|iPad/i.test(navigator.userAgent));
    const m = detectPaymentMarket();
    setMarket(m);
    setProvider(m === "kz" ? "robokassa" : "yookassa");
    const mq = window.matchMedia("(max-width: 900px)");
    const onMq = () => setIsCompactPay(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  // Если тема явно на казахском — показываем KZ-рынок и Robokassa по умолчанию.
  // Это особенно важно для русскоязычного интерфейса, когда пользователь пишет тему на казахском.
  useEffect(() => {
    if (lang !== "kz") return;
    setMarket(prev => prev === "kz" ? prev : "kz");
    setProvider(prev => prev === "robokassa" ? prev : "robokassa");
  }, [lang]);

  // Чистка при анмаунте
  useEffect(() => {
    return () => {
      sbpPollRef.current && clearInterval(sbpPollRef.current);
      sbpTimerRef.current && clearInterval(sbpTimerRef.current);
      widgetRef.current?.destroy?.();
    };
  }, []);

  // Инициализация виджета карты когда экран = "card" и токен получен
  useEffect(() => {
    if (screen !== "card" || !confirmationToken || cardInitRef.current) return;
    cardInitRef.current = true;

    function initWidget() {
      try {
        widgetRef.current = new window.YooMoneyCheckoutWidget({
          confirmation_token: confirmationToken,
          return_url: returnUrl,
          error_callback(err: unknown) {
            console.error("[PaymentWidget] card error:", err);
            setError("Ошибка при загрузке формы оплаты");
            setCardLoading(false);
          },
        });
        widgetRef.current.render("yw-card-container").then(() => setCardLoading(false));
      } catch (e) {
        console.error("[PaymentWidget] card init error:", e);
        setError("Не удалось загрузить форму оплаты");
        setCardLoading(false);
      }
    }

    if (window.YooMoneyCheckoutWidget) {
      initWidget();
    } else {
      const script = document.createElement("script");
      script.src = "https://yookassa.ru/checkout-widget/v1/checkout-widget.js";
      script.onload = initWidget;
      script.onerror = () => { setError("Не удалось загрузить форму оплаты"); setCardLoading(false); };
      document.head.appendChild(script);
    }
  }, [screen, confirmationToken, returnUrl]);

  async function handleSelectMethod(method: "sbp" | "card") {
    setError("");
    setMethodLoading(method);
    try {
      const res = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workType,
          extras: selectedExtras.length > 0 ? selectedExtras : undefined,
          method,
          market: provider === "robokassa" ? "kz" : "ru",
          ...(taskId ? { taskId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка создания платежа");
        setMethodLoading(null);
        return;
      }

      try {
        const pending = JSON.parse(sessionStorage.getItem("pendingGeneration") || "{}");
        sessionStorage.setItem(
          "pendingGeneration",
          JSON.stringify({ ...pending, paymentId: data.paymentId, ...(taskId ? { taskId } : {}) }),
        );
      } catch {}

      // Robokassa / внешний redirect — сохраняем превью для возврата «Назад»
      if (typeof data.paymentUrl === "string" && data.paymentUrl) {
        persistPaymentWidgetRestore();
        window.location.href = data.paymentUrl;
        return;
      }

      if (method === "sbp") {
        setSbpUrl(data.confirmationUrl);
        setYokassaPayId(data.yokassaPaymentId);
        setScreen("sbp");
        startSbpPolling(data.yokassaPaymentId);
        startSbpTimer();
      } else {
        setConfirmationToken(data.confirmationToken);
        setScreen("card");
      }
    } catch {
      setError("Не удалось создать платёж");
    }
    setMethodLoading(null);
  }

  async function handleRobokassaPay() {
    setError("");
    setMethodLoading("card");
    try {
      const res = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workType,
          extras: selectedExtras.length > 0 ? selectedExtras : undefined,
          market: "kz",
          ...(taskId ? { taskId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка создания платежа");
        return;
      }
      try {
        const pending = JSON.parse(sessionStorage.getItem("pendingGeneration") || "{}");
        sessionStorage.setItem(
          "pendingGeneration",
          JSON.stringify({ ...pending, paymentId: data.paymentId, ...(taskId ? { taskId } : {}) }),
        );
      } catch {}
      if (typeof data.paymentUrl === "string" && data.paymentUrl) {
        persistPaymentWidgetRestore();
        window.location.href = data.paymentUrl;
      } else {
        setError("Не удалось открыть форму оплаты");
      }
    } catch {
      setError("Не удалось создать платёж");
    } finally {
      setMethodLoading(null);
    }
  }

  function persistPaymentWidgetRestore() {
    try {
      let pages: number | undefined;
      try {
        const pending = JSON.parse(sessionStorage.getItem("pendingGeneration") || "{}") as { pages?: number };
        if (typeof pending.pages === "number" && pending.pages > 0) pages = pending.pages;
      } catch { /* ignore */ }
      sessionStorage.setItem(
        "paymentWidgetRestore",
        JSON.stringify({
          topic,
          workType,
          extras: selectedExtras ?? [],
          pages,
          taskId: taskId ?? null,
          openedAt: Date.now(),
          previewData: previewData ?? null,
        })
      );
    } catch { /* ignore */ }
  }

  function startSbpPolling(payId: string) {
    sbpPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/payment/check?yokassaPaymentId=${payId}`);
        const data = await res.json();
        if (data.status === "succeeded") {
          stopSbp();
          try {
            const pending = JSON.parse(sessionStorage.getItem("pendingGeneration") || "{}") as {
              paymentId?: string;
            };
            if (pending.paymentId) {
              reachPaymentSuccessGoalOnce(`ym_pay_ok_${pending.paymentId}`, {
                skip: skipMetrikaRef.current,
              });
            }
          } catch { /* ignore */ }
          finishCheckoutSuccess({ extras: selectedExtras });
        } else if (data.status === "canceled") {
          stopSbp();
          setError("Платёж отменён");
          setScreen("select");
        }
      } catch {}
    }, 3000);
  }

  function startSbpTimer() {
    setSbpTimer(SBP_TIMEOUT_SEC);
    sbpTimerRef.current = setInterval(() => {
      setSbpTimer(prev => {
        if (prev <= 1) {
          stopSbp();
          setError("Время ожидания истекло");
          setScreen("select");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function stopSbp() {
    sbpPollRef.current && clearInterval(sbpPollRef.current);
    sbpTimerRef.current && clearInterval(sbpTimerRef.current);
    sbpPollRef.current = null;
    sbpTimerRef.current = null;
  }

  function formatTimer(sec: number) {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function handleAdminStart() {
    finishCheckoutSuccess({ extras: selectedExtras.length > 0 ? selectedExtras : undefined });
  }

  if (!mounted) return null;

  const previewPane = (
    <PaymentPreviewPane
      loading={previewLoading}
      error={previewError}
      data={previewData}
      workType={workType}
      topic={topic}
      onRetry={asideSlot ? undefined : reloadPreview}
      topicOnlyFallback={!!asideSlot}
      tocRows={supportsTocStructure ? effectiveToc : undefined}
      tocEditable={supportsTocStructure && !asideSlot && effectiveToc.length > 0}
      tocEditing={tocEditing}
      onStartTocEdit={() => setTocEditing(true)}
      onCancelTocEdit={() => {
        setEditedToc(null);
        setTocEditing(false);
      }}
      onFinishTocEdit={() => setTocEditing(false)}
      onTocTitleChange={handleTocTitleChange}
    />
  );

  const payColumn = (
    <>
      {screen === "select" && (
        <>
          {useCompactPay ? (
            <>
              <div className={styles.payCompactHead}>
                <h2 id="payment-widget-title" className={styles.payCompactTitle}>
                  {isAdmin ? "Генерация" : "Оплата"}
                </h2>
                <div className={styles.payCompactAmountWrap}>
                  {!isAdmin && priceDiscountApplied && (
                    <span className={styles.payDiscountBadge}>−{FIRST_ORDER_DISCOUNT_PERCENT}%</span>
                  )}
                  <span className={styles.payCompactAmount}>
                    {!isAdmin && priceDiscountApplied && !isKzUi && (
                      <span className={styles.payAmountOld} aria-hidden>
                        {formatAmount(originalTotalRub, "RUB")}
                      </span>
                    )}
                    {isAdmin ? "0 ₽" : primaryAmount}
                    {!isAdmin && secondaryAmount ? (
                      <span className={styles.payCompactAmountSub}> {secondaryAmount}</span>
                    ) : null}
                  </span>
                </div>
              </div>
              <p className={styles.orderCompact} aria-label="Состав заказа">
                {workLabel} · {langLabel}
                {selectedExtras.includes("presentation") ? " · PPTX" : ""}
                {selectedExtras.includes("speech") ? " · Выступление" : ""}
              </p>
              {supportsExtras ? (
                <OrderExtrasPicker
                  compact
                  selected={selectedExtras}
                  onToggle={toggleExtra}
                />
              ) : null}
              {previewLoading && (
                <p className={styles.payWhilePreviewCompact}>
                  Готовим превью — оплата будет ниже после прокрутки
                </p>
              )}
            </>
          ) : (
            <>
              <h2 id="payment-widget-title" className={styles.title}>
                {isAdmin ? "Запуск генерации" : "Оплата заказа"}
              </h2>
              <p className={styles.subtitle}>
                {isAdmin ? "Без оплаты для администратора" : "Выберите способ оплаты"}
              </p>
              {previewLoading && (
                <p className={styles.payWhilePreview}>
                  Превью готовится слева — {isAdmin ? "запуск будет ниже" : "способ оплаты можно выбрать уже сейчас"}
                </p>
              )}
              <div className={styles.orderSummary} aria-label="Состав заказа">
                <div className={styles.orderLine}>
                  <span className={styles.orderKey}>{isAdmin ? "Стоимость:" : "К оплате:"}</span>
                  <span className={styles.orderValue}>
                    {!isAdmin && priceDiscountApplied && !isKzUi && (
                      <span className={styles.payAmountOld} aria-hidden>
                        {formatAmount(originalTotalRub, "RUB")}{" "}
                      </span>
                    )}
                    {isAdmin ? "0 ₽" : `${primaryAmount}${secondaryAmount ? ` ${secondaryAmount}` : ""}`}
                  </span>
                </div>
                {!isAdmin && priceDiscountApplied && (
                  <div className={styles.orderLine}>
                    <span className={styles.orderKey}>Скидка:</span>
                    <span className={styles.orderValue}>−{FIRST_ORDER_DISCOUNT_PERCENT}% · первый заказ</span>
                  </div>
                )}
                <div className={styles.orderLine}>
                  <span className={styles.orderKey}>Заказ:</span>
                  <span className={styles.orderValue}>{orderLabel}</span>
                </div>
                <div className={styles.orderLine}>
                  <span className={styles.orderKey}>Язык:</span>
                  <span className={styles.orderValue}>{langLabel}</span>
                </div>
              </div>
              {supportsExtras ? (
                <OrderExtrasPicker
                  selected={selectedExtras}
                  onToggle={toggleExtra}
                />
              ) : null}
              {!isAdmin && <PaymentGuaranteesList />}
            </>
          )}
          {isAdmin ? (
            <AdminOrderActions compact={useCompactPay} onStart={handleAdminStart} />
          ) : (
            <>
          {error && <p className={styles.errorBanner}>⚠ {error}</p>}
          {useCompactPay ? (
            <>
              <div className={styles.providerSegment} role="tablist" aria-label="Регион оплаты">
                <button
                  type="button"
                  role="tab"
                  aria-selected={provider === "yookassa"}
                  className={`${styles.providerSegBtn} ${provider === "yookassa" ? styles.providerSegBtnActive : ""}`}
                  onClick={() => { setProvider("yookassa"); setMarket("ru"); }}
                  disabled={!!methodLoading}
                >
                  <FlagRU /> РФ
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={provider === "robokassa"}
                  className={`${styles.providerSegBtn} ${provider === "robokassa" ? styles.providerSegBtnActive : ""}`}
                  onClick={() => { setProvider("robokassa"); setMarket("kz"); }}
                  disabled={!!methodLoading}
                >
                  <FlagKZ /> KZ
                </button>
              </div>
              {provider === "yookassa" ? (
                <div className={styles.methodsCompact}>
                  <button
                    type="button"
                    className={`${styles.methodCompact} ${styles.methodSbp}`}
                    onClick={() => handleSelectMethod("sbp")}
                    disabled={!!methodLoading}
                    aria-label="Оплата через СБП"
                  >
                    <span className={styles.methodCompactIcon}><SbpIcon /></span>
                    <span className={styles.methodCompactName}>СБП</span>
                    {methodLoading === "sbp"
                      ? <span className={styles.methodSpinner} />
                      : <span className={styles.methodCompactBadge}>лучший</span>}
                  </button>
                  <button
                    type="button"
                    className={`${styles.methodCompact} ${styles.methodCard}`}
                    onClick={() => handleSelectMethod("card")}
                    disabled={!!methodLoading}
                    aria-label="Оплата картой"
                  >
                    <span className={styles.methodCompactIcon}>💳</span>
                    <span className={styles.methodCompactName}>Карта</span>
                    {methodLoading === "card" ? <span className={styles.methodSpinner} /> : null}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={`${styles.methodCompactFull} ${styles.methodRobokassa}`}
                  onClick={handleRobokassaPay}
                  disabled={!!methodLoading}
                  aria-label="Оплата через Robokassa"
                >
                  <span className={styles.methodCompactIcon}>💳</span>
                  <span className={styles.methodCompactName}>Robokassa</span>
                  {methodLoading ? <span className={styles.methodSpinner} /> : <span className={styles.ctaArrow} aria-hidden>→</span>}
                </button>
              )}
              <PaymentGuaranteesList compact />
              <p className={styles.payAfterLine}>После оплаты — DOCX в разделе «Мои работы»</p>
            </>
          ) : (
            <>
          <div className={styles.providers}>
            <button
              className={`${styles.providerCard} ${provider === "yookassa" ? styles.providerCardActive : ""}`}
              onClick={() => setProvider("yookassa")}
              disabled={!!methodLoading}
            >
              <div className={styles.providerTop}>
                <span className={styles.providerFlags} aria-hidden="true"><FlagRU /></span>
                <span className={styles.providerTitle}>ЮKassa (ЮMoney)</span>
              </div>
              <div className={styles.providerDesc}>Для пользователей из России: СБП и карты</div>
            </button>

            <button
              className={`${styles.providerCard} ${provider === "robokassa" ? styles.providerCardActive : ""}`}
              onClick={() => setProvider("robokassa")}
              disabled={!!methodLoading}
            >
              <div className={styles.providerTop}>
                <span className={styles.providerFlags} aria-hidden="true"><FlagKZ /></span>
                <span className={styles.providerTitle}>Robokassa</span>
              </div>
              <div className={styles.providerDesc}>Для Казахстана и зарубежных карт</div>
            </button>
          </div>

          {provider === "yookassa" ? (
            <div className={styles.methods}>
              <button
                className={`${styles.method} ${styles.methodSbp}`}
                onClick={() => handleSelectMethod("sbp")}
                disabled={!!methodLoading}
              >
                <div className={styles.methodLeft}>
                  <span className={styles.methodIcon}>
                    <SbpIcon />
                  </span>
                  <div>
                    <span className={styles.methodName}>СБП</span>
                    <span className={styles.methodDesc}>Приложение вашего банка</span>
                  </div>
                </div>
                <div className={styles.methodRight}>
                  {methodLoading === "sbp"
                    ? <span className={styles.methodSpinner} />
                    : <span className={styles.badgeBest}>Рекомендуем</span>
                  }
                </div>
              </button>

              <button
                className={`${styles.method} ${styles.methodCard}`}
                onClick={() => handleSelectMethod("card")}
                disabled={!!methodLoading}
              >
                <div className={styles.methodLeft}>
                  <span className={styles.methodIcon}>💳</span>
                  <div>
                    <span className={styles.methodName}>Банковская карта</span>
                    <span className={styles.methodDesc}>Встроенная форма ЮKassa</span>
                  </div>
                </div>
                <div className={styles.methodRight}>
                  {methodLoading === "card"
                    ? <span className={styles.methodSpinner} />
                    : <span className={styles.ctaArrow} aria-hidden="true">→</span>
                  }
                </div>
              </button>
            </div>
          ) : (
            <div className={styles.methods}>
              <button
                className={`${styles.method} ${styles.methodRobokassa}`}
                onClick={handleRobokassaPay}
                disabled={!!methodLoading}
              >
                <div className={styles.methodLeft}>
                  <span className={styles.methodIcon}>💳</span>
                  <div>
                    <span className={styles.methodName}>Оплатить через Robokassa</span>
                    <span className={styles.methodDesc}>Откроется защищённая страница оплаты</span>
                  </div>
                </div>
                <div className={styles.methodRight}>
                  {methodLoading
                    ? <span className={styles.methodSpinner} />
                    : <span className={styles.ctaArrow} aria-hidden="true">→</span>
                  }
                </div>
              </button>
            </div>
          )}
          <p className={`${styles.payAfterLine} ${styles.payAfterLinePage}`}>
            После оплаты — DOCX в разделе «Мои работы»
          </p>
          <div className={styles.footer}>
            <YookassaBadge />
          </div>
            </>
          )}
            </>
          )}
        </>
      )}

      {screen === "sbp" && (
        <>
          <button className={styles.backBtn} onClick={() => { stopSbp(); setScreen("select"); setError(""); }}>← Назад</button>
          <h2 id="payment-widget-title" className={styles.title}>Оплата через СБП</h2>

          {isMobile ? (
            <div className={styles.sbpMobile}>
              <p className={styles.sbpHint}>Нажмите кнопку — откроется приложение вашего банка</p>
              <a href={sbpUrl} className={styles.sbpOpenBtn} target="_blank" rel="noreferrer">
                Открыть приложение банка
              </a>
              <p className={styles.sbpMobileNote}>
                После оплаты вернитесь на эту страницу — генерация запустится автоматически.
              </p>
            </div>
          ) : (
            <div className={styles.sbpQrWrap}>
              <QRCodeSVG
                value={sbpUrl}
                size={240}
                level="M"
                className={styles.qr}
              />
              <p className={styles.sbpHint}>
                Отсканируйте QR‑код в мобильном приложении банка или штатной камерой телефона
              </p>
            </div>
          )}

          <div className={styles.sbpTimer}>
            <span className={styles.sbpTimerDot} />
            Ожидаем оплату <strong>{formatTimer(sbpTimer)}</strong>
          </div>
          <p className={styles.sbpFootnote}>
            После успешной оплаты окно закроется автоматически — не перезагружайте страницу
          </p>
          <button className={styles.cancelBtn} onClick={() => { stopSbp(); setScreen("select"); setError(""); }}>
            Отмена
          </button>
        </>
      )}

      {screen === "card" && (
        <>
          <button className={styles.backBtn} onClick={() => { widgetRef.current?.destroy?.(); cardInitRef.current = false; setConfirmationToken(""); setCardLoading(true); setScreen("select"); setError(""); }}>← Назад</button>
          <h2 id="payment-widget-title" className={styles.title}>Оплата картой</h2>
          {cardLoading && !error && (
            <div className={styles.spinnerWrap}>
              <div className={styles.spinner} />
              <span className={styles.spinnerText}>Загружаем форму...</span>
            </div>
          )}
          {error && <p className={styles.errorBanner}>⚠ {error}</p>}
          <div id="yw-card-container" className={styles.widgetContainer} />
        </>
      )}
    </>
  );

  return (
    <div className={styles.pageRoot}>
      <div className={styles.pageMain}>
        {showPreviewColumn ? (
          <div className={styles.pageLayoutGrid}>
            <div className={styles.pagePreviewMain}>{previewPane}</div>
            <aside className={styles.pagePayAside}>
              <div className={`${styles.pagePaySticky} ${asideSlot ? styles.pagePayStickyAside : ""}`}>{asideSlot ?? payColumn}</div>
            </aside>
          </div>
        ) : (
          <div className={styles.pagePayOnly}>
            <div className={styles.pagePaySticky}>{asideSlot ?? payColumn}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminOrderActions({
  compact,
  onStart,
}: {
  compact?: boolean;
  onStart: () => void;
}) {
  return (
    <div className={compact ? styles.adminBlockCompact : styles.adminBlock}>
      <p className={styles.adminFreeBadge}>Бесплатно · администратор</p>
      <button type="button" className={styles.adminStartBtn} onClick={onStart}>
        Запустить генерацию
      </button>
      <p className={`${styles.payAfterLine} ${styles.payAfterLinePage}`}>
        Результат на этой странице и в «Мои работы»
      </p>
    </div>
  );
}

function OrderExtrasPicker({
  selected,
  onToggle,
  compact = false,
}: {
  selected: string[];
  onToggle: (key: "presentation" | "speech") => void;
  compact?: boolean;
}) {
  const presOn = selected.includes("presentation");
  const speechOn = selected.includes("speech");

  return (
    <div className={compact ? styles.extrasBlockCompact : styles.extrasBlock}>
      <div className={styles.extrasBlockHead}>
        <div className={styles.extrasBlockHeadText}>
          <p className={styles.extrasBlockLabel}>Материалы для защиты</p>
          <p className={styles.extrasBlockSub}>Презентация и речь сэкономят время на защите работы</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/illustrations/presentation-hero-focus.png"
          alt="Презентация и речь к защите"
          className={styles.extrasBlockIllustration}
        />
      </div>
      <div className={styles.extrasToggleList}>
        <label className={styles.extrasToggleRow}>
          <input
            type="checkbox"
            className={styles.toggleInput}
            checked={presOn}
            onChange={() => onToggle("presentation")}
          />
          <span className={styles.toggleSlider} />
          <span className={styles.extrasToggleMeta}>
            <span className={styles.extrasToggleTitle}>
              <span className={styles.extrasToggleIconWrap} aria-hidden>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 3h20" />
                  <rect x="3" y="3" width="18" height="12" rx="2" />
                  <path d="M8 8h3" />
                  <path d="M8 11h6" />
                  <path d="M12 15v5" />
                  <path d="M8 20h8" />
                </svg>
              </span>
              Презентация
            </span>
            <span className={styles.extrasToggleAnnot}>
              PPTX для защиты — слайды по структуре вашей работы
            </span>
          </span>
          <span className={styles.extrasTogglePrice}>+{EXTRAS_PRICES.presentation} ₽</span>
        </label>
        <label className={styles.extrasToggleRow}>
          <input
            type="checkbox"
            className={styles.toggleInput}
            checked={speechOn}
            onChange={() => onToggle("speech")}
          />
          <span className={styles.toggleSlider} />
          <span className={styles.extrasToggleMeta}>
            <span className={styles.extrasToggleTitle}>
              <span className={styles.extrasToggleIconWrap} aria-hidden>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                  <line x1="12" y1="18" x2="12" y2="22" />
                  <line x1="8" y1="22" x2="16" y2="22" />
                </svg>
              </span>
              Текст выступления
            </span>
            <span className={styles.extrasToggleAnnot}>
              DOCX на 3–5 минут — готовый сценарий для защиты
            </span>
          </span>
          <span className={styles.extrasTogglePrice}>+{EXTRAS_PRICES.speech} ₽</span>
        </label>
      </div>
    </div>
  );
}

function PaymentGuaranteesList({ compact = false }: { compact?: boolean }) {
  return (
    <ul
      className={`${styles.guarantees} ${compact ? styles.guaranteesCompact : ""}`}
      aria-label="Гарантии"
    >
      <li>Без подписок и автосписаний</li>
      <li>Оплата через ЮKassa / Robokassa</li>
      <li>DOCX по ГОСТ и полный текст — после оплаты</li>
      <li>Генерация запускается сразу после оплаты</li>
    </ul>
  );
}

function SbpIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#1DB954"/>
      <path d="M7 12.5L10.5 16L17 8" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function YookassaBadge() {
  return (
    <div className={styles.yookassaBadge}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L4 7v5c0 5.25 3.4 10.15 8 11.35C16.6 22.15 20 17.25 20 12V7l-8-5z" fill="#6366f1" fillOpacity=".15" stroke="#6366f1" strokeWidth="1.5"/>
        <path d="M9 12l2 2 4-4" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span>Безопасная оплата · ЮKassa / Robokassa</span>
    </div>
  );
}

function FlagRU() {
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.75" y="0.75" width="20.5" height="14.5" rx="3" fill="#fff" stroke="#E5E7EB" strokeWidth="1.5" />
      <path d="M2.5 5.33H19.5V10.67H2.5V5.33Z" fill="#1D4ED8" />
      <path d="M2.5 10.67H19.5V13.5C19.5 14.3284 18.8284 15 18 15H4C3.17157 15 2.5 14.3284 2.5 13.5V10.67Z" fill="#DC2626" />
    </svg>
  );
}

function FlagKZ() {
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.75" y="0.75" width="20.5" height="14.5" rx="3" fill="#16A34A" stroke="#E5E7EB" strokeWidth="1.5" />
      <path d="M2.5 2.5H19.5V13.5H2.5V2.5Z" fill="#06B6D4" />
      <circle cx="11" cy="8" r="2.2" fill="#FBBF24" />
      <path d="M11 4.6l.5 1.1 1.2.1-.9.8.3 1.2-1.1-.6-1.1.6.3-1.2-.9-.8 1.2-.1.5-1.1z" fill="#FBBF24" />
    </svg>
  );
}
