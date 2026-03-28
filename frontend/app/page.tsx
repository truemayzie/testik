"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TypewriterInput from "./components/TypewriterInput";
import { WORK_PRICES, WORK_PAGES } from "../lib/prices";
import { writeGenState, patchGenState, clearGenState, readGenState } from "./lib/genState";
import { getProgressSteps, type Step } from "./lib/progressSteps";
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
  { name: "Анастасия К.", workType: "Курсовая",  date: "янв 2026", stars: 5, text: "Сдала курсовую по маркетингу. Структура логичная, введение и заключение написаны нормально. Научный руководитель вопросов по оформлению не имел." },
  { name: "Дмитрий С.",  workType: "Реферат",   date: "фев 2026", stars: 5, text: "Удивил список литературы — реальные источники с DOI, всё можно проверить. За 5 минут и 299 рублей честно, ожидал хуже." },
  { name: "Марина Л.",   workType: "ВКР",        date: "янв 2026", stars: 4, text: "Взяла как черновик — переписывала примерно треть, но структура и источники реально сэкономили время. На нормо-контроле претензий к оформлению не было." },
  { name: "Артём В.",    workType: "Эссе",       date: "мар 2026", stars: 5, text: "Эссе по философии сдал за день до дедлайна. Тема была нетривиальная, но аргументация выстроена последовательно. Доволен." },
  { name: "Екатерина Н.", workType: "Реферат",  date: "фев 2026", stars: 5, text: "Уже третий раз пользуюсь. Каждый раз оформление сразу по ГОСТу — ничего лишнего, ничего не надо переделывать." },
  { name: "Иван Т.",     workType: "Доклад",    date: "янв 2026", stars: 4, text: "Доклад на семинар по экономике. Быстро, по делу, без воды. Сэкономил пару часов точно." },
  { name: "Полина Ж.",   workType: "Курсовая",  date: "мар 2026", stars: 5, text: "Курсовая по менеджменту прошла комиссию без замечаний. Научный руководитель сказал структура грамотная. Титульник и оглавление оформлены правильно." },
  { name: "Максим Б.",   workType: "Сочинение", date: "фев 2026", stars: 5, text: "Сочинение по литературе. Тема — нравственный выбор в романе Достоевского. Есть цитаты, мысль прослеживается. Учитель поставил отлично." },
  { name: "Светлана О.", workType: "Реферат",   date: "мар 2026", stars: 5, text: "Реферат по педагогике сдала в срок. Формат DOCX сразу открылся, оформление правильное — Times New Roman, поля, интервал. Ничего не пришлось переделывать." },
  { name: "Никита Р.",   workType: "Доклад",    date: "фев 2026", stars: 4, text: "Удобно что платишь только за конкретную работу, без подписки. Доклад по социологии написан понятно, не академически сухо. Преподаватель одобрил." },
  { name: "Юлия М.",     workType: "Курсовая",  date: "янв 2026", stars: 5, text: "Первый раз пробовала такой сервис — скептически относилась. Курсовая по психологии получилась нормальной: введение, три главы, заключение, источники. Сдала на хорошо." },
];

