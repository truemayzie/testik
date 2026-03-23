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

// ── Состояние текущей генерации (живёт между client-side навигациями) ────────
// Модульная переменная — не сбрасывается при router.push/Link, только при F5
type PendingCb = (data: ReferatResult | null, error: string) => void;
const _gen = (() => {
  let _topic = ""; let _pages = 0; let _workType = ""; let _startedAt = 0;
  let _done = false; let _data: ReferatResult | null = null; let _err = "";
  const _cbs: PendingCb[] = [];
  return {
    get active()    { return _startedAt > 0 && !_done; },
    get done()      { return _done; },
    get startedAt() { return _startedAt; },
    get topic()     { return _topic; },
    get pages()     { return _pages; },
    get workType()  { return _workType; },
    start(t: string, p: number, wt: string) {
      _topic = t; _pages = p; _workType = wt;
      _startedAt = Date.now(); _done = false; _data = null; _err = "";
    },
    resolve(d: ReferatResult | null, e: string) {
      _done = true; _data = d; _err = e;
      _cbs.splice(0).forEach(cb => cb(d, e));
      setTimeout(() => { if (_done) _startedAt = 0; }, 60_000); // сбрасываем через минуту
    },
    listen(cb: PendingCb) {
      if (_done || !_startedAt) { cb(_data, _err); return; }
      _cbs.push(cb);
    },
    cancel() { _cbs.splice(0); _startedAt = 0; _done = false; },
  };
})();

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
  { q: "Сколько стоит генерация?",        a: "Стоимость зависит от типа работы: сочинение — 99 ₽, эссе — 149 ₽, доклад — 199 ₽, реферат — 299 ₽, курсовая — 699 ₽, ВКР — 1199 ₽. Оплата разовая за каждую работу." },
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
    // ~60-70с реально
    return [
      { label: "Анализируем тему",   duration: 5000  },
      { label: "Подбираем стиль",    duration: 8000  },
      { label: "Пишем текст",        duration: 50000 },
      { label: "Финальная проверка", duration: 7000  },
    ];
  }
  if (workType === "Доклад") {
    // ~100-120с реально: источники + 2 главы по 2 подглавы
    return [
      { label: "Анализируем тему",    duration: 5000  },
      { label: "Ищем источники",      duration: 22000 },
      { label: "Формируем структуру", duration: 8000  },
      { label: "Пишем введение",      duration: 12000 },
      { label: "Пишем раздел 1",      duration: 28000 },
      { label: "Пишем раздел 2",      duration: 28000 },
      { label: "Пишем заключение",    duration: 12000 },
      { label: "Финальная проверка",  duration: 5000  },
    ];
  }
  if (workType === "ВКР") {
    // ~350-420с реально: 3 главы по 3 подглавы = 9 больших секций
    return [
      { label: "Анализируем тему",    duration: 8000  },
      { label: "Ищем источники",      duration: 30000 },
      { label: "Формируем структуру", duration: 10000 },
      { label: "Пишем введение",      duration: 25000 },
      { label: "Пишем главу 1",       duration: 85000 },
      { label: "Пишем главу 2",       duration: 85000 },
      { label: "Пишем главу 3",       duration: 85000 },
      { label: "Пишем заключение",    duration: 25000 },
      { label: "Оформляем приложения",duration: 8000  },
      { label: "Оформляем литературу",duration: 12000 },
      { label: "Финальная проверка",  duration: 7000  },
    ];
  }
  if (workType === "Курсовая") {
    // ~220-260с реально: 3 главы по 2 подглавы = 6 больших секций
    return [
      { label: "Анализируем тему",    duration: 5000  },
      { label: "Ищем источники",      duration: 25000 },
      { label: "Формируем структуру", duration: 8000  },
      { label: "Пишем введение",      duration: 18000 },
      { label: "Пишем главу 1",       duration: 55000 },
      { label: "Пишем главу 2",       duration: 55000 },
      { label: "Пишем главу 3",       duration: 55000 },
      { label: "Пишем заключение",    duration: 18000 },
      { label: "Оформляем литературу",duration: 10000 },
      { label: "Финальная проверка",  duration: 6000  },
    ];
  }
  // Реферат: ~160-180с реально: 3 главы по 2 подглавы
  return [
    { label: "Анализируем тему",    duration: 5000  },
    { label: "Ищем источники",      duration: 25000 },
    { label: "Формируем структуру", duration: 8000  },
    { label: "Пишем введение",      duration: 15000 },
    { label: "Пишем главу 1",       duration: 35000 },
    { label: "Пишем главу 2",       duration: 35000 },
    { label: "Пишем главу 3",       duration: 35000 },
    { label: "Пишем заключение",    duration: 15000 },
    { label: "Оформляем литературу",duration: 8000  },
    { label: "Финальная проверка",  duration: 4000  },
  ];
}

