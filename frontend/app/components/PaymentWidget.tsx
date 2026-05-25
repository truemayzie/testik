"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { createPortal } from "react-dom";
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

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { YooMoneyCheckoutWidget: any; }
}

interface Props {
  workType: string;
  extras: string[];
  topic: string;
  returnUrl: string;
  onSuccess: () => void;
  onClose: () => void;
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

type PreviewTocRow = PreviewPayload["toc"][number];
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

const PREVIEW_RETENTION_TIPS = [
  "Пока ждёте — справа уже можно выбрать способ оплаты.",
  "После оплаты скачаете полный DOCX: титульник, оглавление и список литературы.",
  "Источники подбираются через CrossRef — у многих есть DOI для проверки.",
  "Текст генерируется под вашу тему, а не из готового шаблона.",
  "Оформление — шрифт, поля и интервал — по ГОСТ 7.32-2017.",
  "Полную работу можно отредактировать в Word после скачивания.",
];

function getPreviewWaitSteps(workType: string): { label: string; at: number }[] {
  if (workType === "Сочинение" || workType === "Эссе") {
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

function PreviewLoadingPane({ topic, workType }: { topic: string; workType: string }) {
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
      setProgress(Math.min(94, Math.round((1 - Math.exp(-elapsed / 22)) * 94)));

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
    <div className={styles.previewLoading}>
      <div className={styles.previewSpinner} role="status" aria-label="Загрузка" />
      <p className={styles.previewLoadingTitle}>Готовим предпросмотр</p>
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
      <p className={styles.previewEta}>Обычно 20–40 секунд · {workType}</p>

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
  workLabel,
  workType,
  topic,
}: {
  loading: boolean;
  error: string;
  data: PreviewPayload | null;
  workLabel: string;
  workType: string;
  topic: string;
}) {
  if (loading) {
    return (
      <div className={styles.previewCol}>
        <div className={styles.previewBadge}>Предпросмотр</div>
        <PreviewLoadingPane topic={topic} workType={workType} />
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className={styles.previewCol}>
        <div className={styles.previewBadge}>Предпросмотр</div>
        <p className={styles.previewErrorText}>{error}</p>
        <p className={styles.previewHintMuted}>Оплата доступна в этом окне — на широком экране справа, на телефоне ниже превью.</p>
      </div>
    );
  }
  if (!data) return null;

  const rawSections = (data.excerpt_sections ?? []).filter((s) => (s.text || "").trim());
  const sections: PreviewExcerptSection[] =
    rawSections.length > 0
      ? rawSections
      : [{ title: data.excerpt_title, text: data.excerpt }];

  const isEssayLike = workType === "Сочинение" || workType === "Эссе";
  const tocHeadline = isEssayLike
    ? data.doc_lang === "kz"
      ? "Негізгі бөлім"
      : data.doc_lang === "en"
        ? "Main part"
        : "Основная часть"
    : data.doc_lang === "kz"
      ? "МАЗМҰНЫ"
      : data.doc_lang === "en"
        ? "CONTENTS"
        : "СОДЕРЖАНИЕ";

  const tocRows = isEssayLike
    ? data.toc.filter((row) => {
        const n = (row.num ?? "").trim();
        return n === "1" || n.startsWith("1.");
      })
    : data.toc;

  return (
    <div className={styles.previewCol}>
      <div className={styles.previewBadge}>Предпросмотр</div>
      <div className={styles.sheet}>
        <div className={styles.sheetSimpTitle}>Учебная работа</div>
        <div className={styles.sheetSimpType}>{workLabel}</div>
        <div className={styles.sheetSimpTopic}>«{data.topic}»</div>
        <p className={styles.sheetSimpNote}>Полный титульный лист по ГОСТ — в DOCX после оплаты</p>
      </div>
      {data.has_toc_sheet && tocRows.length > 0 && (
        <div className={styles.sheet}>
          <div className={styles.tocHead}>{tocHeadline}</div>
          <ul className={styles.tocList}>
            {tocRows.map((row, i) => {
              const depth = tocRowDepth(row.num);
              const numLabel = formatTocNum(row.num);
              return (
                <li
                  key={i}
                  className={styles.tocRow}
                  style={{ paddingLeft: `${6 + depth * 15}px` }}
                >
                  <span className={styles.tocRowMain}>
                    {numLabel ? <span className={styles.tocNum}>{numLabel}</span> : null}
                    <span className={styles.tocTitle}>{row.title}</span>
                  </span>
                  <span className={styles.tocPage}>{row.page}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {sections.map((sec, idx) => (
        <div key={idx} className={styles.sheet}>
          <div className={styles.excerptSectionWrap}>
            <div className={styles.excerptHead}>{sec.title}</div>
            <div className={styles.excerptSectionClip}>
              <div className={styles.excerptBody}>
                {sec.text.split(/\n\n+/).filter(Boolean).map((p, i) => (
                  <p key={i} className={styles.excerptPara}>{p}</p>
                ))}
              </div>
              <div className={styles.excerptSectionFade} aria-hidden />
              <div className={styles.excerptSectionTeaser}>
                <span className={styles.excerptSectionTeaserLock} aria-hidden>🔒</span>
                <span>Продолжение — в DOCX после оплаты</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PaymentWidget({ workType, extras, topic, returnUrl, onSuccess, onClose }: Props) {
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
  const modalRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const prevFocusedRef = useRef<HTMLElement | null>(null);
  const scrollLockYRef = useRef(0);

  const [previewExhausted, setPreviewExhausted] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewData, setPreviewData] = useState<PreviewPayload | null>(null);
  const [previewError, setPreviewError] = useState("");

  const showPreviewColumn = !previewExhausted;

  useEffect(() => {
    let cancelled = false;
    const key = previewCacheKey(topic, workType);

    const cached = loadPreviewSessionCache(topic, workType) ?? getMemoryPreviewPayload(key);
    if (cached) {
      setPreviewData(cached);
      setPreviewLoading(false);
      setPreviewError("");
      setPreviewExhausted(false);
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
          setPreviewExhausted(false);
          return;
        }
      }
    } catch { /* ignore */ }

    void (async () => {
      const result = await fetchPaymentPreviewDeduped(topic, workType);
      if (cancelled) return;
      if (result.ok) {
        setPreviewData(result.data);
        setPreviewLoading(false);
        setPreviewError("");
        setPreviewExhausted(false);
        void updateSession();
        return;
      }
      if (result.code === "PREVIEW_USED") {
        setPreviewExhausted(true);
        setPreviewLoading(false);
        return;
      }
      setPreviewError(result.error);
      setPreviewLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только тема/тип; updateSession вызывается при успехе
  }, [topic, workType]);

  const lang = detectDominantLang(topic);
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const firstOrderDiscountEligible =
    (session?.user as { firstOrderDiscountEligible?: boolean } | undefined)
      ?.firstOrderDiscountEligible === true;
  const discountActive =
    firstOrderDiscountEligible && userRole !== "admin" && userRole !== "yukassa_test";
  const base = WORK_PRICES[workType]?.price ?? 0;
  const extrasAmount = (extras ?? []).reduce((sum, item) => sum + (EXTRAS_PRICES[item] ?? 0), 0);
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

  useEffect(() => {
    scrollLockYRef.current = window.scrollY;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOb = html.style.overscrollBehavior;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyLeft = body.style.left;
    const prevBodyRight = body.style.right;
    const prevBodyWidth = body.style.width;
    html.style.overscrollBehavior = "none";
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollLockYRef.current}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return () => {
      html.style.overscrollBehavior = prevHtmlOb;
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.left = prevBodyLeft;
      body.style.right = prevBodyRight;
      body.style.width = prevBodyWidth;
      window.scrollTo(0, scrollLockYRef.current);
    };
  }, []);

  useEffect(() => {
    const el = backdropRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.target === el) e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
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

  // Делаем модалку доступной с клавиатуры: фокус внутрь и возврат фокуса назад.
  useEffect(() => {
    prevFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeBtnRef.current?.focus();
    return () => {
      prevFocusedRef.current?.focus();
    };
  }, []);

  // Tab не выходит за пределы модалки (focus trap). Закрытие — только по крестику.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!modalRef.current) return;
      if (e.key !== "Tab") return;

      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
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
          extras: extras.length > 0 ? extras : undefined,
          method,
          market: provider === "robokassa" ? "kz" : "ru",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка создания платежа");
        setMethodLoading(null);
        return;
      }

      // Сохраняем paymentId в pendingGeneration
      try {
        const pending = JSON.parse(sessionStorage.getItem("pendingGeneration") || "{}");
        sessionStorage.setItem("pendingGeneration", JSON.stringify({ ...pending, paymentId: data.paymentId }));
      } catch {}

      // Robokassa / внешний redirect — сохраняем модалку для возврата «Назад»
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
          extras: extras.length > 0 ? extras : undefined,
          market: "kz",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка создания платежа");
        return;
      }
      try {
        const pending = JSON.parse(sessionStorage.getItem("pendingGeneration") || "{}");
        sessionStorage.setItem("pendingGeneration", JSON.stringify({ ...pending, paymentId: data.paymentId }));
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
          extras: extras ?? [],
          pages,
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
          onSuccess();
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

  function handleClose() {
    stopSbp();
    widgetRef.current?.destroy?.();
    onClose();
  }

  if (!mounted) return null;

  const payColumn = (
    <>
      {screen === "select" && (
        <>
          {useCompactPay ? (
            <>
              <div className={styles.payCompactHead}>
                <h2 id="payment-widget-title" className={styles.payCompactTitle}>Оплата</h2>
                <div className={styles.payCompactAmountWrap}>
                  {priceDiscountApplied && (
                    <span className={styles.payDiscountBadge}>−{FIRST_ORDER_DISCOUNT_PERCENT}%</span>
                  )}
                  <span className={styles.payCompactAmount}>
                    {priceDiscountApplied && !isKzUi && (
                      <span className={styles.payAmountOld} aria-hidden>
                        {formatAmount(originalTotalRub, "RUB")}
                      </span>
                    )}
                    {primaryAmount}
                    {secondaryAmount ? (
                      <span className={styles.payCompactAmountSub}> {secondaryAmount}</span>
                    ) : null}
                  </span>
                </div>
              </div>
              <p className={styles.orderCompact} aria-label="Состав заказа">
                {workLabel} · {langLabel}
              </p>
              {previewLoading && (
                <p className={styles.payWhilePreviewCompact}>
                  Готовим превью — оплата будет ниже после прокрутки
                </p>
              )}
            </>
          ) : (
            <>
              <h2 id="payment-widget-title" className={styles.title}>Оплата заказа</h2>
              <p className={styles.subtitle}>Выберите способ оплаты</p>
              {previewLoading && (
                <p className={styles.payWhilePreview}>
                  Превью готовится слева — способ оплаты можно выбрать уже сейчас
                </p>
              )}
              <div className={styles.orderSummary} aria-label="Состав заказа">
                <div className={styles.orderLine}>
                  <span className={styles.orderKey}>К оплате:</span>
                  <span className={styles.orderValue}>
                    {priceDiscountApplied && !isKzUi && (
                      <span className={styles.payAmountOld} aria-hidden>
                        {formatAmount(originalTotalRub, "RUB")}{" "}
                      </span>
                    )}
                    {primaryAmount}{secondaryAmount ? ` ${secondaryAmount}` : ""}
                  </span>
                </div>
                {priceDiscountApplied && (
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
              <PaymentGuaranteesList />
              <p className={styles.payAfterLine}>После оплаты — DOCX в разделе «Мои работы»</p>
            </>
          )}
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
          <div className={styles.footer}>
            <YookassaBadge />
          </div>
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

  return createPortal(
    <div
      ref={backdropRef}
      className={styles.backdrop}
    >
      <div
        ref={modalRef}
        className={`${styles.card} ${showPreviewColumn ? styles.cardWide : ""} ${useCompactPay ? styles.cardWideMobile : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-widget-title"
      >
        <button ref={closeBtnRef} className={styles.closeBtn} onClick={handleClose} aria-label="Закрыть">✕</button>

        {showPreviewColumn ? (
          <div className={styles.layoutGrid}>
            <PaymentPreviewPane
              loading={previewLoading}
              error={previewError}
              data={previewData}
              workLabel={workLabel}
              workType={workType}
              topic={topic}
            />
            <div className={`${styles.payCol} ${useCompactPay ? styles.payColInFlow : ""}`}>{payColumn}</div>
          </div>
        ) : (
          <div className={styles.payCol}>{payColumn}</div>
        )}
      </div>
    </div>,
    document.body
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
