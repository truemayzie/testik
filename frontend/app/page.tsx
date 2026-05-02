"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TypewriterInput from "./components/TypewriterInput";
import PaymentWidget from "./components/PaymentWidget";
import ExamplesSection from "./components/ExamplesSection";
import { WORK_PRICES, WORK_PAGES } from "../lib/prices";
import { writeGenState, patchGenState, clearGenState, readGenState } from "./lib/genState";
import { getProgressSteps, type Step } from "./lib/progressSteps";
import { useModalContext } from "./lib/ModalContext";
import { useModalA11y } from "./lib/useModalA11y";
import { trackWorkActivityClient } from "@/app/lib/trackWorkActivity";
import { safeJsonLd } from "@/lib/safeJsonLd";
import styles from "./page.module.css";
import PresentationViewer, { type Slide } from "./components/PresentationViewer";

type ReferatResult = {
  title: string;
  structure: string[];
  content: Record<string, string>;
  sources: string[];
  meta: Record<string, string | number>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile?: Record<string, any>;
};

const GENERATE_MAX_WAIT_MS = 25 * 60 * 1000;
const GENERATE_POLL_MS = 5_000;

type TitleForm = {
  fullName: string;
  university: string;
  faculty: string;
  department: string;
  groupNumber: string;
  teacherName: string;
  city: string;
  speciality: string;
  discipline: string;
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

// ── Состояние extras-генерации (живёт между навигациями, как _gen) ───────────
type ExtrasCb = (ready: string[], error: string) => void;
const _extras = (() => {
  let _jobId: string | null   = null;
  let _done  = false;
  let _ready: string[]        = [];
  let _err   = "";
  const _cbs: ExtrasCb[]      = [];
  return {
    get active() { return !!_jobId && !_done; },
    get jobId()  { return _jobId; },
    get done()   { return _done; },
    get ready()  { return _ready; },
    start(jobId: string) { _jobId = jobId; _done = false; _ready = []; _err = ""; },
    resolve(ready: string[], err: string) {
      _done = true; _ready = ready; _err = err;
      _cbs.splice(0).forEach(cb => cb(ready, err));
    },
    listen(cb: ExtrasCb) {
      if (_done || !_jobId) { cb(_ready, _err); return; }
      _cbs.push(cb);
    },
    clear() { _jobId = null; _done = false; _ready = []; _err = ""; },
  };
})();

// Флаг: поллинг extras уже запущен (один на весь модуль — не дублируется при ремонте)
let _extrasPollingStarted = false;
// ID генерации (для записи extras в БД после завершения)
let _extrasGenId: string | null = null;
// JSON-структура слайдов (получена при поллинге extras)
let _extrasSlides: { accent: string; slides: unknown[] } | null = null;
// Pending extras items от предварительного выбора в форме (до оплаты)
let _pendingExtrasItems: string[] | null = null;

// Сортировка по возрастанию страниц: Сочинение < Эссе < Доклад < Реферат < Курсовая < ВКР
const WORK_TYPES = ["Сочинение", "Эссе", "Доклад", "Реферат", "Курсовая", "ВКР"];

const WHY_FEATURES = [
  { label: "Скорость",       value: "2–4 минуты",          note: "Готово быстрее, чем вы додумаете структуру сами" },
  { label: "Простота",       value: "Только тема",          note: "Структуру и источники находит ИИ — вы просто ждёте" },
  { label: "Цена",           value: "от 99 ₽",              note: "Без подписки — платите за каждую работу отдельно" },
  { label: "Доп. материалы", value: "Презентация + доклад", note: "Добавьте слайды и текст выступления после генерации" },
  { label: "Везде",          value: "Любой браузер",        note: "Со смартфона или компьютера, без установки" },
];

// SVG-иконки для WHY_FEATURES (amber, 18×18)
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

// SVG-иконки для шагов
const STEP_ICONS = [
  // 01: Ввести тему — карандаш
  <svg key="edit" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>,
  // 02: ИИ пишет — cpu/chip
  <svg key="cpu" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>
  </svg>,
  // 03: Скачать — download
  <svg key="download" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>,
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

// ── Пул из 50 работ для имитации живой ленты ─────────────────────────────────
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

// Fisher-Yates shuffle
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getDailyGenCount(): number {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  let target: number;
  if (h < 8)       target = Math.round(h * 3);
  else if (h < 13) target = Math.round(24 + (h - 8) * 18);
  else if (h < 20) target = Math.round(114 + (h - 13) * 14);
  else             target = Math.round(212 + (h - 20) * 10);
  const jitter = Math.floor((Math.random() - 0.5) * 6);
  return Math.max(0, target + jitter);
}

function timeAgo(minutesAgo: number): string {
  if (minutesAgo < 1) return "только что";
  if (minutesAgo < 60) return `${minutesAgo} мин. назад`;
  const h = Math.floor(minutesAgo / 60);
  if (h < 24) return `${h} ч. назад`;
  return `${Math.floor(h / 24)} дн. назад`;
}

type DisplayWork = {
  id: string;
  workType: string;
  topic: string;
  minutesAgo: number;
  isNew: boolean;
};

function buildInitialWorks(pool: typeof MOCK_WORKS_POOL): DisplayWork[] {
  return shuffleArray(pool).slice(0, 8).map((w, i) => ({
    id: `mock-${i}-${Date.now()}`,
    workType: w.type,
    topic: w.title,
    minutesAgo: 2 + Math.floor(Math.random() * 53), // 2–55 мин назад
    isNew: false,
  }));
}

const MOCK_RECENT = [
  { id: "1", workType: "ВКР",       topic: "Разработка системы мониторинга качества ПО на основе машинного обучения",           createdAt: "2026-03-31T10:12:00Z" },
  { id: "2", workType: "Курсовая",  topic: "Рынок электромобилей в России: тенденции и перспективы 2025–2030",                  createdAt: "2026-03-31T08:47:00Z" },
  { id: "3", workType: "Реферат",   topic: "Нейропластичность мозга: как обучение изменяет структуру нейронных связей",         createdAt: "2026-03-30T22:30:00Z" },
  { id: "4", workType: "Эссе",      topic: "Человек и машина: этические вызовы искусственного интеллекта в XXI веке",           createdAt: "2026-03-30T19:15:00Z" },
  { id: "5", workType: "Доклад",    topic: "Квантовые вычисления: принципы работы и практические применения сегодня",            createdAt: "2026-03-30T16:40:00Z" },
  { id: "6", workType: "Курсовая",  topic: "Психологические методы управления стрессом у студентов в период сессии",            createdAt: "2026-03-30T13:22:00Z" },
  { id: "7", workType: "Реферат",   topic: "Экологические последствия таяния арктических льдов для мировой экономики",          createdAt: "2026-03-30T09:55:00Z" },
  { id: "8", workType: "Сочинение", topic: "Образ маленького человека в русской литературе XIX века: от Гоголя до Достоевского", createdAt: "2026-03-29T21:18:00Z" },
];

const WORK_TYPE_COLORS: Record<string, string> = {
  "Сочинение": "#1B3A6B",
  "Эссе":      "#15305A",
  "Доклад":    "#0891B2",
  "Реферат":   "#1B3A6B",
  "Курсовая":  "#D97706",
  "ВКР":       "#DC2626",
};

const WORK_TYPE_ICONS: Record<string, string> = {
  "Сочинение": "✍️",
  "Эссе":      "📝",
  "Доклад":    "📋",
  "Реферат":   "📄",
  "Курсовая":  "📚",
  "ВКР":       "🎓",
};

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
  const { data: session, status: sessionStatus } = useSession();
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
  const [error, setError]                     = useState<{ message: string; status: number } | null>(null);
  const [activeSection, setActiveSection]     = useState("");
  const [downloading, setDownloading]         = useState(false);
  const [previewLoading, setPreviewLoading]   = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [modalClosing, setModalClosing]       = useState(false);
  const { setModalOpen }                      = useModalContext();
  const wantPresentation = false;
  const wantSpeech       = false;
  const [presentationSel, setPresentationSel]   = useState(false);
  const [speechSel, setSpeechSel]               = useState(false);
  const [extrasJobId, setExtrasJobId]         = useState<string | null>(null);
  const [extrasGenerating, setExtrasGenerating] = useState(false);
  const [extrasReady, setExtrasReady]         = useState<string[]>([]);
  const [extrasError, setExtrasError]         = useState<string | null>(null);
  const [generationId, setGenerationId]       = useState<string | null>(null);
  const [generationSlug, setGenerationSlug]   = useState<string | null>(null);
  const extrasProgressRef                     = useRef<number>(0);
  const [extrasProgress, setExtrasProgress]   = useState(0);
  const [modalTab, setModalTab]               = useState<"work" | "presentation">("work");
  const [slidesData, setSlidesData]           = useState<{ accent: string; slides: unknown[] } | null>(null);
  const [presentationImages, setPresentationImages] = useState<Record<number, string>>({});
  const [downloadingPptx, setDownloadingPptx] = useState(false);
  const [titleForm, setTitleForm]             = useState<TitleForm>({ fullName: "", university: "", faculty: "", department: "", groupNumber: "", teacherName: "", city: "", speciality: "", discipline: "" });
  const [titleUpdating, setTitleUpdating]     = useState(false);
  const [saveProfile, setSaveProfile]         = useState(false);
  const [skipFaculty, setSkipFaculty]         = useState(false);
  const [skipSpeciality, setSkipSpeciality]   = useState(false);
  const [skipDiscipline, setSkipDiscipline]   = useState(false);
  const [showTitleModal, setShowTitleModal]   = useState(false);
  const previewContainerRef                   = useRef<HTMLDivElement>(null);
  const baseScaleRef                          = useRef<number>(1);
  const resultModalRef                        = useRef<HTMLDivElement>(null);
  const resultModalCloseRef                   = useRef<HTMLButtonElement>(null);
  const [previewZoom, setPreviewZoom]         = useState(1);
  const [bannerDismissed, setBannerDismissed] = useState(true); // true пока не проверили
  const [profileFilled, setProfileFilled]     = useState(true); // true пока не проверили
  const [recentWorks, setRecentWorks]         = useState(MOCK_RECENT);
  const [showAllWorks, setShowAllWorks]       = useState(false);
  const [displayedWorks, setDisplayedWorks]   = useState<DisplayWork[]>([]);
  const [usingRealWorks, setUsingRealWorks]   = useState(false);
  const poolRef                               = useRef<typeof MOCK_WORKS_POOL>([]);
  const poolCursorRef                         = useRef(0);
  /** Не вызывать getDailyGenCount в useState: там есть Math.random() → разный HTML на SSR и при гидрации. */
  const [dailyCount, setDailyCount]           = useState(0);
  const [faqOpen, setFaqOpen]                 = useState<number | null>(null);
  const [trialUsed, setTrialUsed]             = useState(false);
  const [f5Recovery, setF5Recovery]           = useState(false);
  const [paymentLoading, setPaymentLoading]   = useState(false);
  type PaymentWidgetData = { workType: string; extras: string[] };
  const [paymentWidgetData, setPaymentWidgetData] = useState<PaymentWidgetData | null>(null);
  const [capacityError, setCapacityError]     = useState<string[] | null>(null); // null = нет ошибки, [] = всё занято, [...] = доступные типы

  // Прогресс
  const [stepIndex, setStepIndex]       = useState(0);

  const [totalProgress, setTotalProgress] = useState(0);
  const [dots, setDots] = useState(".");

  const [factIndex, setFactIndex]   = useState(0);
  const [factVisible, setFactVisible] = useState(true);
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= 768
  );

  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepsRef        = useRef<Step[]>(getProgressSteps("Реферат"));
  const autoStarted     = useRef(false); // защита от двойного запуска (React Strict Mode)
  const f5InfoRef       = useRef<{ workType: string; startedAt: number }>({ workType: "Реферат", startedAt: 0 });
  const isUnloadingRef  = useRef(false); // флаг F5 / ухода со страницы
  const loadingRef      = useRef(false);  // актуальное значение loading для beforeunload
  const currentGenRef   = useRef<{ topic: string; pages: number; workType: string; startedAt: number } | null>(null);
  const heroRef             = useRef<HTMLElement>(null);
  const progressSectionRef  = useRef<HTMLElement>(null);

  useEffect(() => {
    const updateViewport = () => setIsMobileViewport(window.innerWidth <= 768);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  // После старта генерации прокручиваем к прогресс-бару (мобилки не видят его под hero)
  useEffect(() => {
    if (!loading) return;
    const id = requestAnimationFrame(() => {
      setTimeout(() => {
        progressSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block:    "center",
          inline:   "nearest",
        });
      }, 80);
    });
    return () => cancelAnimationFrame(id);
  }, [loading]);

  function selectWorkType(type: string) {
    setWorkType(type);
    setPages(WORK_PAGES[type]?.default ?? 20);
    stepsRef.current = getProgressSteps(type);
    setResult(null);
    setError(null);
    setCapacityError(null);
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

  async function persistProfile() {
    if (!saveProfile || !session?.user) return;
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(titleForm),
      });
    } catch {}
  }

  function buildProfilePayload() {
    return { ...titleForm, skipFaculty, skipSpeciality, skipDiscipline };
  }

  async function handleDownload() {
    if (!result) return;
    persistProfile();
    setDownloading(true);
    const downloadData = { ...result, profile: { ...(result.profile ?? {}), ...buildProfilePayload() } };
    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...downloadData,
          _activity: {
            action: "DOCX_DOWNLOAD",
            source: "home",
            generationId,
            slug: generationSlug,
            workType,
          },
        }),
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

  // Сброс состояния генерации при смене пользователя
  const prevUserIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (sessionStatus === "loading") return;
    const userId = (session?.user as { id?: string } | null)?.id;
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
      _gen.cancel();
      clearGenState();
      sessionStorage.removeItem("activeGeneration");
      sessionStorage.removeItem("pendingGeneration");
      setLoading(false);
      setResult(null);
      setError(null);
    }
    prevUserIdRef.current = userId;
  }, [session, sessionStatus]);

  useEffect(() => {
    if (result) {
      setShowResultModal(true);
      setPresentationSel(false);
      setSpeechSel(false);
      setTitleForm({
        fullName:    String(result.profile?.fullName    ?? ""),
        university:  String(result.profile?.university  ?? ""),
        faculty:     String(result.profile?.faculty     ?? ""),
        department:  String(result.profile?.department  ?? ""),
        groupNumber: String(result.profile?.groupNumber ?? ""),
        teacherName: String(result.profile?.teacherName ?? ""),
        city:        String(result.profile?.city        ?? ""),
        speciality:  String(result.profile?.speciality  ?? ""),
        discipline:  String(result.profile?.discipline  ?? ""),
      });
    }
  }, [result]);

  // Инициализируем slidesData когда презентация готова
  useEffect(() => {
    if (_extrasSlides && extrasReady.includes("presentation") && !slidesData) {
      setSlidesData(_extrasSlides as { accent: string; slides: unknown[] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extrasReady]);

  // Синхронизируем titleForm → TITLE слайд в slidesData
  // Срабатывает при изменении любого поля формы И при переключении на таб презентации
  useEffect(() => {
    const data = slidesData ?? (_extrasSlides && extrasReady.includes("presentation") ? _extrasSlides as { accent: string; slides: unknown[] } : null);
    if (!data) return;
    const slides = data.slides as Slide[];
    const idx = slides.findIndex((s: Slide) => s.type === "TITLE");
    if (idx < 0) return;
    const updated = slides.map((s: Slide, i: number) => i === idx ? {
      ...s,
      university:  titleForm.university  || "",
      faculty:     titleForm.faculty     || "",
      department:  titleForm.department  || "",
      full_name:   titleForm.fullName    || "",
      group:       titleForm.groupNumber || "",
      teacher:     titleForm.teacherName || "",
      city:        titleForm.city        || "",
    } : s);
    setSlidesData(() => ({ ...data, slides: updated }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleForm, modalTab, extrasReady]);

  const DOC_WIDTH = 816; // стандартная ширина A4-страницы в docx-preview

  // Применяет transform: scale к контейнеру и схлопывает лишнее пространство
  function applyScale(container: HTMLElement, scale: number) {
    container.style.setProperty("--docx-scale", String(scale));
    if (scale < 1) {
      const w = DOC_WIDTH;
      const h = container.scrollHeight;
      container.style.transform = `scale(${scale})`;
      container.style.transformOrigin = "top center";
      container.style.marginBottom = `${Math.round(h * scale - h)}px`;
      // Центрируем контейнер внутри родителя
      container.style.position = "relative";
      container.style.left = "50%";
      container.style.marginLeft = `-${w / 2}px`;
    } else {
      container.style.transform = "";
      container.style.transformOrigin = "";
      container.style.marginBottom = "";
      container.style.position = "";
      container.style.left = "";
      container.style.marginLeft = "";
    }
  }

  // Рендер превью — вызывается и при открытии модала, и при обновлении титульника
  async function renderPreview(data: ReferatResult) {
    const container = previewContainerRef.current;
    if (!container) return;

    // Сбрасываем предыдущий рендер
    container.innerHTML = "";
    container.style.transform    = "";
    container.style.marginBottom = "";

    // Читаем целевую ширину ДО фиксации контейнера.
    // Math.min с window.innerWidth защищает от случаев когда parentElement.clientWidth
    // шире viewport (скроллбар, overflow и т.п.) — особенно актуально на мобилке.
    const targetWidth = container.parentElement?.clientWidth
      ? Math.min(container.parentElement.clientWidth, window.innerWidth)
      : window.innerWidth;
    const isDesktop = targetWidth >= DOC_WIDTH;

    // ignoreWidth: false на всех устройствах — документ рендерится в нативной ширине
    // (816px для A4 при 96dpi). Это единственный способ получить корректные
    // tab stops и точки-лидеры в оглавлении. Затем масштабируем через CSS transform.
    container.style.width = `${DOC_WIDTH}px`;

    setPreviewLoading(true);
    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const { renderAsync } = await import("docx-preview");

      await renderAsync(blob, container, undefined, {
        className: "docx-preview",
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        experimental: true,
      });

      // experimental=true запускает refreshTabStops через setTimeout(500мс).
      // Применяем scale только ПОСЛЕ него — иначе dot-leader расчёт ломается.
      await new Promise<void>(r => setTimeout(r, 600));
      const base = Math.min(1, targetWidth / DOC_WIDTH);
      baseScaleRef.current = base;
      setPreviewZoom(1);
      applyScale(container, base);
    } catch (e) {
      console.error("[Preview] Error:", e);
    } finally {
      setPreviewLoading(false);
    }
  }

  // Применяем масштаб когда пользователь нажимает +/−
  function applyZoom(delta: number) {
    const container = previewContainerRef.current;
    if (!container) return;
    const next = Math.min(2, Math.max(0.3, previewZoom + delta));
    setPreviewZoom(next);
    applyScale(container, baseScaleRef.current * next);
  }

  function closeResultModal() {
    setModalClosing(true);
    setTimeout(() => {
      setShowResultModal(false);
      setModalClosing(false);
    }, 200);
  }

  useModalA11y({
    active: !!(result && showResultModal) && !showTitleModal,
    containerRef: resultModalRef,
    initialFocusRef: resultModalCloseRef,
    onClose: closeResultModal,
  });

  // Блокируем скролл фона когда модал открыт.
  // position:fixed надёжнее overflow:hidden на iOS Safari.
  useEffect(() => {
    if (showResultModal) {
      const y = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top      = `-${y}px`;
      document.body.style.width    = "100%";
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      document.body.classList.add("modal-open");
      setModalOpen(true);
    } else {
      const y = parseInt(document.body.style.top || "0") * -1;
      document.body.style.position = "";
      document.body.style.top      = "";
      document.body.style.width    = "";
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      document.body.classList.remove("modal-open");
      setModalOpen(false);
      if (y) window.scrollTo(0, y);
    }
    return () => {
      const y = parseInt(document.body.style.top || "0") * -1;
      document.body.style.position = "";
      document.body.style.top      = "";
      document.body.style.width    = "";
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      document.body.classList.remove("modal-open");
      setModalOpen(false);
      if (y) window.scrollTo(0, y);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showResultModal]);

  // Запускаем превью когда модал открылся (showResultModal гарантирует что ref доступен)
  useEffect(() => {
    if (!result || !showResultModal) return;
    renderPreview(result);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showResultModal]);

  // При открытии модалки — загружаем профиль и заполняем поля титульника
  useEffect(() => {
    if (!showResultModal || !session?.user) return;
    fetch("/api/profile")
      .then(r => r.json())
      .then((data: Record<string, string>) => {
        const hasData = !!(data.fullName || data.university || data.groupNumber);
        setSaveProfile(hasData);
        setTitleForm(prev => ({
          fullName:    data.fullName    || prev.fullName    || "",
          university:  data.university  || prev.university  || "",
          faculty:     data.faculty     || prev.faculty     || "",
          department:  data.department  || prev.department  || "",
          groupNumber: data.groupNumber || prev.groupNumber || "",
          teacherName: data.teacherName || prev.teacherName || "",
          city:        data.city        || prev.city        || "",
          speciality:  data.speciality  || prev.speciality  || "",
          discipline:  data.discipline  || prev.discipline  || "",
        }));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showResultModal]);

  async function handleTitleUpdate() {
    if (!result) return;
    setTitleUpdating(true);
    persistProfile();
    const updated: ReferatResult = { ...result, profile: { ...(result.profile ?? {}), ...buildProfilePayload() } };
    await renderPreview(updated);
    // Синхронизируем TITLE слайд в презентации
    setSlidesData(prev => {
      const data = prev ?? (_extrasSlides as { accent: string; slides: unknown[] } | null);
      if (!data) return prev;
      const slides = data.slides as Slide[];
      const idx = slides.findIndex((s: Slide) => s.type === "TITLE");
      if (idx < 0) return prev;
      const newSlides = slides.map((s: Slide, i: number) => i === idx ? {
        ...s,
        university: titleForm.university || "",
        faculty:    titleForm.faculty    || "",
        department: titleForm.department || "",
        full_name:  titleForm.fullName   || "",
        group:      titleForm.groupNumber|| "",
        teacher:    titleForm.teacherName|| "",
        city:       titleForm.city       || "",
      } : s);
      return { ...data, slides: newSlides };
    });
    setTitleUpdating(false);
  }

  async function runGeneration(t: string, p: number, wt: string) {
    stepsRef.current = getProgressSteps(wt);

    // Регистрируем генерацию в модульном состоянии (для восстановления при навигации)
    _gen.start(t, p, wt);
    currentGenRef.current = { topic: t, pages: p, workType: wt, startedAt: _gen.startedAt };
    writeGenState({ active: true, percent: 0, stepLabel: stepsRef.current[0]?.label ?? "", workType: wt, topic: t, pages: p, startedAt: _gen.startedAt });
    sessionStorage.setItem("activeGeneration", JSON.stringify({ topic: t, pages: p, workType: wt, startedAt: _gen.startedAt }));

    setLoading(true);
    setError(null);
    setResult(null);
    setGenerationId(null);
    setGenerationSlug(null);
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
      if (!response.ok) {
        stopProgress();
        if (response.status === 401) {
          const errMsg = "Нужно войти в аккаунт, чтобы запустить генерацию.";
          _gen.resolve(null, errMsg);
          setError({ message: errMsg, status: 401 });
          router.push("/auth/signin");
          return;
        }
        if (data.code === "PAYMENT_REQUIRED") {
          _gen.cancel();
          clearGenState();
          sessionStorage.setItem("pendingGeneration", JSON.stringify({ topic: t, pages: p, workType: wt }));
          router.push(`/payment?workType=${encodeURIComponent(wt)}`);
          return;
        }
        if (response.status === 403) {
          const errMsg = data.error || "Для генерации нужна оплата или доступ к выбранному типу работы.";
          _gen.resolve(null, errMsg);
          setError({ message: errMsg, status: 403 });
          return;
        }
        if (data.code === "SAVED") {
          // Соединение прервалось, но работа сохранена — направляем в Мои работы
          const errMsg = "Соединение прервалось, но работа сохранена. Найдите её в разделе «Мои работы».";
          _gen.resolve(null, errMsg);
          setError({ message: errMsg, status: response.status });
          return;
        }
        const errMsg = data.error || "Произошла ошибка";
        _gen.resolve(null, errMsg);
        setError({ message: errMsg, status: response.status });
      } else {
        const deadline = Date.now() + GENERATE_MAX_WAIT_MS;
        while (Date.now() < deadline) {
          const pollRes = await fetch(
            `/api/generate/poll?workType=${encodeURIComponent(wt)}&startedAt=${_gen.startedAt}&includeResult=1`,
            { cache: "no-store" }
          );
          const pollData = await pollRes.json();

          if (pollData.status === "done" && pollData.result) {
            stopProgress();
            const resultData = pollData.result as ReferatResult;
            if (pollData.id) { setGenerationId(pollData.id); _extrasGenId = pollData.id; }
            if (pollData.slug) setGenerationSlug(String(pollData.slug));
            _gen.resolve(resultData, "");
            setResult(resultData);
            if (resultData.structure?.length > 0) setActiveSection(resultData.structure[0]);
            if (isYukassa) setTrialUsed(true);
            if (_pendingExtrasItems && _pendingExtrasItems.length > 0) {
              const items = [..._pendingExtrasItems];
              _pendingExtrasItems = null;
              setExtrasGenerating(true);
              setTimeout(() => triggerExtrasGeneration(items, resultData), 50);
            }
            return;
          }

          if (pollData.status === "error" || pollData.status === "not_found") {
            stopProgress();
            const errMsg = pollData.error || "Сервис сейчас перегружен. Попробуйте снова.";
            _gen.resolve(null, errMsg);
            setError({ message: errMsg, status: 503 });
            return;
          }

          await new Promise(r => setTimeout(r, GENERATE_POLL_MS));
        }

        stopProgress();
        const errMsg = "Превышено время ожидания (25 минут). Попробуйте снова.";
        _gen.resolve(null, errMsg);
        setError({ message: errMsg, status: 503 });
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
      setError({ message: errMsg, status: 0 });
    } finally {
      if (!isUnloadingRef.current) {
        currentGenRef.current = null;
        clearGenState();
        sessionStorage.removeItem("activeGeneration");
        setLoading(false);
      }
    }
  }

  async function triggerExtrasGeneration(items: string[], savedResult?: ReferatResult) {
    const src = savedResult ?? result;
    if (!src) return;
    _extras.clear();
    _extrasPollingStarted = false;
    setExtrasGenerating(true);
    setExtrasReady([]);
    setExtrasError(null);
    setExtrasJobId(null);
    try {
      const res = await fetch("/api/generate/extras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic:     src.title || topic,
          work_type: workType,
          items,
          result:    src,
          profile:   src.profile ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.extrasJobId) {
        setExtrasError(data.error || "Ошибка запуска генерации");
        setExtrasGenerating(false);
        return;
      }
      // Сохраняем в модульную переменную (живёт между навигациями)
      _extras.start(data.extrasJobId);
      setExtrasJobId(data.extrasJobId);
    } catch {
      setExtrasError("Сервер недоступен");
      setExtrasGenerating(false);
    }
  }

  async function handleExtrasPayment() {
    const items: string[] = [];
    if (presentationSel) items.push("presentation");
    if (speechSel) items.push("speech");
    if (!items.length) return;

    // Для администратора — бесплатно и без редиректа
    if (isAdmin) {
      triggerExtrasGeneration(items);
      return;
    }

    // Сохраняем result в sessionStorage на случай редиректа
    try {
      sessionStorage.setItem("pendingExtras", JSON.stringify({ result, workType, pages, topic, items }));
    } catch {}

    try {
      const res = await fetch("/api/payment/extras", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Ошибка создания платежа"); return; }

      if (data.autoSucceed) {
        // Dev режим — сразу генерируем
        sessionStorage.removeItem("pendingExtras");
        triggerExtrasGeneration(items);
      } else {
        // Редирект на ЮКассу
        window.location.href = data.paymentUrl;
      }
    } catch {
      alert("Не удалось создать платёж. Попробуйте снова.");
    }
  }

  async function downloadPresentation() {
    const data = slidesData || _extrasSlides;
    if (!data) { alert("Слайды ещё не готовы"); return; }
    setDownloadingPptx(true);
    try {
      const res = await fetch("/api/generate/presentation/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, images: presentationImages }),
      });
      if (!res.ok) throw new Error("bad response");
      const blob = await res.blob();
      trackWorkActivityClient({
        action: "PPTX_DOWNLOAD",
        source: "home",
        generationId,
        slug: generationSlug,
        workType,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "presentation.pptx";
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Ошибка скачивания, попробуйте снова");
    } finally {
      setDownloadingPptx(false);
    }
  }

  async function downloadSpeech() {
    if (!extrasJobId) return;
    try {
      const res = await fetch(`/api/download/speech/${extrasJobId}`);
      if (!res.ok) { alert("Файл недоступен"); return; }
      const blob = await res.blob();
      trackWorkActivityClient({
        action: "SPEECH_DOWNLOAD",
        source: "home",
        generationId,
        slug: generationSlug,
        workType,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "speech.docx";
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch { alert("Не удалось скачать файл."); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;

    setCapacityError(null);

    // Вычисляем items допматериалов
    const formExtrasItems: string[] = [];
    if (wantPresentation) formExtrasItems.push("presentation");
    if (wantSpeech) formExtrasItems.push("speech");

    // Проверяем доступность слотов на сервере
    try {
      const capRes = await fetch("/api/capacity");
      if (capRes.ok) {
        const capData = await capRes.json() as { used: number; max: number; available: string[] };
        const SLOTS: Record<string, number> = { "Сочинение": 1, "Эссе": 1, "Доклад": 2, "Реферат": 2, "Курсовая": 4, "ВКР": 5 };
        const needed = SLOTS[workType] ?? 2;
        if (capData.used + needed > capData.max) {
          setCapacityError(capData.available);
          return;
        }
      }
    } catch { /* при ошибке — пропускаем, бэкенд сам вернёт 503 */ }

    // Admin — генерация бесплатно
    if (isAdmin) {
      if (formExtrasItems.length > 0) _pendingExtrasItems = formExtrasItems;
      runGeneration(topic, pages, workType);
      return;
    }

    // Тестовый аккаунт ЮКасса — минуем проверку оплаты
    if (isYukassa) {
      if (trialUsed) return;
      if (formExtrasItems.length > 0) _pendingExtrasItems = formExtrasItems;
      runGeneration(topic, pages, workType);
      return;
    }

    // Проверяем оплату перед генерацией
    try {
      const checkRes = await fetch(`/api/payment/check?workType=${encodeURIComponent(workType)}`);
      if (checkRes.status === 401) {
        setError({ message: "Нужно войти в аккаунт, чтобы продолжить.", status: 401 });
        router.push("/auth/signin");
        return;
      }
      const checkData = await checkRes.json();
      if (!checkData.hasPaid) {
        sessionStorage.setItem("pendingGeneration", JSON.stringify({ topic, pages, workType }));
        if (formExtrasItems.length > 0) {
          sessionStorage.setItem("pendingExtrasChoice", JSON.stringify(formExtrasItems));
        }

        if (checkData.devMode) {
          // Dev-режим: YOKASSA_SHOP_ID не задан — создаём платёж сразу, без виджета
          setPaymentLoading(true);
          const devCheckRes = await fetch("/api/payment/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workType, extras: formExtrasItems.length > 0 ? formExtrasItems : undefined }),
          }).catch(() => null);
          setPaymentLoading(false);

          if (devCheckRes?.ok) {
            const devData = await devCheckRes.json();
            if (devData.paymentUrl) {
              // Dev-режим: платёж уже succeeded, сразу запускаем генерацию
              sessionStorage.removeItem("pendingGeneration");
              if (formExtrasItems.length > 0) {
                _pendingExtrasItems = formExtrasItems;
                sessionStorage.removeItem("pendingExtrasChoice");
              }
              runGeneration(topic, pages, workType);
              return;
            }
          }
        }

        // Prod: показываем виджет с выбором метода оплаты (payment/create вызывает сам виджет при выборе метода)
        setPaymentWidgetData({ workType, extras: formExtrasItems });
        return;
      }
    } catch {
      setError({ message: "Не удалось проверить статус оплаты", status: 0 });
      return;
    }

    if (formExtrasItems.length > 0) _pendingExtrasItems = formExtrasItems;
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
      .then(data => { if (Array.isArray(data) && data.length >= 30) { setRecentWorks(data); setUsingRealWorks(true); } })
      .catch(() => {});
  }, []);

  // Инициализация пула мок-работ
  useEffect(() => {
    const shuffled = shuffleArray(MOCK_WORKS_POOL);
    poolRef.current = shuffled;
    poolCursorRef.current = 8; // первые 8 уже использованы в начальном списке
    setDisplayedWorks(buildInitialWorks(shuffled));
  }, []);

  // Счётчик генераций — только на клиенте + обновление каждые 37 с (без расхождения SSR/гидрации)
  useEffect(() => {
    setDailyCount(getDailyGenCount());
    const t = setInterval(() => setDailyCount(getDailyGenCount()), 37_000);
    return () => clearInterval(t);
  }, []);

  // Ротация карточек каждые 5 минут (только если не используем реальные данные)
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
      setDisplayedWorks(prev => [newCard, ...prev.slice(0, 7)]);
      setTimeout(() => {
        setDisplayedWorks(prev => prev.map(w => w.id === newCard.id ? { ...w, isNew: false } : w));
      }, 8_000);
    }, 5 * 60_000);
    return () => clearInterval(t);
  }, [usingRealWorks]);

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

    // 0. Вернулись после оплаты extras
    if (params.get("extrasAutoGenerate") === "1") {
      try {
        const raw = sessionStorage.getItem("pendingExtras");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.returnTo === "dashboard" && parsed.generationId) {
            window.history.replaceState({}, "", "/");
            router.replace("/dashboard?extrasAutoGenerate=1");
            return;
          }
          const { result: savedResult, workType: savedWt, pages: savedPages, topic: savedTopic, items } = parsed;
          sessionStorage.removeItem("pendingExtras");
          window.history.replaceState({}, "", "/");
          selectWorkType(savedWt);
          if (savedPages) setPages(savedPages);
          if (savedTopic) setTopic(savedTopic);
          setResult(savedResult);
          // Открываем модал и запускаем extras
          setTimeout(() => triggerExtrasGeneration(items, savedResult), 600);
        }
      } catch {}
      return;
    }

    // 1. Вернулись после оплаты
    if (params.get("autoGenerate") === "1") {
      const raw = sessionStorage.getItem("pendingGeneration");
      if (raw) {
        try {
          const { topic: t, pages: p, workType: wt } = JSON.parse(raw);
          sessionStorage.removeItem("pendingGeneration");
          window.history.replaceState({}, "", "/");
          // Восстанавливаем предварительно выбранные extras
          try {
            const extrasRaw = sessionStorage.getItem("pendingExtrasChoice");
            if (extrasRaw) {
              _pendingExtrasItems = JSON.parse(extrasRaw);
              sessionStorage.removeItem("pendingExtrasChoice");
            }
          } catch {}
          // selectWorkType сбрасывает pages на дефолт → setPages(p) вызываем после
          selectWorkType(wt);
          setTopic(t);
          setPages(p);
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
              setLoading(true); setError(null); setResult(null);
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
                setError({ message: err || "Генерация не удалась", status: 0 });
              }
              clearGenState();
              sessionStorage.removeItem("activeGeneration");
              setLoading(false);
            });
            return;
          }

          // Случай 2: жёсткая перезагрузка (F5) — модуль сброшен.
          // Возобновляем анимацию прогресса с нужного момента + запускаем поллинг статуса.
          stepsRef.current = getProgressSteps(wt);
          f5InfoRef.current = { workType: wt, startedAt };
          setLoading(true);
          setError(null);
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

  // Анимация прогресса extras — имитируем заполнение до ~90%
  useEffect(() => {
    if (!extrasGenerating) {
      extrasProgressRef.current = 0;
      setExtrasProgress(0);
      return;
    }
    extrasProgressRef.current = 5;
    setExtrasProgress(5);
    const id = setInterval(() => {
      const cur = extrasProgressRef.current;
      // Логарифмическое замедление: быстро до 40%, медленно к 88%
      const inc = cur < 40 ? 1.5 : cur < 70 ? 0.5 : 0.15;
      const next = Math.min(88, cur + inc);
      extrasProgressRef.current = next;
      setExtrasProgress(next);
    }, 300);
    return () => clearInterval(id);
  }, [extrasGenerating]);

  // Поллинг extras — запускается при монтировании (подключается к _extras)
  // и перезапускается когда extrasJobId меняется
  useEffect(() => {
    // Если модуль уже завершён — сразу покажем результат
    if (_extras.done) {
      if (_extras.ready.length > 0) {
        setExtrasGenerating(false);
        setExtrasReady(_extras.ready);
      }
      return;
    }

    // Если нет активного jobId — ничего не делаем
    const jobId = _extras.jobId ?? extrasJobId;
    if (!jobId) return;

    // Синхронизируем state с модулем
    if (!extrasGenerating && _extras.active) setExtrasGenerating(true);

    // Регистрируем колбэк (сработает когда модульный поллинг завершится)
    _extras.listen((ready, err) => {
      extrasProgressRef.current = 100;
      setExtrasProgress(100);
      setExtrasGenerating(false);
      if (err) {
        setExtrasError(err);
      } else {
        setExtrasReady(ready);
      }
    });

    // Запускаем поллинг только если ещё не запущен (один поллинг на весь модуль)
    if (_extrasPollingStarted) return;
    _extrasPollingStarted = true;

    async function poll() {
      const currentJobId = _extras.jobId;
      if (!currentJobId || _extras.done) {
        _extrasPollingStarted = false;
        return;
      }
      try {
        const res  = await fetch(`/api/generate/extras/status/${currentJobId}`, { cache: "no-store" });
        const data = await res.json();

        if (data.status === "done") {
          const readyItems: string[] = data.ready ?? [];
          // Сохраняем JSON-структуру слайдов для скачивания PPTX
          if (data.slides) _extrasSlides = data.slides;
          _extras.resolve(readyItems, "");
          _extrasPollingStarted = false;
          // Сохраняем extras в БД: merge с уже существующими полями, await — чтобы не терять presentationSlides
          try {
            const savedGenId = _extrasGenId;
            if (savedGenId && readyItems.length > 0) {
              void (async () => {
                let prev: Record<string, unknown> = {};
                try {
                  const gr = await fetch(`/api/generations/${savedGenId}`);
                  if (gr.ok) {
                    const row = await gr.json();
                    if (row.extras && typeof row.extras === "string") {
                      try {
                        prev = JSON.parse(row.extras) as Record<string, unknown>;
                      } catch {
                        prev = {};
                      }
                    }
                  }
                } catch {
                  prev = {};
                }
                const merged: Record<string, unknown> = { ...prev };
                readyItems.forEach((item) => {
                  merged[item] = currentJobId;
                });
                if (data.slides) merged.presentationSlides = data.slides;
                try {
                  const rr = await fetch(`/api/generations/${savedGenId}/extras`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ extras: merged }),
                  });
                  if (!rr.ok)
                    console.error("[extras/save]", rr.status, await rr.text());
                } catch (e) {
                  console.error("[extras/save]", e);
                }
              })();
            }
          } catch {
            /* noop */
          }
          return;
        }
        if (data.status === "error" || data.status === "not_found") {
          _extras.resolve([], data.error || "Ошибка генерации дополнительных материалов");
          _extrasPollingStarted = false;
          return;
        }
      } catch { /* сеть — повторим */ }
      // status === "running" — ждём и повторяем
      setTimeout(poll, 4_000);
    }

    poll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extrasJobId]);

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
          router.push("/dashboard");
        } else if (data.status === "error" || data.status === "not_found") {
          clearInterval(pollRef.current!);
          clearGenState();
          stopProgress();
          setF5Recovery(false);
          setLoading(false);
          setError({
            message: data.status === "not_found"
              ? "Сервер был перезапущен во время генерации. Проверьте «Мои работы» — если работа сохранилась, она там."
              : "Генерация завершилась с ошибкой. Проверьте «Мои работы».",
            status: 500,
          });
        }
        // status === "running" | "idle" — продолжаем ждать
      } catch { /* сеть недоступна, повторим */ }
    }, 5_000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f5Recovery]);

  // Scroll-reveal: IntersectionObserver устанавливает data-visible="true" через setAttribute.
  // Используем setAttribute вместо classList.add — React не затирает data-* атрибуты при ре-рендерах,
  // тогда как className полностью перезаписывается React и сбрасывал бы is-visible при клике на FAQ.
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) {
          (e.target as HTMLElement).setAttribute('data-visible', 'true');
          obs.unobserve(e.target);
        }
      }),
      { threshold: 0.08 }
    );
    const els = document.querySelectorAll('[data-reveal]:not([data-visible="true"])');
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, displayedWorks.length, recentWorks.length]);

  const price         = WORK_PRICES[workType]?.price ?? 199;
  const pageRange     = WORK_PAGES[workType];
  const EXTRAS_TYPES  = ["Доклад", "Реферат", "Курсовая", "ВКР"];
  const hasExtrasForm = EXTRAS_TYPES.includes(workType);
  const extrasPrice   = (wantPresentation ? 199 : 0) + (wantSpeech ? 149 : 0);
  const totalPrice    = price + extrasPrice;

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  }

  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Refai',
    url: 'https://ref-ai.ru',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://ref-ai.ru/?topic={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  }

  return (
    <main className={styles.main}>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(websiteJsonLd) }} />

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
                disabled={loading || paymentLoading || !topic.trim() || (isYukassa && trialUsed)}
              >
                {loading
                  ? <><span className={styles.btnSpinner}/> Генерируем...</>
                  : paymentLoading
                  ? <><span className={styles.btnSpinner}/> Создаём платёж...</>
                  : isYukassa
                    ? `🎯 Сгенерировать ${{ "Сочинение": "сочинение", "Эссе": "эссе", "Доклад": "доклад" }[workType] ?? workType.toLowerCase()} — тест`
                    : `⚡ Сгенерировать ${{ "Сочинение": "сочинение", "Эссе": "эссе", "Доклад": "доклад", "Реферат": "реферат", "Курсовая": "курсовую", "ВКР": "ВКР" }[workType] ?? workType.toLowerCase()} — ${totalPrice} ₽`}
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
            {hasExtrasForm && (
              <p className={styles.extrasHint}>
                После генерации — добавьте презентацию или текст выступления
              </p>
            )}
          </form>

          {dailyCount > 0 && (
            <div className={styles.heroNote}>
              <span className={styles.heroDailyDot} />
              <span>{dailyCount} генераций сегодня</span>
            </div>
          )}

        </div>
      </section>

      {/* ── Прогресс ── */}
      {loading && (
        <section ref={progressSectionRef} className={styles.progressSection}>
          <div className={styles.progressCard}>

            {/* Верхняя строка: шаг N из M + процент */}
            <div className={styles.progressTop}>
              <span className={styles.progressStepCount}>
                Шаг {stepIndex + 1} из {stepsRef.current.length}
              </span>
              <span className={styles.progressPercent}>{Math.round(totalProgress)}%</span>
            </div>

            {/* Тема работы */}
            {topic && (
              <p className={styles.progressTopic}>«{topic}»</p>
            )}

            {/* Прогресс-бар */}
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ transform: `scaleX(${totalProgress / 100})` }} />
            </div>

            {/* Точки-шаги */}
            <div className={styles.progressDotRow}>
              {stepsRef.current.map((_, i) => (
                <span
                  key={i}
                  className={
                    i < stepIndex  ? styles.progressDotDone :
                    i === stepIndex ? styles.progressDotActive :
                    styles.progressDotPending
                  }
                />
              ))}
            </div>

            {/* Текущий шаг — key вызывает re-mount → анимация каждый раз */}
            <p key={stepIndex} className={styles.progressCurrentLabel}>
              {stepsRef.current[stepIndex]?.label}
              <span className={styles.progressDots}>{dots}</span>
            </p>

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
            <span className={styles.factBadge}>Знаете ли вы?</span>
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
              <p className={styles.errorTitle}>
                {error.status === 401
                  ? "Требуется вход"
                  : error.status === 403
                    ? "Нужна оплата или доступ"
                    : error.status === 429
                      ? "Генерация уже запущена"
                      : "Что-то пошло не так"}
              </p>
              <p className={styles.errorText}>{error.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Как это работает (показываем только пока нет результата) ── */}
      {!loading && (
        <section className={styles.stepsSection}>
          <div className={styles.stepsSectionInner}>
            <h2 className={styles.sectionTitle}>Как это работает</h2>
            <p className={styles.sectionSub}>Три шага до готовой работы</p>
            <div className={styles.stepsGrid}>
              <div className={styles.stepCard} data-reveal data-delay="1">
                <div className={styles.stepNumRow}>
                  <div className={styles.stepNum}>01</div>
                  <div className={styles.stepIcon} data-step-icon>{STEP_ICONS[0]}</div>
                </div>
                <div className={styles.stepTitle}>Вводишь тему</div>
                <p className={styles.stepText}>
                  Напиши любую тему в поле выше — развёрнуто или кратко, главное суть
                </p>
              </div>
              <div className={styles.stepCard} data-reveal data-delay="2">
                <div className={styles.stepNumRow}>
                  <div className={styles.stepNum}>02</div>
                  <div className={styles.stepIcon} data-step-icon>{STEP_ICONS[1]}</div>
                </div>
                <div className={styles.stepTitle}>ИИ пишет работу</div>
                <p className={styles.stepText}>
                  Алгоритм формирует структуру, введение, все главы, заключение и источники за 2–4 минуты
                </p>
              </div>
              <div className={styles.stepCard} data-reveal data-delay="3">
                <div className={styles.stepNumRow}>
                  <div className={styles.stepNum}>03</div>
                  <div className={styles.stepIcon} data-step-icon>{STEP_ICONS[2]}</div>
                </div>
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
      {!loading && (
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
      )}

      {/* ── Примеры работ ── */}
      {!loading && (
        <ExamplesSection onSelectWorkType={selectWorkType} />
      )}

      {/* ── Последние работы ── */}
      {!loading && (
        <section className={styles.recentSection}>
          <div className={styles.recentInner}>
            <div className={styles.recentHeadRow}>
              <div>
                <h2 className={styles.recentHeading}>
                  Последние <span className={styles.recentAccent}>проекты</span>
                </h2>
                <p className={styles.recentSubline}>
                  Более <strong>1 000 работ</strong> уже сгенерировано
                </p>
              </div>
            </div>
            <div className={styles.recentGrid}>
              {(usingRealWorks
                ? (showAllWorks ? recentWorks : recentWorks.slice(0, 8))
                : displayedWorks
              ).map((w, _idx) => {
                const workType  = (w as DisplayWork).workType ?? (w as typeof MOCK_RECENT[0]).workType;
                const topic     = (w as DisplayWork).topic    ?? (w as typeof MOCK_RECENT[0]).topic;
                const isNew     = (w as DisplayWork).isNew;
                const minsAgo   = (w as DisplayWork).minutesAgo;
                const createdAt = (w as typeof MOCK_RECENT[0]).createdAt;
                const typeColor = WORK_TYPE_COLORS[workType] || "#1B3A6B";
                const typeIcon  = WORK_TYPE_ICONS[workType]  || "📄";
                return (
                  <div
                    key={(w as DisplayWork).id ?? (w as typeof MOCK_RECENT[0]).id}
                    className={`${styles.recentCard} ${isNew ? styles.recentCardNew : ""}`}
                  >
                    <div className={styles.recentCardTop}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className={styles.recentBadge} style={{ color: typeColor }}>{workType}</span>
                        {isNew && <span className={styles.recentNewDot} />}
                      </div>
                      <span suppressHydrationWarning className={styles.recentDate}>
                        {createdAt ? formatDate(createdAt) : timeAgo(minsAgo ?? 0)}
                      </span>
                    </div>
                    <p className={styles.recentWorkTitle}>{topic}</p>
                  </div>
                );
              })}
            </div>
            {usingRealWorks && recentWorks.length > 8 && !showAllWorks && (
              <button className={styles.showMoreBtn} onClick={() => setShowAllWorks(true)}>
                Показать ещё
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── Comparison block ── */}
      {!loading && (
        <section className={styles.compareSection}>
          <div className={styles.compareInner}>
            <div className={styles.compareHead}>
              <h2 className={styles.compareHeading}>
                Самостоятельно vs <span className={styles.compareAccent}>Refai</span>
              </h2>
              <p className={styles.compareSub}>Сравните и решите сами</p>
            </div>
            <div className={styles.compareTable}>
              <div className={styles.compareHeader}>
                <div className={styles.compareHeaderCell}>Критерий</div>
                <div className={styles.compareHeaderCell}>Самостоятельно</div>
                <div className={styles.compareHeaderCell}>Refai</div>
              </div>
              {[
                { label: 'Время',             bad: '3–7 дней',           good: '2 минуты' },
                { label: 'Оформление по ГОСТ', bad: 'Вручную',            good: 'Автоматически' },
                { label: 'Источники',          bad: 'Поиск вручную',      good: 'Реальные, с DOI' },
                { label: 'Уникальность',       bad: '< 50%',              good: '70–90%' },
                { label: 'Стоимость',          bad: '500–3000 ₽ + время', good: 'от 99 ₽' },
                { label: 'Формат',             bad: 'PDF или распечатка', good: 'DOCX, сразу в Word' },
              ].map((row, i) => (
                <div key={i} className={styles.compareRow} data-reveal data-delay={String(i + 1)}>
                  <div className={styles.compareRowLabel}>{row.label}</div>
                  <div className={styles.compareRowBad}>
                    <svg className={styles.compareBadIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    {row.bad}
                  </div>
                  <div className={styles.compareRowGood}>
                    <svg className={styles.compareGoodIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    {row.good}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FAQ ── */}
      {!loading && (
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
                    >
                      <span>{item.q}</span>
                      <svg
                        className={styles.faqIcon}
                        width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                        style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s cubic-bezier(0.22,1,0.36,1)' }}
                      >
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                    <div className={`${styles.faqBody} ${isOpen ? styles.faqBodyOpen : ''}`}>
                      <p className={styles.faqA}>{item.a}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Модальное окно результата (portal → вне main, поверх header) ── */}
      {result && showResultModal && createPortal((() => {
        const hasTitlePage = ["Реферат", "Курсовая", "ВКР", "Доклад"].includes(workType);
        const hasSources   = !["Эссе", "Сочинение"].includes(workType);
        const hasExtras    = !["Эссе", "Сочинение"].includes(workType);
        const extrasTotal  = (presentationSel ? 199 : 0) + (speechSel ? 149 : 0);
        const DownloadBtn  = () => modalTab === "presentation" && hasPres ? (
          <button className={styles.downloadBtn} onClick={downloadPresentation} disabled={downloadingPptx}
            style={{ background: downloadingPptx ? "#374151" : "#1E3A5F" }}>
            {downloadingPptx
              ? <span className={styles.buttonLoading}><span className={styles.spinner}/>Генерируем файл...</span>
              : <><img src="/pptx-icon.svg" alt="" className={styles.downloadIcon} />Скачать PPTX</>
            }
          </button>
        ) : (
          <button className={styles.downloadBtn} onClick={handleDownload} disabled={downloading}>
            {downloading
              ? <span className={styles.buttonLoading}><span className={styles.spinner}/>Создаём файл...</span>
              : <><img src="/docx-icon.png" alt="" className={styles.downloadIcon} />Скачать DOCX</>
            }
          </button>
        );
        const ExtrasStatus = () => {
          if (extrasGenerating) return (
            <div className={styles.extrasLoading}>
              <div className={styles.extrasProgressRow}>
                <span className={styles.extrasProgressLabel}>Генерируем дополнительные материалы...</span>
                <span className={styles.extrasProgressPct}>{Math.round(extrasProgress)}%</span>
              </div>
              <div className={styles.extrasProgressBar}>
                <div className={styles.extrasProgressFill} style={{ transform: `scaleX(${extrasProgress / 100})` }} />
              </div>
            </div>
          );
          if (extrasError) return (
            <p className={styles.extrasErrorMsg}>{extrasError}</p>
          );
          if (extrasReady.length > 0) return (
            <div className={styles.extrasDownloads}>
              {/* PPTX скачивается через большую кнопку — здесь только выступление */}
              {extrasReady.includes("speech") && (
                <button className={styles.extrasDownloadBtn} onClick={downloadSpeech}>
                  <img src="/txt-icon.svg" alt="" className={styles.extrasDownloadIcon} />
                  Скачать выступление .txt
                </button>
              )}
            </div>
          );
          return null;
        };

        const Toggles = () => (
          <div className={styles.extrasSection}>
            {!extrasGenerating && extrasReady.length === 0 && (
              <>
                {!wantPresentation && (
                  <label className={styles.toggleRow}>
                    <input type="checkbox" className={styles.toggleInput} checked={presentationSel} onChange={e => setPresentationSel(e.target.checked)} />
                    <span className={styles.toggleSlider} />
                    <span className={styles.toggleLabel}><img src="/pptx-icon.svg" alt="" className={styles.toggleLabelIcon} /> Презентация</span>
                    <span className={styles.togglePrice}>+199 ₽</span>
                  </label>
                )}
                {!wantSpeech && (
                  <label className={styles.toggleRow}>
                    <input type="checkbox" className={styles.toggleInput} checked={speechSel} onChange={e => setSpeechSel(e.target.checked)} />
                    <span className={styles.toggleSlider} />
                    <span className={styles.toggleLabel}><img src="/txt-icon.svg" alt="" className={styles.toggleLabelIcon} /> Текст выступления</span>
                    <span className={styles.togglePrice}>+149 ₽</span>
                  </label>
                )}
                {extrasTotal > 0 && (
                  <button className={styles.payExtrasBtn} onClick={handleExtrasPayment}>
                    Оплатить {extrasTotal} ₽
                  </button>
                )}
              </>
            )}
            <ExtrasStatus />
          </div>
        );
        // Используем slidesData (state) или _extrasSlides (module var) если state ещё не обновился
        const activeSlidesData = slidesData ?? (_extrasSlides && extrasReady.includes("presentation") ? _extrasSlides as { accent: string; slides: unknown[] } : null);
        const hasPres = !!activeSlidesData;
        const showPresentationHero =
          modalTab === "presentation" &&
          hasExtras &&
          !hasPres &&
          !extrasGenerating &&
          extrasReady.length === 0 &&
          (!wantPresentation || !wantSpeech);

        return (
          <div className={`${styles.modalOverlay} ${modalClosing ? styles.modalOverlayClosing : ""}`}>
            <div
              ref={resultModalRef}
              className={`${styles.modalBox} ${modalClosing ? styles.modalBoxClosing : ""}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="result-modal-title"
            >

              {/* Крестик — только на десктопе */}
              <button ref={resultModalCloseRef} className={styles.modalClose} onClick={closeResultModal}>✕</button>

              {/* Мобильная шапка (скрыта на десктопе) */}
              <div className={styles.mobileModalHeader}>
                <div>
                  <h2 id="result-modal-title" className={styles.modalTitle}>{result.title}</h2>
                  <div className={styles.modalBadges}>
                    <span className={styles.badge}>{workType}</span>
                    <span className={styles.badge}>{pages} стр.</span>
                  </div>
                </div>
                <button className={styles.mobileCloseBtn} onClick={closeResultModal}>✕</button>
              </div>

              {/* Табы */}
              <div className={styles.modalTabs}>
                <button
                  className={`${styles.modalTab} ${modalTab === "work" ? styles.modalTabActive : ""}`}
                  onClick={() => setModalTab("work")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/docx-icon.png" alt="" className={styles.modalTabIcon} />
                  Работа
                </button>
                <button
                  className={`${styles.modalTab} ${modalTab === "presentation" ? styles.modalTabActive : ""}`}
                  onClick={() => setModalTab("presentation")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/pptx-icon.svg" alt="" className={styles.modalTabIcon} />
                  Презентация
                </button>
              </div>

              <div className={styles.modalBody}>

              {/* Левый столбец */}
              <div className={styles.modalLeft} style={modalTab === "presentation" ? { background: "#1a1a2e" } : undefined}>
                {/* DOCX preview — всегда в DOM, скрыт через CSS при табе Презентация */}
                <div style={{ display: modalTab === "work" ? "block" : "none" }}>
                  {previewLoading && (
                    <div className={styles.previewSpinner}>
                      <span className={styles.spinnerDark}/> Загружаем предпросмотр...
                    </div>
                  )}
                  <div ref={previewContainerRef} className={styles.previewContainer} />
                </div>
                {/* PresentationViewer — всегда в DOM если данные есть, скрыт при табе Работа */}
                {/* PresentationViewer — скрыт при табе Работа, но всегда в DOM если есть данные */}
                <div
                  style={{
                    display: modalTab === "presentation" ? "flex" : "none",
                    flex: 1,
                    minHeight: 0,
                    width: "100%",
                    flexDirection: "column",
                    position: "relative",
                  }}
                >
                  {showPresentationHero ? (
                    <div className={styles.presentationExtrasHero}>
                      <p className={styles.presentationExtrasHeroHint}>
                        Выберите дополнительные материалы для вашей работы. После оплаты генерация начнется автоматически.
                      </p>
                      <div className={styles.presentationExtrasHeroGrid}>
                        {!wantPresentation && (
                          <button
                            type="button"
                            className={`${styles.presentationHeroCard} ${presentationSel ? styles.presentationHeroCardActive : ""}`}
                            onClick={() => setPresentationSel(v => !v)}
                          >
                            <img src="/pptx-icon.svg" alt="" className={styles.presentationHeroIcon} />
                            <span className={styles.presentationHeroTitle}>Презентация</span>
                            <span className={styles.presentationHeroPrice}>+199 ₽</span>
                          </button>
                        )}
                        {!wantSpeech && (
                          <button
                            type="button"
                            className={`${styles.presentationHeroCard} ${speechSel ? styles.presentationHeroCardActive : ""}`}
                            onClick={() => setSpeechSel(v => !v)}
                          >
                            <img src="/txt-icon.svg" alt="" className={styles.presentationHeroIcon} />
                            <span className={styles.presentationHeroTitle}>Текст выступления</span>
                            <span className={styles.presentationHeroPrice}>+149 ₽</span>
                          </button>
                        )}
                      </div>
                      {!isMobileViewport && extrasTotal > 0 && (
                        <button type="button" className={styles.presentationHeroPayBtn} onClick={handleExtrasPayment}>
                          Оплатить {extrasTotal} ₽
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <PresentationViewer
                        slides={hasPres ? (activeSlidesData!.slides as Slide[]) : []}
                        accent={activeSlidesData?.accent ?? "blue"}
                        mode="embedded"
                        images={presentationImages}
                        onSlidesChange={slides => setSlidesData(prev => prev ? { ...prev, slides } : { ...activeSlidesData!, slides })}
                        onImagesChange={setPresentationImages}
                        onOrder={(!extrasGenerating && hasExtras) ? () => { setModalTab("work"); setPresentationSel(true); } : undefined}
                      />
                      {extrasGenerating && (
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            background: "#1a1a2e",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 12,
                          }}
                        >
                          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>Генерируем презентацию...</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Кнопки зума — вне скролла, прибиты к углу modalBox (absolute) */}
              {!previewLoading && (
                <div className={styles.zoomControls}>
                  <button className={styles.zoomBtn} onClick={() => applyZoom(0.1)} title="Увеличить">＋</button>
                  <span className={styles.zoomLevel}>{Math.round(baseScaleRef.current * previewZoom * 100)}%</span>
                  <button className={styles.zoomBtn} onClick={() => applyZoom(-0.1)} title="Уменьшить">－</button>
                </div>
              )}

              {/* Правый столбец — десктоп (скрыт на мобильном) */}
              <div className={styles.modalRight}>
                <h2 className={styles.modalTitle}>{result.title}</h2>
                <div className={styles.modalBadges}>
                  <span className={styles.badge}>{workType}</span>
                  <span className={styles.badge}>{pages} стр.</span>
                </div>
                <hr className={styles.modalDivider} />
                <ul className={styles.featureList}>
                  <li>✅ Оформление по ГОСТ 7.32-2017</li>
                  <li>✅ Уникальность текста 80%+</li>
                  {hasSources && <li>✅ Реальные источники 2020–2025</li>}
                  <li>✅ Готов к скачиванию</li>
                </ul>
                <hr className={styles.modalDivider} />
                <DownloadBtn />
                {hasExtras && <Toggles />}
                {hasTitlePage && (
                  <>
                    <hr className={styles.modalDivider} />
                    <div className={styles.titleSection}>
                      <p className={styles.titleSectionHeading}>Данные для документов</p>
                      <p className={styles.titleSectionSub}>Подставляются в работу и презентацию</p>
                      <input className={styles.titleInput} placeholder="ФИО студента" value={titleForm.fullName} onChange={e => setTitleForm(prev => ({ ...prev, fullName: e.target.value }))} />
                      <input className={styles.titleInput} placeholder="Университет" value={titleForm.university} onChange={e => setTitleForm(prev => ({ ...prev, university: e.target.value }))} />
                      <label className={styles.skipRow}>
                        <input type="checkbox" checked={skipFaculty} onChange={e => setSkipFaculty(e.target.checked)} />
                        <span>Не указывать факультет</span>
                      </label>
                      {!skipFaculty && <input className={styles.titleInput} placeholder="Направление / факультет" value={titleForm.faculty} onChange={e => setTitleForm(prev => ({ ...prev, faculty: e.target.value }))} />}
                      <label className={styles.skipRow}>
                        <input type="checkbox" checked={skipSpeciality} onChange={e => setSkipSpeciality(e.target.checked)} />
                        <span>Не указывать специализацию</span>
                      </label>
                      {!skipSpeciality && <input className={styles.titleInput} placeholder="Специализация" value={titleForm.speciality} onChange={e => setTitleForm(prev => ({ ...prev, speciality: e.target.value }))} />}
                      <label className={styles.skipRow}>
                        <input type="checkbox" checked={skipDiscipline} onChange={e => setSkipDiscipline(e.target.checked)} />
                        <span>Не указывать предмет</span>
                      </label>
                      {!skipDiscipline && <input className={styles.titleInput} placeholder="Предмет / дисциплина" value={titleForm.discipline} onChange={e => setTitleForm(prev => ({ ...prev, discipline: e.target.value }))} />}
                      <input className={styles.titleInput} placeholder="Кафедра" value={titleForm.department} onChange={e => setTitleForm(prev => ({ ...prev, department: e.target.value }))} />
                      <input className={styles.titleInput} placeholder="Группа" value={titleForm.groupNumber} onChange={e => setTitleForm(prev => ({ ...prev, groupNumber: e.target.value }))} />
                      <input className={styles.titleInput} placeholder="Научный руководитель" value={titleForm.teacherName} onChange={e => setTitleForm(prev => ({ ...prev, teacherName: e.target.value }))} />
                      <input className={styles.titleInput} placeholder="Город" value={titleForm.city} onChange={e => setTitleForm(prev => ({ ...prev, city: e.target.value }))} />
                      <button className={styles.updateDocBtn} onClick={handleTitleUpdate} disabled={titleUpdating}>
                        {titleUpdating ? "Обновляем..." : "↻ Обновить документ"}
                      </button>
                      <label className={styles.saveProfileRow}>
                        <input
                          type="checkbox"
                          className={styles.saveProfileCheck}
                          checked={saveProfile}
                          onChange={e => setSaveProfile(e.target.checked)}
                        />
                        <span>Запомнить данные</span>
                      </label>
                    </div>
                  </>
                )}
                <p className={styles.savedNote}>Работа сохранена в личном кабинете</p>
              </div>

              </div>{/* /modalBody */}

              {/* Нижняя панель — только мобильный (sticky) */}
              <div className={styles.mobileBottom}>
                {/* Зум-кнопки (мобиль) */}
                {!previewLoading && (
                  <div className={styles.mobileZoomRow}>
                    <button className={styles.mobileZoomBtn} onClick={() => applyZoom(0.1)}>＋</button>
                    <span className={styles.mobileZoomLabel}>{Math.round(baseScaleRef.current * previewZoom * 100)}%</span>
                    <button className={styles.mobileZoomBtn} onClick={() => applyZoom(-0.1)}>－</button>
                  </div>
                )}
                <DownloadBtn />
                {hasTitlePage && (
                  <button className={styles.mobileTitleBtn} onClick={() => setShowTitleModal(true)}>
                    ✏ Титульный лист
                  </button>
                )}
                {hasExtras && modalTab === "work" && !extrasGenerating && extrasReady.length === 0 && (!wantPresentation || !wantSpeech) && (
                  <div className={styles.mobileToggles}>
                    {!wantPresentation && (
                      <label className={`${styles.mobileToggleChip} ${presentationSel ? styles.mobileToggleChipActive : ""}`}>
                        <input type="checkbox" className={styles.toggleInput} checked={presentationSel} onChange={e => setPresentationSel(e.target.checked)} />
                        <img src="/pptx-icon.svg" alt="" className={styles.mobileChipIcon} />
                        <span className={styles.mobileChipLabel}>Презентация</span>
                        <span className={styles.mobileChipPrice}>+199 ₽</span>
                      </label>
                    )}
                    {!wantSpeech && (
                      <label className={`${styles.mobileToggleChip} ${speechSel ? styles.mobileToggleChipActive : ""}`}>
                        <input type="checkbox" className={styles.toggleInput} checked={speechSel} onChange={e => setSpeechSel(e.target.checked)} />
                        <img src="/txt-icon.svg" alt="" className={styles.mobileChipIcon} />
                        <span className={styles.mobileChipLabel}>Выступление</span>
                        <span className={styles.mobileChipPrice}>+149 ₽</span>
                      </label>
                    )}
                  </div>
                )}
                {hasExtras && !extrasGenerating && extrasReady.length === 0 && extrasTotal > 0 && (
                  <button className={`${styles.payExtrasBtn} ${styles.payExtrasBtnMobile}`} onClick={handleExtrasPayment}>
                    Оплатить {extrasTotal} ₽
                  </button>
                )}
                {extrasGenerating && (
                  <div className={styles.extrasLoading}>
                    <div className={styles.extrasProgressRow}>
                      <span className={styles.extrasProgressLabel}>Генерируем...</span>
                      <span className={styles.extrasProgressPct}>{Math.round(extrasProgress)}%</span>
                    </div>
                    <div className={styles.extrasProgressBar}>
                      <div className={styles.extrasProgressFill} style={{ transform: `scaleX(${extrasProgress / 100})` }} />
                    </div>
                  </div>
                )}
                {extrasError && <p className={styles.extrasErrorMsg}>{extrasError}</p>}
                {extrasReady.length > 0 && (
                  <div className={styles.extrasDownloadsMobile}>
                    {/* PPTX — через большую кнопку DownloadBtn выше, здесь только выступление */}
                    {extrasReady.includes("speech") && (
                      <button className={styles.extrasDownloadBtn} onClick={downloadSpeech}>
                        <img src="/txt-icon.svg" alt="" className={styles.extrasDownloadIcon} />
                        Выступление .txt
                      </button>
                    )}
                  </div>
                )}
              </div>

            </div>
          </div>
        );
      })(), document.body)}

      {/* Мобильный bottom-sheet редактирования титульника */}
      {showTitleModal && typeof document !== "undefined" && createPortal(
        <div className={styles.titleSheetOverlay} onClick={() => setShowTitleModal(false)}>
          <div className={styles.titleSheet} onClick={e => e.stopPropagation()}>
            <div className={styles.titleSheetHeader}>
              <span className={styles.titleSheetTitle}>Титульный лист</span>
              <button className={styles.titleSheetClose} onClick={() => setShowTitleModal(false)}>✕</button>
            </div>
            <div className={styles.titleSheetBody}>
              <input className={styles.titleInput} placeholder="ФИО студента" value={titleForm.fullName} onChange={e => setTitleForm(prev => ({ ...prev, fullName: e.target.value }))} />
              <input className={styles.titleInput} placeholder="Университет" value={titleForm.university} onChange={e => setTitleForm(prev => ({ ...prev, university: e.target.value }))} />
              <label className={styles.skipRow}>
                <input type="checkbox" checked={skipFaculty} onChange={e => setSkipFaculty(e.target.checked)} />
                <span>Не указывать факультет</span>
              </label>
              {!skipFaculty && <input className={styles.titleInput} placeholder="Направление / факультет" value={titleForm.faculty} onChange={e => setTitleForm(prev => ({ ...prev, faculty: e.target.value }))} />}
              <label className={styles.skipRow}>
                <input type="checkbox" checked={skipSpeciality} onChange={e => setSkipSpeciality(e.target.checked)} />
                <span>Не указывать специализацию</span>
              </label>
              {!skipSpeciality && <input className={styles.titleInput} placeholder="Специализация" value={titleForm.speciality} onChange={e => setTitleForm(prev => ({ ...prev, speciality: e.target.value }))} />}
              <label className={styles.skipRow}>
                <input type="checkbox" checked={skipDiscipline} onChange={e => setSkipDiscipline(e.target.checked)} />
                <span>Не указывать предмет</span>
              </label>
              {!skipDiscipline && <input className={styles.titleInput} placeholder="Предмет / дисциплина" value={titleForm.discipline} onChange={e => setTitleForm(prev => ({ ...prev, discipline: e.target.value }))} />}
              <input className={styles.titleInput} placeholder="Кафедра" value={titleForm.department} onChange={e => setTitleForm(prev => ({ ...prev, department: e.target.value }))} />
              <input className={styles.titleInput} placeholder="Группа" value={titleForm.groupNumber} onChange={e => setTitleForm(prev => ({ ...prev, groupNumber: e.target.value }))} />
              <input className={styles.titleInput} placeholder="Научный руководитель" value={titleForm.teacherName} onChange={e => setTitleForm(prev => ({ ...prev, teacherName: e.target.value }))} />
              <input className={styles.titleInput} placeholder="Город" value={titleForm.city} onChange={e => setTitleForm(prev => ({ ...prev, city: e.target.value }))} />
              <button className={styles.updateDocBtn} onClick={() => { handleTitleUpdate(); setShowTitleModal(false); }} disabled={titleUpdating}>
                {titleUpdating ? "Обновляем..." : "↻ Обновить документ"}
              </button>
              <label className={styles.saveProfileRow}>
                <input type="checkbox" className={styles.saveProfileCheck} checked={saveProfile} onChange={e => setSaveProfile(e.target.checked)} />
                <span>Запомнить данные</span>
              </label>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Виджет оплаты ЮКассы */}
      {paymentWidgetData && (
        <PaymentWidget
          workType={paymentWidgetData.workType}
          extras={paymentWidgetData.extras}
          returnUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/payment/success`}
          onSuccess={() => {
            setPaymentWidgetData(null);
            const raw = sessionStorage.getItem("pendingGeneration");
            if (raw) {
              try {
                const { topic: t, pages: p, workType: wt } = JSON.parse(raw);
                sessionStorage.removeItem("pendingGeneration");
                try {
                  const extrasRaw = sessionStorage.getItem("pendingExtrasChoice");
                  if (extrasRaw) { _pendingExtrasItems = JSON.parse(extrasRaw); sessionStorage.removeItem("pendingExtrasChoice"); }
                } catch {}
                selectWorkType(wt); setTopic(t); setPages(p);
                setTimeout(() => runGeneration(t, p, wt), 0);
              } catch {}
            }
          }}
          onClose={() => setPaymentWidgetData(null)}
        />
      )}

    </main>
  );
}
