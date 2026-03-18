"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TypewriterInput from "./components/TypewriterInput";
import { WORK_PRICES, WORK_PAGES } from "../lib/prices";
import styles from "./page.module.css";

type ReferatResult = {
  title: string;
  structure: string[];
  content: Record<string, string>;
  sources: string[];
  meta: Record<string, string | number>;
};

// Сортировка по возрастанию страниц: Сочинение < Эссе < Доклад < Реферат < Курсовая < ВКР
const WORK_TYPES = ["Сочинение", "Эссе", "Доклад", "Реферат", "Курсовая", "ВКР"];

const WHY_FEATURES = [
  { icon: "⚡", label: "Быстро",       desc: "Работа готова за 2–4 минуты" },
  { icon: "✦",  label: "Качественно", desc: "ГОСТ 7.32-2017, список литературы" },
  { icon: "🛡", label: "Уникально",   desc: "Антиплагиат 70–90%" },
  { icon: "💎", label: "Доступно",    desc: "От 99 рублей за работу" },
  { icon: "🎯", label: "Просто",      desc: "Только тема — всё остальное ИИ" },
];

const REVIEWS = [
  { name: "Анна",      date: "15.06.2025", text: "Эта нейросеть кардинально изменила мой подход к учёбе. Теперь я усваиваю материал в разы быстрее" },
  { name: "Михаил",    date: "20.07.2025", text: "Наконец-то появился ИИ, который действительно понимает, что от него хотят. Превращает длинные статьи в чёткие тезисы" },
  { name: "Елена",     date: "31.07.2025", text: "Как аспиранту, мне приходится анализировать горы литературы. Этот инструмент невероятно экономит время" },
  { name: "Дмитрий",   date: "03.08.2025", text: "Это как иметь персонального помощника 24/7. Помог не только сократить материалы, но и лучше понимать сложные темы" },
  { name: "Анна",      date: "09.08.2025", text: "Прошла весь семестр с этим ИИ помощником, и результаты на сессии стали заметно лучше" },
  { name: "Сергей",    date: "15.08.2025", text: "Идеально справляется даже со сложными техническими текстами и формулами. Не добавляет от себя ничего лишнего" },
  { name: "Мария",     date: "26.08.2025", text: "Использую как для учёбы, так и для работы. Готовлю курсовые, лекции и документацию по работе" },
  { name: "Александр", date: "03.09.2025", text: "Боялся, что ИИ будет делать шаблонные выжимки, но был приятно удивлён качеством текстов" },
];

const FAQ = [
  { q: "Как работает генерация?",         a: "Введите тему работы в поле, выберите тип и объём, нажмите кнопку генерации. ИИ сформирует структуру, введение, основные главы, заключение и список литературы за 2–4 минуты." },
  { q: "Какие форматы поддерживаются?",   a: "Готовая работа скачивается в формате DOCX (Microsoft Word), оформленном по ГОСТ 7.32-2017: Times New Roman 14pt, интервал 1.5, поля 30/10/20/20 мм." },
  { q: "Сколько стоит генерация?",        a: "Стоимость зависит от типа работы: сочинение от 99 ₽, эссе — 129 ₽, реферат — 199 ₽, курсовая — 499 ₽, ВКР — 999 ₽. Оплата разовая за каждую работу." },
  { q: "Гарантируется ли уникальность?",  a: "Да. Каждая работа генерируется индивидуально под вашу тему. Уникальность составляет 70–90% по системам антиплагиата." },
  { q: "Можно ли редактировать результат?", a: "Да, скачайте файл DOCX и редактируйте в любом текстовом редакторе: Microsoft Word, Google Docs, LibreOffice." },
];

