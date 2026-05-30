"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TypewriterInput from "./components/TypewriterInput";
import ExamplesSection from "./components/ExamplesSection";
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

const WHY_FEATURES = [
  { label: "Скорость",       value: "7–10 минут",          note: "Реалистичный срок с учетом объемных работ" },
  { label: "Простота",       value: "Только тема",          note: "Структуру и источники находит ИИ — вы просто ждёте" },
  { label: "Цена",           value: "от 99 ₽",              note: "Без подписки — платите за каждую работу отдельно" },
  { label: "Доп. материалы", value: "Презентация + доклад", note: "Добавьте слайды и текст выступления после генерации" },
  { label: "Везде",          value: "Любой браузер",        note: "Со смартфона или компьютера, без установки" },
];

const WHY_ICONS: Record<string, React.ReactNode> = {
  "Скорость": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  "Простота": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
    </svg>
  ),
  "Цена": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  ),
  "Доп. материалы": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
    </svg>
  ),
  "Везде": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
    </svg>
  ),
};

const STEP_ICONS = [
  <svg key="edit" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>,
  <svg key="eye" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>,
  <svg key="download" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>,
];

const HOW_STEPS = [
  {
    title: "Тема и тип работы",
    text: "Выберите формат — от сочинения до ВКР — и введите тему. Можно кратко, главное передать суть.",
  },
  {
    title: "Превью перед оплатой",
    text: "Смотрите содержание и фрагмент текста. Полная версия — после оплаты.",
  },
  {
    title: "DOCX по ГОСТ",
    text: "Скачиваете Word: шрифт, поля, интервалы, титульник и список литературы уже оформлены.",
  },
] as const;

const HOW_FEATURES = [
  "ГОСТ 7.32-2017",
  "Список литературы",
  "Титульный лист",
  "Таблицы и структура",
] as const;

type CompareAiTone = "plus" | "neutral" | "minus";

const AI_COMPARE_ROWS: {
  label: string;
  generic: string;
  refai: string;
  aiTone: CompareAiTone;
}[] = [
  {
    label: "Идеи и черновик",
    aiTone: "plus",
    generic: "Быстрые ответы, можно уточнять в чате",
    refai: "Сразу структура под тип работы",
  },
  {
    label: "Оформление по ГОСТ",
    aiTone: "neutral",
    generic: "Текст есть — поля и шрифты вручную",
    refai: "Готовый DOCX по ГОСТ",
  },
  {
    label: "Список литературы",
    aiTone: "neutral",
    generic: "Подскажет названия — ссылки проверяйте",
    refai: "Реальные источники из баз",
  },
  {
    label: "Структура работы",
    aiTone: "neutral",
    generic: "Зависит от формулировки запроса",
    refai: "Введение, главы, заключение",
  },
  {
    label: "Титульный лист",
    aiTone: "minus",
    generic: "Собираете сами в Word",
    refai: "Заполняется из профиля",
  },
  {
    label: "Формат сдачи",
    aiTone: "neutral",
    generic: "Копировать из чата по частям",
    refai: "Скачать Word одним файлом",
  },
];

function CompareMarkIcon({ kind }: { kind: "yes" | "ai" | "partial" | "no" }) {
  const markClass =
    kind === "yes"
      ? styles.compareMarkYes
      : kind === "ai"
        ? styles.compareMarkAi
        : kind === "partial"
          ? styles.compareMarkPartial
          : styles.compareMarkNo;

  return (
    <span className={`${styles.compareMark} ${markClass}`} aria-hidden>
      {kind === "partial" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M8 12h8" />
        </svg>
      ) : kind === "no" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M8 8l8 8M16 8l-8 8" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 12.5l3.5 3.5L18 8" />
        </svg>
      )}
    </span>
  );
}

function CompareAiMark({ tone }: { tone: CompareAiTone }) {
  if (tone === "plus") return <CompareMarkIcon kind="ai" />;
  if (tone === "neutral") return <CompareMarkIcon kind="partial" />;
  return <CompareMarkIcon kind="no" />;
}

function CompareAiCell({
  text,
  tone,
  className,
}: {
  text: string;
  tone: CompareAiTone;
  className?: string;
}) {
  return (
    <div
      className={[styles.compareRowAi, className ?? ""].filter(Boolean).join(" ")}
    >
      <CompareAiMark tone={tone} />
      <span className={styles.compareCellText}>{text}</span>
    </div>
  );
}