const FAQ = [
  {
    q: "Как работает генерация?",
    a: "Введите тему, выберите тип и объём работы, нажмите «Сгенерировать». Refai строит план, ищет реальные источники через научные базы, пишет введение, все главы, заключение и список литературы. Готовый DOCX-файл скачивается сразу — обычно за 2–5 минут.",
  },
  {
    q: "Какой файл получу на выходе?",
    a: "DOCX (Microsoft Word). Оформление строго по ГОСТ 7.32-2017: Times New Roman 14pt, межстрочный интервал 1.5, поля 30/10/20/20 мм, автоматическая нумерация страниц. Открывается в Word, Google Docs и LibreOffice без потери форматирования.",
  },
  {
    q: "Сколько стоит одна работа?",
    a: "Сочинение — 99 ₽, эссе — 149 ₽, доклад — 199 ₽, реферат — 299 ₽, курсовая — 699 ₽, ВКР — 1 199 ₽. Оплата разовая, без подписки и скрытых платежей. Оплатил — получил работу.",
  },
  {
    q: "Откуда берётся список литературы?",
    a: "Источники ищутся по базе CrossRef — крупнейшему репозиторию научных публикаций. Refai находит реальные работы по теме и оформляет их по ГОСТ Р 7.0.5-2008. Каждый источник можно проверить по DOI.",
  },
  {
    q: "Будет ли высокая уникальность?",
    a: "Да. Каждая работа пишется заново под вашу конкретную тему — никаких шаблонов. Антиплагиат по «Антиплагиат.ру» обычно показывает 70–90%. Точный результат зависит от темы: редкие и узкоспециальные темы дают более высокий показатель.",
  },
  {
    q: "Можно ли редактировать работу после скачивания?",
    a: "Да. DOCX-файл редактируется в любом редакторе: Microsoft Word, Google Docs, LibreOffice. Можно скорректировать формулировки, добавить данные, изменить структуру — форматирование ГОСТ при этом сохранится.",
  },
  {
    q: "Что если работа не устроила?",
    a: "Напишите на support@ref-ai.ru с описанием проблемы. Мы разберём ситуацию: если ошибка на нашей стороне — повторим генерацию или вернём деньги. История работ сохраняется в разделе «Мои работы».",
  },
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

  // Тестовый аккаунт ЮКасса
  const userRole  = (session?.user as { role?: string } | null)?.role;
  const isYukassa = userRole === "yukassa_test";
  const isAdmin   = userRole === "admin";
  const YUKASSA_TYPES = ["Сочинение", "Эссе", "Доклад"];

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
  const [trialUsed, setTrialUsed]             = useState(false);
  const [f5Recovery, setF5Recovery]           = useState(false);

  // Прогресс
  const [stepIndex, setStepIndex]       = useState(0);

  const [totalProgress, setTotalProgress] = useState(0);
  const [dots, setDots] = useState(".");

  const [factIndex, setFactIndex]   = useState(0);
  const [factVisible, setFactVisible] = useState(true);

  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepsRef        = useRef<Step[]>(getProgressSteps("Реферат"));
  const autoStarted     = useRef(false); // защита от двойного запуска (React Strict Mode)
  const f5InfoRef       = useRef<{ workType: string; startedAt: number }>({ workType: "Реферат", startedAt: 0 });
  const isUnloadingRef  = useRef(false); // флаг F5 / ухода со страницы
  const loadingRef      = useRef(false);  // актуальное значение loading для beforeunload
  const currentGenRef   = useRef<{ topic: string; pages: number; workType: string; startedAt: number } | null>(null);
  const heroRef         = useRef<HTMLElement>(null);

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

    let syncTick = 0;
    timerRef.current = setInterval(() => {
      elapsed     += 100;
      stepElapsed += 100;
      syncTick++;

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
          currentStep = next;
          stepElapsed = 0;
          // Обновляем localStorage при смене шага
          patchGenState({ percent: tp, stepLabel: steps[currentStep]?.label ?? "" });
        } else {
          stepElapsed = 0;
        }
      }

      // Синхронизируем процент каждые 2 секунды
      if (syncTick % 20 === 0) {
        patchGenState({ percent: tp });
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
      const response = await fetch("/api/download", {
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
    currentGenRef.current = { topic: t, pages: p, workType: wt, startedAt: _gen.startedAt };
    writeGenState({ active: true, percent: 0, stepLabel: stepsRef.current[0]?.label ?? "", workType: wt, topic: t, pages: p, startedAt: _gen.startedAt });
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
          clearGenState();
          sessionStorage.setItem("pendingGeneration", JSON.stringify({ topic: t, pages: p, workType: wt }));
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
        if (isYukassa) setTrialUsed(true);
      }
    } catch (err) {
      console.error('[Refai] Ошибка генерации:', err);
      stopProgress();
      if (isUnloadingRef.current) {
        // Страница выгружается (F5 / закрытие вкладки) — сохраняем genState для восстановления
        return;
      }
      const errMsg = "Не удалось подключиться к серверу";
      _gen.resolve(null, errMsg);
      setError(errMsg);
    } finally {
      if (!isUnloadingRef.current) {
        currentGenRef.current = null;
        clearGenState();
        sessionStorage.removeItem("activeGeneration");
        setLoading(false);
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;

    // Admin — генерация бесплатно
    if (isAdmin) {
      runGeneration(topic, pages, workType);
      return;
    }

    // Тестовый аккаунт ЮКасса — минуем проверку оплаты
    if (isYukassa) {
      if (trialUsed) return;
      runGeneration(topic, pages, workType);
      return;
    }

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

  // Для тестового аккаунта ЮКасса: проверяем использование пробной генерации
  useEffect(() => {
    if (!isYukassa) return;
    // Устанавливаем Эссе как тип по умолчанию для тестового аккаунта
    selectWorkType("Эссе");
    fetch("/api/generations")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length >= 1) setTrialUsed(true);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isYukassa]);

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

    // 3. Переход из футера по типу работы (?workType=...)
    const wtParam = params.get("workType");
    if (wtParam && !params.get("autoGenerate") && !readGenState()) {
      const VALID = ["Сочинение","Эссе","Доклад","Реферат","Курсовая","ВКР"];
      if (VALID.includes(wtParam)) {
        selectWorkType(wtParam);
        window.history.replaceState({}, "", "/");
        setTimeout(() => {
          heroRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
        return;
      }
    }

    // 2. Пользователь ушёл на другую страницу и вернулся — восстанавливаем
    const genSt = readGenState();
    const active = sessionStorage.getItem("activeGeneration");
    if (genSt || active) {
      (async () => {
        try {
          // Предпочитаем localStorage (переживает F5), но fallback на sessionStorage
          const startedAt = genSt?.startedAt ?? (active ? JSON.parse(active).startedAt : 0);
          const t  = genSt?.topic    ?? (active ? JSON.parse(active).topic    : "");
          const p  = genSt?.pages != null ? genSt.pages : (active ? JSON.parse(active).pages : 0);
          const wt = genSt?.workType ?? (active ? JSON.parse(active).workType : "Реферат");
          const savedPercent = genSt?.percent ?? 0;

          const elapsed = Date.now() - startedAt;
          if (elapsed >= 10 * 60 * 1000) {
            clearGenState();
            sessionStorage.removeItem("activeGeneration");
            return;
          }
          selectWorkType(wt);
          setTopic(t);
          if (p) setPages(p);

          // Случай 1: клиентская навигация (router.push/Link) — модуль жив,
          // _gen знает об активной генерации → просто подключаемся к ней.
          if (_gen.active || (_gen.done && _gen.startedAt === startedAt)) {
            stepsRef.current = getProgressSteps(wt);
            if (!_gen.done) {
              setLoading(true); setError(""); setResult(null);
              setTotalProgress(savedPercent); setStepIndex(0);
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
              clearGenState();
              sessionStorage.removeItem("activeGeneration");
              setLoading(false);
            });
            console.log("[Refai] Восстановление UI (клиентская навигация):", { topic: t, workType: wt });
            return;
          }

          // Случай 2: жёсткая перезагрузка (F5) — модуль сброшен.
          // Возобновляем анимацию прогресса с нужного момента + запускаем поллинг статуса.
          console.log("[Refai] Восстановление (F5): возобновление прогресса", { percent: savedPercent, elapsed, workType: wt });
          stepsRef.current = getProgressSteps(wt);
          f5InfoRef.current = { workType: wt, startedAt };
          setLoading(true);
          setError("");
          setResult(null);
          setTotalProgress(savedPercent);
          setF5Recovery(true);
          // НЕ чистим genState здесь — поллинг-эффект сделает это когда найдёт результат
          sessionStorage.removeItem("activeGeneration");
          setTimeout(() => startProgress(elapsed), 0);
        } catch {
          clearGenState();
          sessionStorage.removeItem("activeGeneration");
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Держим loadingRef в синхронизации
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // Показываем диалог подтверждения при попытке уйти во время генерации
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!loadingRef.current) return;
      e.preventDefault();
      e.returnValue = "Генерация в процессе"; // непустая строка — нужна для Firefox
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // pagehide — гарантированно выполняется перед выгрузкой (после подтверждения «Уйти»).
  // Записываем genState в localStorage прямо (без dispatchEvent) до отмены fetch.
  useEffect(() => {
    const onPageHide = () => {
      if (!loadingRef.current || !currentGenRef.current) return;
      isUnloadingRef.current = true;
      try {
        const raw = localStorage.getItem("refai_gen");
        if (raw) {
          const parsed = JSON.parse(raw);
          parsed.active = true;
          localStorage.setItem("refai_gen", JSON.stringify(parsed));
        } else {
          const { topic, pages, workType, startedAt } = currentGenRef.current;
          localStorage.setItem("refai_gen", JSON.stringify({
            active: true, percent: 0, stepLabel: "", workType, topic, pages, startedAt,
          }));
        }
      } catch {}
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  // Поллинг статуса после F5-восстановления
  useEffect(() => {
    if (!f5Recovery) return;

    const { workType: wt, startedAt } = f5InfoRef.current;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/generate/poll?workType=${encodeURIComponent(wt)}&startedAt=${startedAt}`
        );
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "done") {
          clearInterval(pollRef.current!);
          clearGenState();
          stopProgress();
          setF5Recovery(false);
          setLoading(false);
          console.log("[Refai] F5-восстановление: генерация завершена, переход в Мои работы");
          router.push("/dashboard");
        } else if (data.status === "error" || data.status === "not_found") {
          clearInterval(pollRef.current!);
          clearGenState();
          stopProgress();
          setF5Recovery(false);
          setLoading(false);
          setError(
            data.status === "not_found"
              ? "Сервер был перезапущен во время генерации. Проверьте «Мои работы» — если работа сохранилась, она там."
              : "Генерация завершилась с ошибкой. Проверьте «Мои работы»."
          );
          console.log("[Refai] F5-восстановление:", data.status);
        }
        // status === "running" | "idle" — продолжаем ждать
      } catch { /* сеть недоступна, повторим */ }
    }, 5_000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f5Recovery]);

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
      <section ref={heroRef} className={styles.hero}>
        <div className={styles.heroInner}>

          <div className={styles.heroBadgeRow}>
            <span className={styles.heroBadge}>ГОСТ 7.32-2017</span>
            <span className={styles.heroBadge}>Антиплагиат 70-90%</span>
            <span className={styles.heroBadgeFree}>+ от 99 ₽</span>
          </div>

          <h1 className={styles.heroTitle}>
            Готовый реферат, курсовая или эссе<br/>
            за <span className={styles.heroAccent}>5 минут</span>
          </h1>

          <p className={styles.heroSub}>
            Введите тему — получите работу по ГОСТу,<br/>
            со списком литературы и готовым оформлением
          </p>

          {/* Баннер для тестового аккаунта ЮКасса */}
          {isYukassa && !loading && (
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

          {/* Типы работ */}
          <div className={styles.workTypes}>
            {/* Кнопка Тест — только для admin */}
            {isAdmin && (
              <button
                key="Тест"
                className={`${styles.workType} ${styles.workTypeTest} ${workType === "Тест" ? styles.workTypeActive : ""}`}
                onClick={() => selectWorkType("Тест")}
                disabled={loading}
                title="Тестовая генерация — только для администратора"
              >
                <span className={styles.workTypeLabel}>Тест</span>
                <span className={styles.workTypePages}>1 стр.</span>
              </button>
            )}
            {(isYukassa ? YUKASSA_TYPES : WORK_TYPES).map(type => {
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
                disabled={loading || !topic.trim() || (isYukassa && trialUsed)}
              >
                {loading
                  ? <><span className={styles.btnSpinner}/> Генерируем...</>
                  : isYukassa
                    ? `🎯 Сгенерировать ${{ "Сочинение": "сочинение", "Эссе": "эссе", "Доклад": "доклад" }[workType] ?? workType.toLowerCase()} — тест`
                    : `⚡ Сгенерировать ${{ "Сочинение": "сочинение", "Эссе": "эссе", "Доклад": "доклад", "Реферат": "реферат", "Курсовая": "курсовую", "ВКР": "ВКР" }[workType] ?? workType.toLowerCase()} — ${price} ₽`}
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

            {f5Recovery ? (
              <div className={styles.f5RecoveryHint}>
                <p className={styles.progressHint}>
                  Страница была перезагружена. Генерация продолжается на сервере — ждём результата...
                </p>
                <Link href="/dashboard" className={styles.progressDashLink}>
                  Мои работы →
                </Link>
              </div>
            ) : (
              <p className={styles.progressHint}>
                Готовая работа автоматически сохранится в разделе «Мои работы»
              </p>
            )}
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
            <div className={styles.reviewsTop}>
              <h2 className={styles.reviewsHeading}>
                Свежие <span className={styles.reviewsAccent}>отзывы</span>
              </h2>
              <div className={styles.reviewCta}>
                <a
                  href="mailto:support@ref-ai.ru?subject=Отзыв о Refai"
                  className={styles.reviewBtn}
                >
                  ✉ Написать отзыв
                </a>
                <p className={styles.reviewCtaHint}>Отправьте нам — отмодерируем и опубликуем</p>
              </div>
            </div>
          </div>
          <div className={styles.reviewsTrack}>
            <div className={styles.reviewsScroll}>
              {[...REVIEWS, ...REVIEWS].map((r, i) => (
                <div key={i} className={styles.reviewCard}>
                  <div className={styles.reviewCardTop}>
                    <div>
                      <p className={styles.reviewName}>{r.name}</p>
                      <p className={styles.reviewDate}>{r.date}</p>
                    </div>
                    <div className={styles.reviewRight}>
                      <span className={styles.reviewWorkBadge}>{r.workType}</span>
                      <div className={styles.reviewStars}>{"★".repeat(r.stars)}</div>
                    </div>
                  </div>
                  <p className={styles.reviewText}>{r.text}</p>
                </div>
              ))}
            </div>
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