const MOCK_RECENT = [
  { id: "1", workType: "Реферат",  topic: "Распределительная функция финансов. Виды распределения",                   createdAt: "2026-03-17T21:53:00Z" },
  { id: "2", workType: "Реферат",  topic: "Мировые религии: Буддизм, Ислам, Христианство",                             createdAt: "2026-03-17T21:53:00Z" },
  { id: "3", workType: "Реферат",  topic: "Изображение детских забот и радостей в поэзии Саши Черного",                createdAt: "2026-03-17T21:52:00Z" },
  { id: "4", workType: "Реферат",  topic: "Местный анестетик Ропивакаин: Химия, Применение и Перспективы",             createdAt: "2026-03-17T21:52:00Z" },
  { id: "5", workType: "Реферат",  topic: "Курсы (котировки) ценных бумаг",                                            createdAt: "2026-03-17T21:51:00Z" },
  { id: "6", workType: "Реферат",  topic: "Аутогенная тренировка по Шульцу: Теория и практика",                        createdAt: "2026-03-17T21:49:00Z" },
  { id: "7", workType: "Реферат",  topic: "Современные технологии в подготовке к сдаче нормативов ГТО",                createdAt: "2026-03-17T21:49:00Z" },
  { id: "8", workType: "Реферат",  topic: "Использование пищевых добавок в ресторанных технологиях",                   createdAt: "2026-03-17T21:49:00Z" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).replace(",", " г. в");
}

type Step = { label: string; duration: number };

function getProgressSteps(workType: string): Step[] {
  if (workType === "Сочинение" || workType === "Эссе") {
    return [
      { label: "Анализируем тему",      duration: 2000  },
      { label: "Формируем структуру",    duration: 3000  },
      { label: "Пишем вступление",       duration: 6000  },
      { label: "Пишем основную часть",   duration: 14000 },
      { label: "Пишем заключение",       duration: 6000  },
      { label: "Финальная проверка",     duration: 2000  },
    ];
  }
  if (workType === "Доклад") {
    return [
      { label: "Анализируем тему",       duration: 3000  },
      { label: "Формируем структуру",    duration: 4000  },
      { label: "Пишем введение",         duration: 7000  },
      { label: "Пишем основной раздел",  duration: 16000 },
      { label: "Пишем заключение",       duration: 7000  },
      { label: "Финальная проверка",     duration: 3000  },
    ];
  }
  if (workType === "ВКР") {
    return [
      { label: "Анализируем тему",            duration: 5000  },
      { label: "Формируем структуру",          duration: 8000  },
      { label: "Пишем введение",               duration: 14000 },
      { label: "Пишем главу 1",                duration: 28000 },
      { label: "Пишем главу 2",                duration: 28000 },
      { label: "Пишем главу 3",                duration: 28000 },
      { label: "Пишем заключение",             duration: 14000 },
      { label: "Оформляем список литературы",  duration: 8000  },
      { label: "Финальная проверка",           duration: 5000  },
    ];
  }
  // Реферат и Курсовая
  return [
    { label: "Анализируем тему",            duration: 4000  },
    { label: "Формируем структуру",          duration: 6000  },
    { label: "Пишем введение",               duration: 10000 },
    { label: "Пишем главу 1",                duration: 18000 },
    { label: "Пишем главу 2",                duration: 18000 },
    { label: "Пишем главу 3",                duration: 18000 },
    { label: "Пишем заключение",             duration: 10000 },
    { label: "Оформляем список литературы",  duration: 6000  },
    { label: "Финальная проверка",           duration: 4000  },
  ];
}