const FUN_FACTS = [
  "Средний студент тратит около 17 часов в неделю на подготовку к занятиям",
  "Исследования показывают что написание конспектов от руки улучшает запоминание на 40%",
  "Первый университет в мире — Болонский — был основан в 1088 году",
  "Чтение вслух помогает запомнить материал лучше чем молчаливое чтение",
  "В среднем человек может удерживать концентрацию внимания около 25 минут",
  "Метод Помодоро — 25 минут работы и 5 минут отдыха — повышает продуктивность на 30%",
  "Сон после изучения нового материала улучшает его запоминание на 20–30%",
  "Первая печатная книга была создана Гутенбергом около 1450 года",
  "Объяснение материала другому человеку — один из лучших способов его выучить",
  "В России насчитывается более 700 высших учебных заведений",
  "Средняя длина научной статьи составляет около 8000 слов",
  "Библиотека Конгресса США содержит более 170 миллионов единиц хранения",
  "Написание от руки активирует больше областей мозга чем печать на клавиатуре",
  "Перерывы во время учёбы повышают эффективность усвоения материала",
  "Первая электронная книга была создана в 1971 году в рамках проекта Гутенберг",
];

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

  const [totalProgress, setTotalProgress] = useState(0);
  const [dots, setDots] = useState(".");

  const [factIndex, setFactIndex]   = useState(0);
  const [factVisible, setFactVisible] = useState(true);

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

  function startProgress(elapsedOffset = 0) {
    const steps = stepsRef.current;
    const totalDuration = steps.reduce((s: number, x: Step) => s + x.duration, 0);
    let elapsed = elapsedOffset;

    // Находим шаг, соответствующий уже прошедшему времени
    let currentStep = 0;
    let stepElapsed = 0;
    let cumulative = 0;
    for (let i = 0; i < steps.length; i++) {
      const end = cumulative + steps[i].duration;
      if (end > elapsedOffset || i === steps.length - 1) {
        currentStep = i;
        stepElapsed = elapsedOffset - cumulative;
        break;
      }
      cumulative = end;
    }

    const rawInit = Math.min(1, elapsed / totalDuration);
    const tpInit  = rawInit * 90;
    setTotalProgress(tpInit);
    setStepIndex(currentStep);
    console.log(`[Refai] Шаг: ${currentStep} - ${steps[currentStep]?.label} | ${Math.round(tpInit)}%`);

    timerRef.current = setInterval(() => {
      elapsed     += 100;
      stepElapsed += 100;

      const step = steps[currentStep];
      if (!step) return;

      const rawRatio = Math.min(1, elapsed / totalDuration);
      const tp = rawRatio * 90;

      setTotalProgress(tp);
      setStepIndex(currentStep);

      if (stepElapsed >= step.duration) {
        const next = Math.min(currentStep + 1, steps.length - 1);
        if (next !== currentStep) {
          console.log(`[Refai] Шаг:`, next, '-', steps[next]?.label, '|', Math.round(tp) + '%');
        }
        currentStep = next;
        stepElapsed = 0;
      }
    }, 100);
  }

  function stopProgress() {
    if (timerRef.current) clearInterval(timerRef.current);
    setTotalProgress(100);
    setStepIndex(stepsRef.current.length - 1);
  }

  async function handleDownload() {
    if (!result) return;
    console.log('[Refai] Скачивание DOCX...');
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
      console.log('[Refai] DOCX скачан успешно');
    } catch {
      alert("Не удалось скачать файл.");
    } finally {
      setDownloading(false);
    }
  }

  async function runGeneration(t: string, p: number, wt: string) {
    console.log('[Refai] Начало генерации:', { topic: t, workType: wt, pages: p });
    stepsRef.current = getProgressSteps(wt);

    // Регистрируем генерацию в модульном состоянии (для восстановления при навигации)
    _gen.start(t, p, wt);
    sessionStorage.setItem("activeGeneration", JSON.stringify({ topic: t, pages: p, workType: wt, startedAt: _gen.startedAt }));

    setLoading(true);
    setError("");
    setResult(null);
    setActiveSection("");
    setTotalProgress(0);
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
          _gen.cancel();
          sessionStorage.setItem("pendingGeneration", JSON.stringify({ topic: t, pages: p, workType: wt }));
          sessionStorage.removeItem("activeGeneration");
          router.push(`/payment?workType=${encodeURIComponent(wt)}`);
          return;
        }
        if (data.code === "SAVED") {
          // Соединение прервалось, но работа сохранена — направляем в Мои работы
          const errMsg = "Соединение прервалось, но работа сохранена. Найдите её в разделе «Мои работы».";
          _gen.resolve(null, errMsg);
          setError(errMsg);
          return;
        }
        const errMsg = data.error || "Произошла ошибка";
        _gen.resolve(null, errMsg);
        setError(errMsg);
      } else {
        console.log('[Refai] Генерация завершена. Разделов:', data.structure?.length, '| Источников:', data.sources?.length);
        _gen.resolve(data as ReferatResult, "");
        setResult(data);
        if (data.structure?.length > 0) setActiveSection(data.structure[0]);
      }
    } catch (err) {
      console.error('[Refai] Ошибка генерации:', err);
      stopProgress();
      const errMsg = "Не удалось подключиться к серверу";
      _gen.resolve(null, errMsg);
      setError(errMsg);
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
        console.log("[Refai] Оплата не найдена, переход на страницу оплаты:", workType);
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

  // Анимация точек "..." пока идёт генерация
  useEffect(() => {
    if (!loading) { setDots("."); return; }
    const id = setInterval(() => {
      setDots(d => d.length >= 3 ? "." : d + ".");
    }, 500);
    return () => clearInterval(id);
  }, [loading]);

  // Смена фактов — равномерно на весь период генерации (каждый факт ровно 1 раз)
  useEffect(() => {
    if (!loading) { setFactVisible(true); return; }
    const steps    = getProgressSteps(workType);
    const totalMs  = steps.reduce((sum, s) => sum + s.duration, 0);
    const interval = Math.max(6000, Math.floor(totalMs / FUN_FACTS.length));
    const id = setInterval(() => {
      setFactVisible(false);
      setTimeout(() => {
        setFactIndex(i => (i + 1) % FUN_FACTS.length);
        setFactVisible(true);
      }, 500);
    }, interval);
    return () => clearInterval(id);
  }, [loading, workType]);

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
          // selectWorkType сбрасывает pages на дефолт → setPages(p) вызываем после
          selectWorkType(wt);
          setTopic(t);
          setPages(p);
          console.log("[Refai] Автозапуск после оплаты:", { topic: t, workType: wt, pages: p });
          // setTimeout(0): выходим за пределы синхронного цикла mount→cleanup→remount
          // React Strict Mode убивает setInterval в cleanup — defer спасает от этого
          setTimeout(() => runGeneration(t, p, wt), 0);
        } catch {}
      }
      return;
    }

    // 2. Пользователь ушёл на другую страницу и вернулся — восстанавливаем
    const active = sessionStorage.getItem("activeGeneration");
    if (active) {
      (async () => {
        try {
          const { topic: t, pages: p, workType: wt, startedAt } = JSON.parse(active);
          const elapsed = Date.now() - startedAt;
          if (elapsed >= 10 * 60 * 1000) {
            sessionStorage.removeItem("activeGeneration");
            return;
          }
          selectWorkType(wt);
          setTopic(t);
          setPages(p);

          // Случай 1: клиентская навигация (router.push/Link) — модуль жив,
          // _gen знает об активной генерации → просто подключаемся к ней.
          if (_gen.active || (_gen.done && _gen.startedAt === startedAt)) {
            stepsRef.current = getProgressSteps(wt);
            if (!_gen.done) {
              setLoading(true); setError(""); setResult(null);
              setTotalProgress(0); setStepIndex(0);
              // setTimeout(0): выходим за пределы синхронного цикла mount→cleanup→remount
              // React Strict Mode убивает setInterval в cleanup — defer спасает от этого
              const elapsedAtMount = elapsed;
              setTimeout(() => { if (!_gen.done) startProgress(elapsedAtMount + 100); }, 0);
            }
            _gen.listen((data, err) => {
              stopProgress();
              if (data) {
                setResult(data);
                if (data.structure?.length > 0) setActiveSection(data.structure[0]);
              } else {
                setError(err || "Генерация не удалась");
              }
              sessionStorage.removeItem("activeGeneration");
              setLoading(false);
            });
            console.log("[Refai] Восстановление UI (клиентская навигация):", { topic: t, workType: wt });
            return;
          }

          // Случай 2: жёсткая перезагрузка (F5) — модуль сброшен, проверяем платёж
          const checkRes = await fetch(`/api/payment/check?workType=${encodeURIComponent(wt)}`);
          const checkData = await checkRes.json();
          if (!checkData.hasPaid) {
            // Платёж занят — оригинальная генерация завершилась или всё ещё идёт (серверная)
            console.log("[Refai] Восстановление (F5): платёж занят, ждём результата в Мои работы");
            setError("Генерация была прервана перезагрузкой страницы. Проверьте результат в разделе «Мои работы».");
            sessionStorage.removeItem("activeGeneration");
            return;
          }
          sessionStorage.removeItem("activeGeneration");
          console.log("[Refai] Восстановление (F5): перезапуск генерации:", { topic: t, workType: wt, pages: p });
          setTimeout(() => runGeneration(t, p, wt), 0);
        } catch {
          sessionStorage.removeItem("activeGeneration");
        }
      })();
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
            <span className={styles.heroBadgeFree}>+ от 99 Р</span>
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
                  : `⚡ Сгенерировать ${{ "Сочинение": "сочинение", "Эссе": "эссе", "Доклад": "доклад", "Реферат": "реферат", "Курсовая": "курсовую", "ВКР": "ВКР" }[workType] ?? workType.toLowerCase()} — ${price} Р`}
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

            {/* Заголовок: текущий шаг + процент */}
            <div className={styles.progressHeader}>
              <span className={styles.progressLabel}>
                {stepsRef.current[stepIndex]?.label}
                <span className={styles.progressDots}>{dots}</span>
              </span>
              <span className={styles.progressPercent}>{Math.round(totalProgress)}%</span>
            </div>

            {/* Единый прогресс-бар */}
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${totalProgress}%` }}/>
            </div>

            {/* Хлебные крошки: предыдущий → текущий → следующий */}
            <div className={styles.progressCrumb}>
              {stepIndex > 0 && (
                <>
                  <span className={styles.crumbPrev}>
                    {stepsRef.current[stepIndex - 1]?.label}
                  </span>
                  <span className={styles.crumbSep}>→</span>
                </>
              )}
              <span className={styles.crumbCurrent}>
                {stepsRef.current[stepIndex]?.label}
              </span>
              {stepIndex < stepsRef.current.length - 1 && (
                <>
                  <span className={styles.crumbSep}>→</span>
                  <span className={styles.crumbNext}>
                    {stepsRef.current[stepIndex + 1]?.label}
                  </span>
                </>
              )}
            </div>

            <p className={styles.progressHint}>
              Не закрывайте страницу — генерация продолжится в фоне
            </p>
          </div>

          {/* Карточка с фактом */}
          <div className={styles.factCard} style={{ opacity: factVisible ? 1 : 0 }}>
            <span className={styles.factBadge}>💡 Знаете ли вы?</span>
            <p className={styles.factText}>{FUN_FACTS[factIndex]}</p>
            <div className={styles.factFooter}>
              <div className={styles.factDots}>
                {FUN_FACTS.map((_, i) => (
                  <span
                    key={i}
                    className={i === factIndex ? styles.factDotActive : styles.factDot}
                  />
                ))}
              </div>
              <span className={styles.factCounter}>{factIndex + 1} / {FUN_FACTS.length}</span>
            </div>
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
              Почему <span className={styles.whyAccent}>Refai?</span>
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
                  <span suppressHydrationWarning className={styles.recentDate}>{formatDate(w.createdAt)}</span>
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
