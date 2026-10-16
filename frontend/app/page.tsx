"use client";

import { useState, useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import TypewriterInput from "./components/TypewriterInput";
import ExamplesSection from "./components/ExamplesSection";
import HowItWorks from "./components/landing/HowItWorks";
import CompareSection from "./components/landing/CompareSection";
import WhySection from "./components/landing/WhySection";
import GuaranteeSection from "./components/landing/GuaranteeSection";
import LiveFeed from "./components/landing/LiveFeed";
import FaqSection from "./components/landing/FaqSection";
import QueueStatus from "./components/landing/QueueStatus";
import PreFooter from "./components/PreFooter";
import { reachFunnelGoal } from "@/lib/metrika";
import { getHeroTitle } from "@/lib/heroCopy";
import { WORK_PRICES, WORK_PAGES } from "../lib/prices";
import { prepareTopic } from "../lib/topicValidate";
import { safeJsonLd } from "@/lib/safeJsonLd";
import {
  clearPendingOrderDraft,
  hasPendingPreviewAfterAuth,
  loadPendingOrderDraft,
  markPendingPreviewAfterAuth,
  savePendingOrderDraft,
  consumePendingPreviewAfterAuth,
} from "@/lib/pendingOrderDraft";
import styles from "./page.module.css";

const WORK_TYPES = ["Сочинение", "Эссе", "Доклад", "Реферат", "Курсовая", "ВКР"];

function formatWorksCreatedLabel(count: number): string {
  const display = count >= 100 ? Math.floor(count / 100) * 100 : count;
  return `Создано уже более ${display.toLocaleString("ru-RU")} работ`;
}

const SLOT_WEIGHTS: Record<string, number> = {
  "Сочинение": 1,
  "Эссе": 1,
  "Доклад": 2,
  "Реферат": 2,
  "Курсовая": 4,
  "ВКР": 5,
  "Тест": 1,
};

export default function Home() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  useEffect(() => {
    try {
      if (sessionStatus !== "authenticated") return;
      const createdAtIso = (session?.user as { createdAt?: string } | null)?.createdAt;
      if (!createdAtIso) return;

      const createdAtMs = Date.parse(createdAtIso);
      if (!Number.isFinite(createdAtMs)) return;

      const isNewUser = Date.now() - createdAtMs < 10 * 60 * 1000;
      if (!isNewUser) return;

      const key = `ym_signup_fired_${createdAtIso}`;
      if (typeof window === "undefined") return;
      if (window.localStorage.getItem(key) === "1") return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ymFn = (window as any).ym as undefined | ((...args: any[]) => void);
      if (typeof ymFn !== "function") return;

      ymFn(108284268, "reachGoal", "signup_success");
      window.localStorage.setItem(key, "1");
    } catch {
      // no-op
    }
  }, [sessionStatus, session]);

  const userRole  = (session?.user as { role?: string } | null)?.role;
  const isYukassa = userRole === "yukassa_test";
  const isAdmin   = userRole === "admin";
  const YUKASSA_TYPES = ["Сочинение", "Эссе", "Доклад"];

  const [workType, setWorkType]               = useState("");
  const [topic, setTopic]                     = useState("");
  const [topicFieldError, setTopicFieldError] = useState<string | null>(null);
  const [workTypeError, setWorkTypeError]     = useState<string | null>(null);
  const [pages, setPages]                     = useState(20);
  const [submitting, setSubmitting]           = useState(false);
  const [capacityError, setCapacityError]     = useState<string[] | null>(null);
  const [trialUsed, setTrialUsed]             = useState(false);
  const [worksCreated, setWorksCreated]       = useState(0);
  const [canScrollTypes, setCanScrollTypes]   = useState(false);

  const heroRef             = useRef<HTMLElement>(null);
  const workTypesRef        = useRef<HTMLDivElement>(null);
  const workTypeElsRef      = useRef<Record<string, HTMLButtonElement | null>>({});
  const prevUserIdRef       = useRef<string | undefined>(undefined);
  const previewRedirectStarted = useRef(false);

  useEffect(() => {
    function checkScroll() {
      if (workTypesRef.current) {
        setCanScrollTypes(workTypesRef.current.scrollWidth > workTypesRef.current.clientWidth);
      }
    }
    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, [isYukassa]);

  function scrollWorkTypeIntoView(type: string, behavior: ScrollBehavior = "smooth") {
    const container = workTypesRef.current;
    const el = workTypeElsRef.current[type];
    if (!container || !el || !window.matchMedia("(max-width: 900px)").matches) return;

    const list = isYukassa ? YUKASSA_TYPES : WORK_TYPES;
    const idx = list.indexOf(type);
    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    const elLeft = el.offsetLeft;
    const elWidth = el.offsetWidth;
    const containerWidth = container.clientWidth;

    let target: number;
    if (idx <= 0) target = 0;
    else if (idx >= list.length - 1) target = maxScroll;
    else target = elLeft - (containerWidth - elWidth) / 2;

    container.scrollTo({
      left: Math.max(0, Math.min(target, maxScroll)),
      behavior,
    });
  }

  function selectWorkType(type: string) {
    setWorkType(type);
    setWorkTypeError(null);
    setPages(WORK_PAGES[type]?.default ?? 20);
    setCapacityError(null);
    requestAnimationFrame(() => scrollWorkTypeIntoView(type));
  }

  function goToGeneratorFromExample(type: string) {
    selectWorkType(type);
    window.setTimeout(() => {
      document.getElementById("generator")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  async function openOrderPage(cleanTopic: string, wt: string, p: number, extras: string[]) {
    try {
      if (extras.length > 0) {
        sessionStorage.setItem("pendingExtrasChoice", JSON.stringify(extras));
      }
      savePendingOrderDraft({ topic: cleanTopic, pages: p, workType: wt });
    } catch { /* ignore */ }

    if (sessionStatus === "unauthenticated") {
      markPendingPreviewAfterAuth();
      router.push(`/auth/signin?callbackUrl=${encodeURIComponent("/order")}`);
      return;
    }

    try {
      const { createOrderTask, savePendingGeneration } = await import("@/lib/createOrderTask");
      const created = await createOrderTask({
        topic: cleanTopic,
        workType: wt,
        pages: p,
        extras,
      });
      if ("error" in created) {
        alert(created.error);
        return;
      }
      savePendingGeneration({ taskId: created.id, topic: cleanTopic, workType: wt, pages: p });
      router.push(`/order/${created.id}`);
    } catch {
      alert("Не удалось создать заказ. Попробуйте ещё раз.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workType) {
      setWorkTypeError("Выберите тип работы");
      return;
    }
    setWorkTypeError(null);
    const prepared = prepareTopic(topic);
    if (!prepared.ok) {
      setTopicFieldError(prepared.message);
      return;
    }
    setTopicFieldError(null);
    const cleanTopic = prepared.topic;

    setCapacityError(null);

    try {
      const capRes = await fetch("/api/capacity");
      if (capRes.ok) {
        const capData = await capRes.json() as { used: number; max: number; available: string[] };
        const needed = SLOT_WEIGHTS[workType] ?? 2;
        if (capData.used + needed > capData.max) {
          setCapacityError(capData.available);
          return;
        }
      }
    } catch { /* при ошибке — пропускаем, бэкенд сам вернёт 503 */ }

    setSubmitting(true);
    try {
      await openOrderPage(cleanTopic, workType, pages, []);
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (sessionStatus === "loading") return;
    const userId = (session?.user as { id?: string } | null)?.id;
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
      clearPendingOrderDraft();
    }
    prevUserIdRef.current = userId;
  }, [session, sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || previewRedirectStarted.current) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("autoGenerate") === "1") {
      previewRedirectStarted.current = true;
      const autoDraft = loadPendingOrderDraft();
      if (autoDraft?.taskId) {
        router.replace(`/order/${autoDraft.taskId}?autoGenerate=1`);
      } else {
        router.replace("/dashboard");
      }
      return;
    }

    const wantsPreview = hasPendingPreviewAfterAuth();
    const draft = loadPendingOrderDraft();
    if (!wantsPreview || !draft?.topic || !draft.workType) return;

    previewRedirectStarted.current = true;
    consumePendingPreviewAfterAuth();
    if (draft.taskId) {
      router.replace(`/order/${draft.taskId}`);
      return;
    }
    router.replace("/order");
  }, [sessionStatus, router]);

  useLayoutEffect(() => {
    if (!workType || !window.matchMedia("(max-width: 900px)").matches) return;
    const id = requestAnimationFrame(() => scrollWorkTypeIntoView(workType, "instant"));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/generations/works-count")
      .then(r => r.json())
      .then((data: unknown) => {
        const n = typeof data === "object" && data !== null
          ? (data as { worksCreated?: unknown }).worksCreated
          : 0;
        if (typeof n === "number" && n > 0) setWorksCreated(n);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isYukassa) return;
    selectWorkType("Эссе");
    fetch("/api/generations")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length >= 1) setTrialUsed(true);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isYukassa]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wtParam = params.get("workType");
    if (!wtParam) return;
    const VALID = [...WORK_TYPES, "Тест"];
    if (!VALID.includes(wtParam)) return;
    selectWorkType(wtParam);
    window.history.replaceState({}, "", "/");
    setTimeout(() => {
      heroRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) {
          (e.target as HTMLElement).setAttribute("data-visible", "true");
          obs.unobserve(e.target);
        }
      }),
      { threshold: 0.08 },
    );
    const els = document.querySelectorAll('[data-reveal]:not([data-visible="true"])');
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pageRange = workType ? WORK_PAGES[workType] : undefined;

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Refai",
    url: "https://ref-ai.ru",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://ref-ai.ru/?topic={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <main className={styles.main}>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(websiteJsonLd) }} />

      <section ref={heroRef} id="generator" className={styles.hero}>
        <div className={styles.heroInner}>

          <div className={styles.heroOrb} aria-hidden />

          <div className={styles.heroMain}>

          <div className={styles.heroIntro}>
            <div
              className={styles.heroTrust}
              role="status"
              aria-label="Отзывы на Яндексе и Отзовике, оформление по ГОСТ"
            >
              <div className={styles.heroTrustLead}>
                <div className={styles.heroTrustIcons} aria-hidden>
                  <span className={styles.heroTrustIcon}>
                    <img
                      src="/trust-icon-lokli.png"
                      alt=""
                      width={22}
                      height={22}
                      loading="eager"
                      decoding="async"
                    />
                  </span>
                  <span className={`${styles.heroTrustIcon} ${styles.heroTrustIconGoogle}`}>
                    <img
                      src="/trust-icon-google.png"
                      alt=""
                      width={22}
                      height={22}
                      loading="eager"
                      decoding="async"
                    />
                  </span>
                </div>
                <span className={styles.heroTrustStars} aria-hidden>★★★★★</span>
              </div>
              <span className={styles.heroTrustSep} aria-hidden />
              <span className={styles.heroTrustText}>
                ГОСТ&nbsp;7.32-2017 · уникальность&nbsp;70–90%
              </span>
            </div>

            <h1 className={styles.heroTitle}>
              Твой умный помощник для работы с&nbsp;текстами{" "}
              <span className={styles.heroAccent}>по&nbsp;ГОСТ</span>
            </h1>

            {worksCreated > 0 && (
              <p className={styles.heroWorksStat}>{formatWorksCreatedLabel(worksCreated)}</p>
            )}
          </div>

          <QueueStatus />

          {isYukassa && (
            <div className={`${styles.yukassaBanner} ${trialUsed ? styles.yukassaBannerUsed : ""}`}>
              {trialUsed ? (
                <>
                  <span className={styles.yukassaBannerIcon}>✓</span>
                  <div>
                    <p className={styles.yukassaBannerTitle}>Пробная генерация использована</p>
                    <p className={styles.yukassaBannerText}>
                      Работа доступна во вкладке{" "}
                      <a href="/dashboard" className={styles.yukassaBannerLink}>Мои работы</a>.
                      Функция генерации работает корректно.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <span className={styles.yukassaBannerIcon}>🔍</span>
                  <div>
                    <p className={styles.yukassaBannerTitle}>
                      Тестовый доступ ЮКасса — 1 пробная генерация
                    </p>
                    <p className={styles.yukassaBannerText}>
                      Выберите тип работы (Сочинение, Эссе или Доклад), введите любую тему и
                      нажмите «Сгенерировать». Оплата не требуется. Используйте её с умом — она одна.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          <div className={styles.genCard}>
            <div className={styles.swipeHintWrap} style={{ visibility: canScrollTypes ? 'visible' : 'hidden' }}>
              <span className={styles.swipeHint}>Листай →</span>
            </div>
            <div ref={workTypesRef} className={styles.workTypes}>
              {isAdmin && (
                <button
                  key="Тест"
                  className={`${styles.workType} ${styles.workTypeTest} ${workType === "Тест" ? styles.workTypeActive : ""}`}
                  onClick={() => selectWorkType("Тест")}
                  disabled={submitting}
                  title="Тестовая генерация — только для администратора"
                  type="button"
                >
                  <span className={styles.workTypeLabel}>Тест</span>
                  <span className={styles.workTypeMeta}>1 стр.</span>
                </button>
              )}
              {(isYukassa ? YUKASSA_TYPES : WORK_TYPES).map(type => {
                const info = WORK_PRICES[type];
                return (
                  <button
                    key={type}
                    ref={(el) => { workTypeElsRef.current[type] = el; }}
                    className={`${styles.workType} ${workType === type ? styles.workTypeActive : ""}`}
                    onClick={() => selectWorkType(type)}
                    disabled={submitting}
                    type="button"
                  >
                    <span className={styles.workTypeLabel}>{type}</span>
                    <span className={styles.workTypeMeta}>{info?.pages}</span>
                  </button>
                );
              })}
            </div>
            {workTypeError && (
              <p className={styles.topicFieldError} role="alert">
                {workTypeError}
              </p>
            )}

            <form onSubmit={handleSubmit} className={styles.heroForm}>
              <div className={styles.topicLabelRow}>
                <span className={styles.topicLabel}>Тема работы</span>
                <span className={styles.topicInfoWrap}>
                  <button
                    type="button"
                    className={styles.topicInfoBtn}
                    aria-label="Как указать тему"
                    aria-describedby="topic-hint-popover"
                  >
                    i
                  </button>
                  <span id="topic-hint-popover" role="tooltip" className={styles.topicInfoPopover}>
                    Одна фраза с темой — без «сделай» и списка 1. 2. 3. Презентацию можно добавить после готовой работы.
                  </span>
                </span>
              </div>
              <div className={styles.inputWrapper}>
                <TypewriterInput
                  value={topic}
                  onChange={(v) => {
                    setTopic(v);
                    if (v.trim().length > 0) reachFunnelGoal("form_start");
                    if (topicFieldError) setTopicFieldError(null);
                  }}
                  disabled={submitting}
                  className={styles.heroInput}
                />
              </div>
              {topicFieldError && (
                <p className={styles.topicFieldError} role="alert">
                  {topicFieldError}
                </p>
              )}

              {workType && pageRange && (
                <div className={styles.formControls}>
                  <div className={styles.pagesControl}>
                    <span className={styles.pagesLabel}>Объём:</span>
                    <input
                      type="range"
                      min={pageRange.min}
                      max={pageRange.max}
                      step={1}
                      value={pages}
                      onChange={e => setPages(Number(e.target.value))}
                      className={styles.range}
                      style={{
                        "--range-fill": `${pageRange.max > pageRange.min
                          ? ((pages - pageRange.min) / (pageRange.max - pageRange.min)) * 100
                          : 100}%`,
                      } as CSSProperties}
                      disabled={submitting}
                      aria-label="Объём работы в страницах"
                    />
                    <span className={styles.pagesValue}>{pages} стр.</span>
                  </div>
                </div>
              )}

              <div className={styles.btnRow}>
                <button
                  type="submit"
                  className={styles.heroBtn}
                  disabled={submitting || sessionStatus === "loading" || !workType || !topic.trim() || (isYukassa && trialUsed)}
                >
                  {submitting
                    ? <><span className={styles.btnSpinner}/> Открываем заказ…</>
                    : isYukassa
                      ? `🎯 Сгенерировать ${{ "Сочинение": "сочинение", "Эссе": "эссе", "Доклад": "доклад" }[workType] ?? workType.toLowerCase()} — тест`
                      : <>
                          <svg className={styles.btnIcon} xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path d="M13.4408 2.5L12.6589 4.83853L10.3134 5.61804V6.54713L12.6589 7.32664L13.4408 9.66517H14.3727L15.1545 7.32664L17.5 6.54713V5.61804L15.1545 4.83853L14.3727 2.5H13.4408Z" fill="white"/>
                            <path d="M5.95057 10.8371L7.10076 7.39677H8.03263L9.18282 10.8371L12.6334 11.9838V12.9129L9.18282 14.0597L8.03263 17.5H7.10076L5.95057 17.5H7.10076L5.95057 14.0597L2.5 12.9129V11.9838L5.95057 10.83717" fill="white"/>
                          </svg>
                          Создать
                        </>}
                </button>
              </div>
              {capacityError !== null && (
                <div className={styles.capacityError}>
                  <span className={styles.capacityErrorIcon}>⏳</span>
                  <span>
                    {workType} сейчас недоступна — сервер занят.
                    {capacityError.length > 0
                      ? <> Доступно: <strong>{capacityError.join(", ")}</strong></>
                      : <> Все слоты заняты, попробуйте через минуту.</>}
                  </span>
                </div>
              )}
            </form>
          </div>

          </div>

          <LiveFeed />
        </div>
      </section>

      <HowItWorks />

      <ExamplesSection onCreateFromExample={goToGeneratorFromExample} />

      <CompareSection />

      <WhySection />

      <GuaranteeSection />

      <FaqSection />

      <PreFooter />

    </main>
  );
}