export default function Home() {
  const { data: session } = useSession();
  const router = useRouter();

  const [workType, setWorkType]               = useState("Реферат");
  const [topic, setTopic]                     = useState("");
  const [pages, setPages]                     = useState(WORK_PAGES["Реферат"].default);
  const [loading, setLoading]                 = useState(false);
  const [result, setResult]                   = useState<ReferatResult | null>(null);
  const [error, setError]                     = useState("");
  const [activeSection, setActiveSection]     = useState("");
  const [downloading, setDownloading]         = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(true); // true пока не проверили
  const [profileFilled, setProfileFilled]     = useState(true); // true пока не проверили
  const [recentWorks, setRecentWorks]         = useState(MOCK_RECENT);
  const [showAllWorks, setShowAllWorks]       = useState(false);
  const [faqOpen, setFaqOpen]                 = useState<number | null>(null);

  // Прогресс
  const [stepIndex, setStepIndex]       = useState(0);
  const [stepProgress, setStepProgress] = useState(0);
  const [totalProgress, setTotalProgress] = useState(0);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepsRef      = useRef<Step[]>(getProgressSteps("Реферат"));
  const autoStarted   = useRef(false); // защита от двойного запуска (React Strict Mode)

  function selectWorkType(type: string) {
    setWorkType(type);
    setPages(WORK_PAGES[type]?.default ?? 20);
    stepsRef.current = getProgressSteps(type);
    setResult(null);
    setError("");
  }

  function startProgress() {
    const steps = stepsRef.current;
    const totalDuration = steps.reduce((s: number, x: Step) => s + x.duration, 0);
    let elapsed = 0;
    let currentStep = 0;
    let stepElapsed = 0;

    timerRef.current = setInterval(() => {
      elapsed     += 100;
      stepElapsed += 100;

      const step = steps[currentStep];
      if (!step) return;

      const sp = Math.min(100, (stepElapsed / step.duration) * 100);
      const tp = Math.min(95,  (elapsed / totalDuration) * 100);

      setStepProgress(sp);
      setTotalProgress(tp);
      setStepIndex(currentStep);

      if (stepElapsed >= step.duration) {
        currentStep = Math.min(currentStep + 1, steps.length - 1);
        stepElapsed = 0;
      }
    }, 100);
  }

  function stopProgress() {
    if (timerRef.current) clearInterval(timerRef.current);
    setTotalProgress(100);
    setStepProgress(100);
    setStepIndex(stepsRef.current.length - 1);
  }

  async function handleDownload() {
    if (!result) return;
    setDownloading(true);
    try {
      const response = await fetch("http://localhost:8000/api/download/referat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${result.title.replace(/[«»:]/g, "").trim()}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Не удалось скачать файл.");
    } finally {
      setDownloading(false);
    }
  }

  async function runGeneration(t: string, p: number, wt: string) {
    stepsRef.current = getProgressSteps(wt);

    // Сохраняем активную генерацию — чтобы восстановить при возврате на страницу
    sessionStorage.setItem("activeGeneration", JSON.stringify({ topic: t, pages: p, workType: wt, startedAt: Date.now() }));

    setLoading(true);
    setError("");
    setResult(null);
    setActiveSection("");
    setTotalProgress(0);
    setStepProgress(0);
    setStepIndex(0);
    startProgress();

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: t, pages: p, workType: wt }),
      });
      const data = await response.json();
      stopProgress();
      if (!response.ok) {
        if (data.code === "PAYMENT_REQUIRED") {
          sessionStorage.setItem("pendingGeneration", JSON.stringify({ topic: t, pages: p, workType: wt }));
          sessionStorage.removeItem("activeGeneration");
          router.push(`/payment?workType=${encodeURIComponent(wt)}`);
          return;
        }
        setError(data.error || "Произошла ошибка");
      } else {
        setResult(data);
        if (data.structure?.length > 0) setActiveSection(data.structure[0]);
        if (session?.user) {
          fetch("/api/generations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic: t, pages: p, workType: wt, result: data }),
          }).catch(() => {});
        }
      }
    } catch {
      stopProgress();
      setError("Не удалось подключиться к серверу");
    } finally {
      sessionStorage.removeItem("activeGeneration");
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;

    // Проверяем оплату перед генерацией
    try {
      const checkRes = await fetch(`/api/payment/check?workType=${encodeURIComponent(workType)}`);
      if (checkRes.status === 401) {
        router.push("/auth/signin");
        return;
      }
      const checkData = await checkRes.json();
      if (!checkData.hasPaid) {
        sessionStorage.setItem("pendingGeneration", JSON.stringify({ topic, pages, workType }));
        router.push(`/payment?workType=${encodeURIComponent(workType)}`);
        return;
      }
    } catch {
      setError("Не удалось проверить статус оплаты");
      return;
    }

    runGeneration(topic, pages, workType);
  }

  function toggleSection(section: string) {
    setActiveSection(prev => prev === section ? "" : section);
  }

  function renderContent(text: string) {
    const parts = text.split(/(\[TABLE\][\s\S]*?\[\/TABLE\])/g);
    return parts.map((part, i) => {
      if (part.startsWith("[TABLE]")) {
        try {
          const json = part.replace("[TABLE]", "").replace("[/TABLE]", "").trim();
          const data = JSON.parse(json);
          return (
            <div key={i} className={styles.tableWrapper}>
              {data.caption && (
                <p className={styles.tableCaption}>{data.caption}</p>
              )}
              <table className={styles.table}>
                <thead>
                  <tr>
                    {data.headers.map((h: string, j: number) => (
                      <th key={j} className={styles.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row: string[], j: number) => (
                    <tr key={j}>
                      {row.map((cell: string, k: number) => (
                        <td key={k} className={styles.td}>{cell}</td>
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
      return part.split("\n").filter(p => p.trim()).map((para, j) => (
        <p key={`${i}-${j}`} className={styles.para}>{para}</p>
      ));
    });
  }

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Баннер профиля: показываем только авторизованным с незаполненным профилем
  // и только если пользователь ещё не закрыл его (localStorage)
  useEffect(() => {
    if (!session?.user) return; // не авторизован — баннер не нужен
    if (localStorage.getItem("profileBannerDismissed") === "1") {
      setBannerDismissed(true);
      setProfileFilled(true); // не важно, скрыт навсегда
      return;
    }
    fetch("/api/profile")
      .then(r => r.json())
      .then((data: { university?: string; fullName?: string; groupNumber?: string }) => {
        const filled = !!(data.university || data.fullName || data.groupNumber);
        setProfileFilled(filled);
        setBannerDismissed(false); // разрешаем показ (если не заполнен)
      })
      .catch(() => { setBannerDismissed(true); }); // ошибка — не мешаем
  }, [session]);

  useEffect(() => {
    fetch("/api/generations/recent")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data) && data.length > 0) setRecentWorks(data); })
      .catch(() => {});
  }, []);

  // При монтировании: восстанавливаем прерванную генерацию или запускаем после оплаты
  useEffect(() => {
    // Защита от двойного запуска (React Strict Mode дважды вызывает useEffect в dev)
    if (autoStarted.current) return;
    autoStarted.current = true;

    const params = new URLSearchParams(window.location.search);

    // 1. Вернулись после оплаты
    if (params.get("autoGenerate") === "1") {
      const raw = sessionStorage.getItem("pendingGeneration");
      if (raw) {
        try {
          const { topic: t, pages: p, workType: wt } = JSON.parse(raw);
          sessionStorage.removeItem("pendingGeneration");
          window.history.replaceState({}, "", "/");
          setTopic(t); setPages(p); selectWorkType(wt);
          runGeneration(t, p, wt);
        } catch {}
      }
      return;
    }

    // 2. Пользователь ушёл с вкладки/страницы во время генерации — возобновляем
    const active = sessionStorage.getItem("activeGeneration");
    if (active) {
      try {
        const { topic: t, pages: p, workType: wt, startedAt } = JSON.parse(active);
        const elapsed = Date.now() - startedAt;
        // Повторяем только если прошло не более 10 минут
        if (elapsed < 10 * 60 * 1000) {
          sessionStorage.removeItem("activeGeneration"); // runGeneration сохранит заново
          setTopic(t); setPages(p); selectWorkType(wt);
          runGeneration(t, p, wt);
        } else {
          sessionStorage.removeItem("activeGeneration");
        }
      } catch {
        sessionStorage.removeItem("activeGeneration");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const price     = WORK_PRICES[workType]?.price ?? 199;
  const pageRange = WORK_PAGES[workType];

  return (
    <main className={styles.main}>

      {/* ── Баннер профиля ── */}
      {session?.user && !profileFilled && !bannerDismissed && (
        <div className={styles.profileBanner}>
          <div className={styles.profileBannerContent}>
            <span className={styles.profileBannerIcon}>🎓</span>
            <div>
              <p className={styles.profileBannerTitle}>
                Заполните профиль — данные будут в титульнике автоматически
              </p>
              <p className={styles.profileBannerSub}>
                ФИО, ВУЗ, кафедра, группа — один раз и навсегда
              </p>
            </div>
          </div>
          <div className={styles.profileBannerActions}>
            <Link href="/profile" className={styles.profileBannerBtn}>
              Заполнить за 1 минуту →
            </Link>
            <button
              className={styles.profileBannerClose}
              onClick={() => {
                localStorage.setItem("profileBannerDismissed", "1");
                setBannerDismissed(true);
              }}
            >✕</button>
          </div>
        </div>
      )}

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>

          <div className={styles.heroBadgeRow}>
            <span className={styles.heroBadge}>ГОСТ 7.32-2017</span>
            <span className={styles.heroBadge}>Антиплагиат 70-90%</span>
            <span className={styles.heroBadgeFree}>+ от 199 Р</span>
          </div>

          <h1 className={styles.heroTitle}>
            Готовый реферат<br/>
            за <span className={styles.heroAccent}>5 минут</span>
          </h1>

          <p className={styles.heroSub}>
            Введите тему — получите работу с соблюдением ГОСТ,
            <br className={styles.heroSubBr}/>
            {" "}списком литературы и оформлением
          </p>

          {/* Типы работ */}
          <div className={styles.workTypes}>
            {WORK_TYPES.map(type => {
              const info = WORK_PRICES[type];
              return (
                <button
                  key={type}
                  className={`${styles.workType} ${workType === type ? styles.workTypeActive : ""}`}
                  onClick={() => selectWorkType(type)}
                  disabled={loading}
                >
                  <span className={styles.workTypeLabel}>{type}</span>
                  <span className={styles.workTypePages}>{info?.pages}</span>
                </button>
              );
            })}
          </div>

          {/* Форма */}
          <form onSubmit={handleSubmit} className={styles.heroForm}>
            <div className={styles.inputWrapper}>
              <TypewriterInput
                value={topic}
                onChange={setTopic}
                disabled={loading}
                className={styles.heroInput}
              />
            </div>

            <div className={styles.formControls}>
              <div className={styles.pagesControl}>
                <span className={styles.pagesLabel}>Объём:</span>
                <input
                  type="range"
                  min={pageRange?.min ?? 20}
                  max={pageRange?.max ?? 25}
                  step={1}
                  value={pages}
                  onChange={e => setPages(Number(e.target.value))}
                  className={styles.range}
                  disabled={loading}
                />
                <span className={styles.pagesValue}>{pages} стр.</span>
              </div>
              <div className={styles.metaBadges}>
                <span className={styles.metaBadge}>Times New Roman 14pt</span>
                <span className={styles.metaBadge}>Интервал 1.5</span>
                <span className={styles.metaBadge}>Поля 30/10/20/20</span>
              </div>
            </div>

            <div className={styles.btnRow}>
              <button
                type="submit"
                className={styles.heroBtn}
                disabled={loading || !topic.trim()}
              >
                {loading
                  ? <><span className={styles.btnSpinner}/> Генерируем...</>
                  : `⚡ Сгенерировать ${workType === "ВКР" ? "ВКР" : workType.toLowerCase()} — ${price} Р`}
              </button>
            </div>
          </form>

          <p className={styles.heroNote}>
            <span className={styles.heroNoteCheck}>✓</span>{" "}
            Уже сгенерировано более <strong>1 000 работ</strong>
          </p>

        </div>
      </section>

      {/* ── Прогресс ── */}
      {loading && (
        <section className={styles.progressSection}>
          <div className={styles.progressCard}>
            <div className={styles.progressHeader}>
              <span className={styles.progressLabel}>
                {stepsRef.current[stepIndex]?.label}
              </span>
              <span className={styles.progressPercent}>
                {Math.round(totalProgress)}%
              </span>
            </div>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${totalProgress}%` }}/>
            </div>
            <div className={styles.steps}>
              {stepsRef.current.map((step, i) => {
                const done    = i < stepIndex;
                const active  = i === stepIndex;
                const pending = i > stepIndex;
                return (
                  <div
                    key={i}
                    className={`${styles.step} ${done ? styles.stepDone : ""} ${active ? styles.stepActive : ""} ${pending ? styles.stepPending : ""}`}
                  >
                    <div className={styles.stepDot}>
                      {done ? "✓" : active ? <span className={styles.stepPulse}/> : ""}
                    </div>
                    <span className={styles.stepLabel}>{step.label}</span>
                    {active && (
                      <div className={styles.stepBar}>
                        <div className={styles.stepBarFill} style={{ width: `${stepProgress}%` }}/>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className={styles.progressHint}>
              Генерация занимает 2–4 минуты. Не закрывайте страницу.
            </p>
          </div>
        </section>
      )}

      {/* ── Ошибка ── */}
      {error && (
        <div className={styles.errorWrap}>
          <div className={styles.error}>
            <div className={styles.errorIcon}>⚠</div>
            <div className={styles.errorBody}>
              <p className={styles.errorTitle}>Генерация временно недоступна</p>
              <p className={styles.errorText}>{error}. Попробуйте позже — обычно это занимает несколько минут.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Как это работает (показываем только пока нет результата) ── */}
      {!result && !loading && (
        <section className={styles.stepsSection}>
          <div className={styles.stepsSectionInner}>
            <h2 className={styles.sectionTitle}>Как это работает</h2>
            <p className={styles.sectionSub}>Три шага до готовой работы</p>
            <div className={styles.stepsGrid}>
              <div className={styles.stepCard}>
                <div className={styles.stepNum}>01</div>
                <div className={styles.stepTitle}>Вводишь тему</div>
                <p className={styles.stepText}>
                  Напиши тему реферата в поле выше — любую, на русском или английском языке
                </p>
              </div>
              <div className={styles.stepCard}>
                <div className={styles.stepNum}>02</div>
                <div className={styles.stepTitle}>ИИ пишет работу</div>
                <p className={styles.stepText}>
                  Алгоритм формирует структуру, введение, все главы, заключение и источники за 2–4 минуты
                </p>
              </div>
              <div className={styles.stepCard}>
                <div className={styles.stepNum}>03</div>
                <div className={styles.stepTitle}>Скачиваешь DOCX</div>
                <p className={styles.stepText}>
                  Готовый файл с оформлением по ГОСТ: шрифт, поля, интервалы, нумерация страниц
                </p>
              </div>
            </div>
            <div className={styles.featuresRow}>
              <div className={styles.featureItem}>
                <span className={styles.featureIcon}>✓</span> ГОСТ 7.32-2017
              </div>
              <div className={styles.featureItem}>
                <span className={styles.featureIcon}>✓</span> Список литературы
              </div>
              <div className={styles.featureItem}>
                <span className={styles.featureIcon}>✓</span> Титульный лист
              </div>
              <div className={styles.featureItem}>
                <span className={styles.featureIcon}>✓</span> Таблицы и структура
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Почему мы ── */}
      {!result && !loading && (
        <section className={styles.whySection}>
          <div className={styles.whySectionInner}>
            <h2 className={styles.whySectionTitle}>
              Почему <span className={styles.whyAccent}>Academic?</span>
            </h2>
            <div className={styles.whyCards}>
              {WHY_FEATURES.map(f => (
                <div key={f.label} className={styles.whyCard}>
                  <div className={styles.whyCardIcon}>{f.icon}</div>
                  <span className={styles.whyCardLabel}>{f.label}</span>
                  <span className={styles.whyCardDesc}>{f.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Последние работы ── */}
      {!result && !loading && (
        <section className={styles.recentSection}>
          <div className={styles.recentInner}>
            <h2 className={styles.recentHeading}>
              Последние <span className={styles.recentAccent}>проекты</span>
            </h2>
            <div className={styles.recentGrid}>
              {(showAllWorks ? recentWorks : recentWorks.slice(0, 8)).map(w => (
                <div key={w.id} className={styles.recentCard}>
                  <span className={styles.recentBadge}>{w.workType}</span>
                  <p className={styles.recentWorkTitle}>{w.topic}</p>
                  <span className={styles.recentDate}>{formatDate(w.createdAt)}</span>
                </div>
              ))}
            </div>
            {recentWorks.length > 8 && !showAllWorks && (
              <button className={styles.showMoreBtn} onClick={() => setShowAllWorks(true)}>
                Показать ещё
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── Отзывы ── */}
      {!result && !loading && (
        <section className={styles.reviewsSection}>
          <div className={styles.reviewsInner}>
            <h2 className={styles.reviewsHeading}>
              Свежие <span className={styles.reviewsAccent}>отзывы</span>
            </h2>
            <div className={styles.reviewsGrid}>
              {REVIEWS.map((r, i) => (
                <div key={i} className={styles.reviewCard}>
                  <div className={styles.reviewHeader}>
                    <div>
                      <p className={styles.reviewName}>{r.name}</p>
                      <p className={styles.reviewDate}>{r.date}</p>
                    </div>
                    <div className={styles.reviewStars}>★★★★★</div>
                  </div>
                  <p className={styles.reviewText}>{r.text}</p>
                </div>
              ))}
            </div>
            <button className={styles.reviewBtn}>Оставить отзыв</button>
          </div>
        </section>
      )}

      {/* ── FAQ ── */}
      {!result && !loading && (
        <section className={styles.faqSection}>
          <div className={styles.faqInner}>
            <h2 className={styles.faqHeading}>
              Часто задаваемые <span className={styles.faqAccent}>вопросы</span>
            </h2>
            <div className={styles.faqGrid}>
              {FAQ.map((item, i) => (
                <div
                  key={i}
                  className={`${styles.faqItem} ${faqOpen === i ? styles.faqItemOpen : ""}`}
                >
                  <button
                    className={styles.faqQ}
                    onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  >
                    <span>{item.q}</span>
                    <span className={styles.faqIcon}>{faqOpen === i ? "−" : "+"}</span>
                  </button>
                  {faqOpen === i && <p className={styles.faqA}>{item.a}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Результат ── */}
      {result && (
        <section className={styles.result}>
          <div className={styles.docHeader}>
            <div className={styles.docHeaderTop}>
              <h2 className={styles.docTitle}>{result.title}</h2>
              <button className={styles.downloadBtn} onClick={handleDownload} disabled={downloading}>
                {downloading ? (
                  <span className={styles.buttonLoading}>
                    <span className={styles.spinner}/>Создаём...
                  </span>
                ) : "⬇ Скачать DOCX"}
              </button>
            </div>
            <div className={styles.metaGrid}>
              {Object.entries(result.meta).map(([key, val]) => (
                <div key={key} className={styles.metaItem}>
                  <span className={styles.metaKey}>{key}</span>
                  <span className={styles.metaVal}>{String(val)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.toc}>
            <h3 className={styles.tocTitle}>Содержание</h3>
            <ol className={styles.tocList}>
              {result.structure.map((section, i) => (
                <li
                  key={i}
                  className={`${styles.tocItem} ${activeSection === section ? styles.tocItemActive : ""}`}
                  onClick={() => toggleSection(section)}
                >
                  <span>{section}</span>
                  <span className={styles.tocDots}/>
                  <span className={styles.tocPage}>{i + 1}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className={styles.sections}>
            {result.structure.map(section => {
              const text   = result.content[section];
              if (!text) return null;
              const isOpen = activeSection === section;
              return (
                <div key={section} className={`${styles.sectionBlock} ${isOpen ? styles.sectionOpen : ""}`}>
                  <button className={styles.sectionToggle} onClick={() => toggleSection(section)}>
                    <span>{section}</span>
                    <span className={styles.chevron}>{isOpen ? "▲" : "▼"}</span>
                  </button>
                  {isOpen && <div className={styles.sectionContent}>{renderContent(text)}</div>}
                </div>
              );
            })}
          </div>

          <div className={styles.sources}>
            <h3 className={styles.sourcesTitle}>Список литературы</h3>
            <ul className={styles.sourcesList}>
              {result.sources.map((src, i) => (
                <li key={i} className={styles.sourceItem}>{src}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

    </main>
  );
}