const FAQ = [
  {
    q: "Как работает генерация?",
    a: "Введите тему, выберите тип работы и нажмите «Посмотреть превью». На странице заказа увидите содержание и фрагмент текста, затем оплатите полную генерацию. Refai строит план, ищет реальные источники, пишет все разделы и оформляет DOCX по ГОСТ.",
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

const MOCK_WORKS_POOL = [
  { type: "Курсовая",  title: "Народное художественное творчество как материал для речевого развития школьников" },
  { type: "ВКР",       title: "Цифровая трансформация банковского сектора России в условиях санкционного давления" },
  { type: "Реферат",   title: "Причины распада Советского Союза: экономические и политические факторы" },
  { type: "Курсовая",  title: "Психологические особенности подросткового возраста и их влияние на учебную мотивацию" },
  { type: "Эссе",      title: "Роль искусственного интеллекта в современной медицине: перспективы и риски" },
  { type: "Реферат",   title: "Глобальное потепление и его последствия для экосистем арктического региона" },
  { type: "ВКР",       title: "Управление финансовыми рисками в коммерческом банке на примере ПАО Сбербанк" },
  { type: "Курсовая",  title: "Маркетинговые стратегии продвижения образовательных услуг в цифровой среде" },
  { type: "Доклад",    title: "Нейронные сети в обработке естественного языка: архитектура трансформеров" },
  { type: "Реферат",   title: "Экономические реформы Петра I и их влияние на развитие Российского государства" },
  { type: "Курсовая",  title: "Правовое регулирование криптовалют в Российской Федерации и зарубежных странах" },
  { type: "ВКР",       title: "Разработка системы автоматизированного тестирования для микросервисной архитектуры" },
  { type: "Сочинение", title: "Тема маленького человека в произведениях Достоевского и Гоголя" },
  { type: "Реферат",   title: "Современные методы лечения сахарного диабета второго типа" },
  { type: "Курсовая",  title: "Влияние социальных сетей на политическую активность молодёжи" },
  { type: "ВКР",       title: "Оптимизация логистических процессов торгового предприятия методами линейного программирования" },
  { type: "Доклад",    title: "Квантовые вычисления: современное состояние и перспективы применения" },
  { type: "Реферат",   title: "Феномен буллинга в современной школьной среде: причины и профилактика" },
  { type: "Курсовая",  title: "Налоговое планирование в малом бизнесе: инструменты и ограничения" },
  { type: "Эссе",      title: "Этические проблемы клонирования человека в свете современной биоэтики" },
  { type: "ВКР",       title: "Анализ конкурентоспособности российских автопроизводителей в условиях ухода западных брендов" },
  { type: "Реферат",   title: "Экологические последствия нефтяного загрязнения морских акваторий" },
  { type: "Курсовая",  title: "Гендерные стереотипы в рекламе: эволюция образов за последние 30 лет" },
  { type: "Доклад",    title: "История развития интернета: от ARPANET до Web 3.0" },
  { type: "Сочинение", title: "Образ природы как отражение внутреннего мира героев в лирике Тютчева" },
  { type: "ВКР",       title: "Эффективность государственных программ поддержки малого бизнеса в регионах России" },
  { type: "Реферат",   title: "Философия стоицизма и её актуальность для современного человека" },
  { type: "Курсовая",  title: "Организационная культура как фактор удержания талантов в IT-компаниях" },
  { type: "Эссе",      title: "Свобода и ответственность в эпоху социальных сетей" },
  { type: "Реферат",   title: "Влияние пандемии COVID-19 на систему образования: дистанционное обучение" },
  { type: "Курсовая",  title: "Методы оценки инвестиционной привлекательности региона" },
  { type: "ВКР",       title: "Проектирование RESTful API для системы управления складом" },
  { type: "Доклад",    title: "Современные тенденции в архитектуре: биомиметика и зелёное строительство" },
  { type: "Реферат",   title: "Роль НАТО в системе европейской безопасности после 2022 года" },
  { type: "Курсовая",  title: "Психологические механизмы формирования зависимости от смартфона у подростков" },
  { type: "Сочинение", title: "Мечта и реальность в романе Булгакова «Мастер и Маргарита»" },
  { type: "ВКР",       title: "Управление проектами в условиях неопределённости: методология Agile vs Waterfall" },
  { type: "Реферат",   title: "Нанотехнологии в медицине: адресная доставка лекарственных препаратов" },
  { type: "Курсовая",  title: "Трансформация рынка труда под влиянием автоматизации и робототехники" },
  { type: "Эссе",      title: "Право на забвение в цифровую эпоху: между приватностью и историей" },
  { type: "Реферат",   title: "Экономика совместного потребления: Airbnb, Uber и будущее собственности" },
  { type: "ВКР",       title: "Финансовая устойчивость страховых компаний: методы оценки и управления" },
  { type: "Курсовая",  title: "Развитие электронного правительства в России: достижения и барьеры" },
  { type: "Доклад",    title: "Революция в хранении энергии: твердотельные аккумуляторы" },
  { type: "Сочинение", title: "Война и её цена в повести Быкова «Сотников»" },
  { type: "Реферат",   title: "Психологические аспекты принятия решений: когнитивные искажения и их преодоление" },
  { type: "Курсовая",  title: "Международный туризм как фактор экономического развития малых городов России" },
  { type: "ВКР",       title: "Оценка кредитоспособности физических лиц методами машинного обучения" },
  { type: "Реферат",   title: "Правовой статус искусственного интеллекта: субъект или объект права?" },
  { type: "Эссе",      title: "Одиночество как феномен современного общества потребления" },
];

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type DisplayWork = {
  id: string;
  workType: string;
  topic: string;
  minutesAgo: number;
  isNew: boolean;
};

type RecentWorkItem = {
  id: string;
  workType: string;
  topic: string;
  slug: string;
  authorLabel: string;
};

function buildInitialWorks(pool: typeof MOCK_WORKS_POOL): DisplayWork[] {
  return shuffleArray(pool).slice(0, 4).map((w, i) => ({
    id: `mock-${i}-${Date.now()}`,
    workType: w.type,
    topic: w.title,
    minutesAgo: 2 + Math.floor(Math.random() * 53),
    isNew: false,
  }));
}

const WORK_TYPE_COLORS: Record<string, string> = {
  "Сочинение": "#1B3A6B",
  "Эссе":      "#15305A",
  "Доклад":    "#0891B2",
  "Реферат":   "#1B3A6B",
  "Курсовая":  "#D97706",
  "ВКР":       "#DC2626",
};

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
  const [recentWorks, setRecentWorks]         = useState<RecentWorkItem[]>([]);
  const [displayedWorks, setDisplayedWorks]   = useState<DisplayWork[]>([]);
  const [usingRealWorks, setUsingRealWorks]   = useState(false);
  const poolRef                               = useRef<typeof MOCK_WORKS_POOL>([]);
  const poolCursorRef                         = useRef(0);
  const [faqOpen, setFaqOpen]                 = useState<number | null>(null);
  const [trialUsed, setTrialUsed]             = useState(false);
  const [worksCreated, setWorksCreated]       = useState(0);

  const heroRef             = useRef<HTMLElement>(null);
  const workTypesRef        = useRef<HTMLDivElement>(null);
  const workTypeElsRef      = useRef<Record<string, HTMLButtonElement | null>>({});
  const prevUserIdRef       = useRef<string | undefined>(undefined);
  const previewRedirectStarted = useRef(false);

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
    fetch("/api/generations/recent")
      .then(r => r.json())
      .then((data: unknown) => {
        if (!Array.isArray(data) || data.length < 1) return;
        const items = data.filter(
          (w): w is RecentWorkItem =>
            typeof w === "object" &&
            w !== null &&
            typeof (w as RecentWorkItem).slug === "string" &&
            (w as RecentWorkItem).slug.length > 0,
        );
        if (items.length >= 1) {
          setRecentWorks(items);
          setUsingRealWorks(true);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const shuffled = shuffleArray(MOCK_WORKS_POOL);
    poolRef.current = shuffled;
    poolCursorRef.current = 4;
    setDisplayedWorks(buildInitialWorks(shuffled));
  }, []);

  useEffect(() => {
    if (usingRealWorks) return;
    const t = setInterval(() => {
      const pool = poolRef.current;
      if (!pool.length) return;
      const idx  = poolCursorRef.current % pool.length;
      const next = pool[idx];
      poolCursorRef.current = idx + 1;
      const newCard: DisplayWork = {
        id: `mock-${idx}-${Date.now()}`,
        workType: next.type,
        topic: next.title,
        minutesAgo: 0,
        isNew: true,
      };
      setDisplayedWorks(prev => [newCard, ...prev.slice(0, 3)]);
      setTimeout(() => {
        setDisplayedWorks(prev => prev.map(w => w.id === newCard.id ? { ...w, isNew: false } : w));
      }, 8_000);
    }, 5 * 60_000);
    return () => clearInterval(t);
  }, [usingRealWorks]);

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
  }, [displayedWorks.length, recentWorks.length]);

  const pageRange = workType ? WORK_PAGES[workType] : undefined;

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };

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

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(websiteJsonLd) }} />

      <section ref={heroRef} id="generator" className={styles.hero}>
        <div className={styles.heroInner}>

          <div className={styles.heroOrb} aria-hidden />

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
              {workType ? (
                <>
                  {getHeroTitle(workType).replace(" с помощью нейросети", "")}
                  <span className={styles.heroAccent}> с помощью нейросети</span>
                </>
              ) : (
                <>
                  Учебные работы с&nbsp;оформлением{" "}
                  <span className={styles.heroAccent}>по&nbsp;ГОСТ</span>
                </>
              )}
            </h1>

            {worksCreated > 0 && (
              <p className={styles.heroWorksStat}>{formatWorksCreatedLabel(worksCreated)}</p>
            )}
          </div>

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
            <div ref={workTypesRef} className={styles.workTypes}>
              {isAdmin && (
                <button
                  key="Тест"
                  ref={(el) => { workTypeElsRef.current["Тест"] = el; }}
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
                      disabled={submitting}
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
                      : "Посмотреть превью"}
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
      </section>

      <section id="how-it-works" className={styles.stepsSection} aria-labelledby="how-it-works-title">
        <div className={styles.stepsSectionInner}>
          <header className={styles.stepsHead} data-reveal>
            <p className={styles.stepsEyebrow}>Как это работает</p>
            <h2 id="how-it-works-title" className={styles.stepsTitle}>
              Три шага до готового Word
            </h2>
            <p className={styles.stepsLead}>
              Сначала превью — оплата только за полный текст
            </p>
          </header>

          <ol className={styles.stepsList}>
            {HOW_STEPS.map((step, i) => (
              <li
                key={step.title}
                className={styles.stepsListItem}
                data-reveal
                data-delay={String(i + 1)}
              >
                <div className={styles.stepsListMarker} aria-hidden>
                  <span className={styles.stepsListNum}>{String(i + 1).padStart(2, "0")}</span>
                  <span className={styles.stepsListIcon} data-step-icon>
                    {STEP_ICONS[i]}
                  </span>
                </div>
                <div className={styles.stepsListBody}>
                  <h3 className={styles.stepsListTitle}>{step.title}</h3>
                  <p className={styles.stepsListText}>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className={styles.stepsFeatures} data-reveal data-delay="4">
            {HOW_FEATURES.map((label) => (
              <span key={label} className={styles.stepsFeature}>
                {label}
              </span>
            ))}
          </div>

          <div className={styles.stepsCtaWrap} data-reveal data-delay="5">
            <a href="#generator" className={styles.stepsCta}>
              Перейти к генератору
              <span className={styles.stepsCtaIcon} aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </a>
          </div>
        </div>
      </section>

      <section id="chatgpt-compare" className={styles.compareSection}>
        <div className={styles.compareInner}>
          <div className={styles.compareHead} data-reveal>
            <p className={styles.compareEyebrow}>Сравнение</p>
            <h2 className={styles.compareHeading}>
              Обычный ИИ vs <span className={styles.compareAccent}>Refai</span>
            </h2>
            <p className={styles.compareSub}>
              ChatGPT и DeepSeek сильны в диалоге и черновике. Refai — когда нужен готовый файл к сдаче
            </p>
          </div>
          <div className={styles.compareTable} data-reveal data-delay="1">
            <div className={styles.compareHeader}>
              <div className={`${styles.compareHeaderCell} ${styles.compareHeaderCriterion}`}>
                Критерий
              </div>
              <div className={`${styles.compareHeaderCell} ${styles.compareHeaderAiDesktop}`}>
                <img src="/compare-chatgpt.png" alt="ChatGPT" className={styles.compareLogo} width={88} height={28} />
              </div>
              <div className={`${styles.compareHeaderCell} ${styles.compareHeaderAiDesktop}`}>
                <img src="/compare-deepseek.png" alt="DeepSeek" className={styles.compareLogo} width={88} height={28} />
              </div>
              <div
                className={`${styles.compareHeaderCell} ${styles.compareHeaderAiMobile}`}
                aria-label="ChatGPT и DeepSeek"
              >
                <div className={styles.compareAiLogos}>
                  <img src="/compare-chatgpt.png" alt="ChatGPT" className={styles.compareLogo} width={72} height={24} />
                  <img src="/compare-deepseek.png" alt="DeepSeek" className={styles.compareLogo} width={72} height={24} />
                </div>
              </div>
              <div className={`${styles.compareHeaderCell} ${styles.compareHeaderRefai}`}>
                <img src="/compare-refai.png" alt="Refai" className={styles.compareLogo} width={88} height={28} />
              </div>
            </div>
            {AI_COMPARE_ROWS.map((row, i) => (
              <div key={row.label} className={styles.compareRow} data-reveal data-delay={String(i + 2)}>
                <div className={styles.compareRowLabel}>{row.label}</div>
                <CompareAiCell text={row.generic} tone={row.aiTone} />
                <CompareAiCell
                  text={row.generic}
                  tone={row.aiTone}
                  className={styles.compareRowBadDesktop}
                />
                <div className={styles.compareRowGood}>
                  <CompareMarkIcon kind="yes" />
                  <span className={styles.compareCellText}>{row.refai}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ExamplesSection onCreateFromExample={goToGeneratorFromExample} />

      <section className={styles.whySection}>
        <div className={styles.whySectionInner}>
          <div className={styles.whyHead}>
            <p className={styles.whyEyebrow}>Почему Refai</p>
            <h2 className={styles.whySectionTitle}>
              Цифры, а <span className={styles.whyAccent}>не обещания</span>
            </h2>
          </div>
          <dl className={styles.whyStrip}>
            {WHY_FEATURES.map((f, i) => (
              <div key={f.label} className={styles.whyItem} data-reveal data-delay={String(i + 1)}>
                <div className={styles.whyItemIcon}>{WHY_ICONS[f.label]}</div>
                <dt className={styles.whyItemLabel}>{f.label}</dt>
                <dd className={styles.whyItemValue}>{f.value}</dd>
                <dd className={styles.whyItemNote}>{f.note}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className={styles.recentSection}>
        <div className={styles.recentInner}>
          <div className={styles.recentHeadRow}>
            <div>
              <h2 className={styles.recentHeading}>
                Последние <span className={styles.recentAccent}>проекты</span>
              </h2>
              <p className={styles.recentSubline}>
                {usingRealWorks ? (
                  <>Реальные работы пользователей Refai</>
                ) : (
                  <>Более <strong>1 000 работ</strong> уже сгенерировано</>
                )}
              </p>
            </div>
          </div>
          <div className={styles.recentGrid}>
            {(usingRealWorks
              ? recentWorks.slice(0, 4)
              : displayedWorks
            ).map((w) => {
              const isReal = usingRealWorks;
              const real = isReal ? (w as RecentWorkItem) : null;
              const mock = !isReal ? (w as DisplayWork) : null;
              const cardWorkType = real?.workType ?? mock!.workType;
              const cardTopic = real?.topic ?? mock!.topic;
              const isNew = mock?.isNew ?? false;
              const typeColor = WORK_TYPE_COLORS[cardWorkType] || "#1B3A6B";
              const cardClass = `${styles.recentCard} ${isNew ? styles.recentCardNew : ""}`;

              const inner = (
                <>
                  <div className={styles.recentCardTop}>
                    <span className={styles.recentBadge} style={{ color: typeColor }}>{cardWorkType}</span>
                    {isNew && <span className={styles.recentNewDot} aria-hidden />}
                  </div>
                  {real?.authorLabel && (
                    <p className={styles.recentAuthor}>{real.authorLabel}</p>
                  )}
                  <p className={styles.recentWorkTitle}>{cardTopic}</p>
                </>
              );

              if (real?.slug) {
                return (
                  <Link
                    key={real.id}
                    href={`/preview/${real.slug}`}
                    className={`${cardClass} ${styles.recentCardLink}`}
                  >
                    {inner}
                  </Link>
                );
              }

              return (
                <div key={mock!.id} className={cardClass}>
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className={styles.faqSection}>
        <div className={styles.faqInner}>
          <h2 className={styles.faqHeading}>
            Часто задаваемые <span className={styles.faqAccent}>вопросы</span>
          </h2>
          <div className={styles.faqGrid}>
            {FAQ.map((item, i) => {
              const isOpen = faqOpen === i;
              return (
                <div
                  key={i}
                  className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ""}`}
                  data-reveal
                  data-delay={String((i % 4) + 1)}
                >
                  <button
                    className={styles.faqQ}
                    onClick={() => setFaqOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    type="button"
                  >
                    <span>{item.q}</span>
                    <svg
                      className={styles.faqIcon}
                      width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                      style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s cubic-bezier(0.22,1,0.36,1)" }}
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  <div className={`${styles.faqBody} ${isOpen ? styles.faqBodyOpen : ""}`}>
                    <p className={styles.faqA}>{item.a}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

    </main>
  );
}
