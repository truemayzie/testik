"use client";

import { useState, useEffect, useRef } from "react";
import styles from "./HowItWorks.module.css";

const STEP_DURATION_MS = 3500;

interface StepItem {
  num: string;
  title: string;
  shortTitle: string;
  desc: string;
}

const STEPS: StepItem[] = [
  {
    num: "01",
    title: "Вводишь тему",
    shortTitle: "Вводишь тему",
    desc: "Получаешь план и описание",
  },
  {
    num: "02",
    title: "Проверяешь содержание",
    shortTitle: "Содержание",
    desc: "Редактируешь, если хочешь что-то поменять",
  },
  {
    num: "03",
    title: "Через 5-10 минут работа готова",
    shortTitle: "Готовая работа",
    desc: "Оформление по ГОСТу и высокая оригинальность",
  },
];

const TYPED_TOPIC_TEXT = "Искусственный интеллект в бизнесе";

export default function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [typedChars, setTypedChars] = useState(0);

  const startTimeRef = useRef<number>(Date.now());
  const elapsedRef = useRef<number>(0);

  // Смена шагов по таймеру с паузой при наведении
  useEffect(() => {
    startTimeRef.current = Date.now() - elapsedRef.current;

    const interval = setInterval(() => {
      if (isPaused) {
        startTimeRef.current = Date.now() - elapsedRef.current;
        return;
      }

      const elapsed = Date.now() - startTimeRef.current;
      elapsedRef.current = elapsed;

      if (elapsed >= STEP_DURATION_MS) {
        elapsedRef.current = 0;
        startTimeRef.current = Date.now();
        setActiveStep((prev) => (prev + 1) % STEPS.length);
      }
    }, 40);

    return () => clearInterval(interval);
  }, [isPaused, activeStep]);

  // Эффект печати текста для Шага 1
  useEffect(() => {
    if (activeStep !== 0) {
      setTypedChars(0);
      return;
    }

    setTypedChars(0);
    let index = 0;
    const typeInterval = setInterval(() => {
      index++;
      setTypedChars(index);
      if (index >= TYPED_TOPIC_TEXT.length) {
        clearInterval(typeInterval);
      }
    }, 38);

    return () => clearInterval(typeInterval);
  }, [activeStep]);

  function handleSelectStep(index: number) {
    setActiveStep(index);
    elapsedRef.current = 0;
    startTimeRef.current = Date.now();
  }

  return (
    <section
      id="how-it-works"
      className={styles.stepsSection}
      aria-labelledby="how-it-works-title"
    >
      <div className={styles.stepsInner}>
        {/* Заголовок */}
        <header className={styles.stepsHead} data-reveal>
          <div className={styles.stepsEyebrow}>
            <span>✦</span> Как это работает
          </div>
          <h2 id="how-it-works-title" className={styles.stepsTitle}>
            Три шага до готового Word
          </h2>
          <p className={styles.stepsLead}>
            Сначала превью и план — оплата только когда убедитесь в качестве
          </p>
        </header>

        {/* Главная легкая карточка без дублирующихся шапок и лишнего шума */}
        <div
          className={styles.showcaseCard}
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          data-reveal
          data-delay="1"
        >
          {/* Левая колонка: Минималистичные табы 3 шагов */}
          <div
            className={styles.tabsCol}
            role="tablist"
            aria-label="Шаги генерации работы"
          >
            {STEPS.map((step, idx) => {
              const isActive = activeStep === idx;
              return (
                <button
                  key={step.num}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`step-panel-${idx}`}
                  id={`step-tab-${idx}`}
                  className={`${styles.stepTab} ${isActive ? styles.stepTabActive : ""}`}
                  onClick={() => handleSelectStep(idx)}
                  type="button"
                >
                  {/* Номер шага 01, 02, 03 */}
                  <span className={`${styles.stepNum} ${isActive ? styles.stepNumActive : ""}`}>
                    {step.num}
                  </span>

                  {/* Текстовая часть таба: лаконичный заголовок и краткое описание */}
                  <div className={styles.tabText}>
                    <h3 className={`${styles.tabTitle} ${isActive ? styles.tabTitleActive : ""}`}>
                      <span className={styles.tabTitleFull}>{step.title}</span>
                      <span className={styles.tabTitleShort}>{step.shortTitle}</span>
                    </h3>
                    <p className={styles.tabDesc}>{step.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Правая колонка: Просторный интерактивный холст */}
          <div
            className={styles.stageCol}
            role="tabpanel"
            id={`step-panel-${activeStep}`}
            aria-labelledby={`step-tab-${activeStep}`}
          >
            {/* ── СЦЕНА 1: Вводишь тему ── */}
            <div className={`${styles.sceneContainer} ${activeStep === 0 ? styles.sceneContainerActive : ""}`}>
              <div className={styles.screen1Wrap}>
                <div className={styles.screen1InputBox}>
                  <span className={styles.screen1Icon}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"/>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                  </span>
                  <div className={styles.screen1TextWrap}>
                    <span className={styles.screen1Text}>
                      {TYPED_TOPIC_TEXT.slice(0, activeStep === 0 ? typedChars : TYPED_TOPIC_TEXT.length)}
                    </span>
                    <span className={styles.screen1Cursor} />
                  </div>
                  <span style={{ color: "#94A3B8", display: "flex", flexShrink: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </div>
                <div className={styles.screen1Hint}>
                  Получаете структуру и фрагмент текста за секунды
                </div>
              </div>
            </div>

            {/* ── СЦЕНА 2: Проверяешь содержание ── */}
            <div className={`${styles.sceneContainer} ${activeStep === 1 ? styles.sceneContainerActive : ""}`}>
              <div className={styles.screen2Wrap}>
                <div className={styles.screen2ScrollContainer}>
                  <div className={styles.screen2Item} style={{ opacity: 0.5 }}>
                    <span className={styles.screen2Handle}>•••</span>
                    <span className={styles.screen2ItemText}>
                      1.2 Цели и задачи применения технологий
                    </span>
                  </div>

                  <div className={`${styles.screen2Item} ${styles.screen2ItemActive}`}>
                    <span className={styles.screen2Handle} style={{ color: "#1D5CFF" }}>•••</span>
                    <span className={styles.screen2ItemText}>
                      Глава 2. Практика внедрения ИИ
                    </span>
                  </div>

                  <div className={styles.screen2Item}>
                    <span className={styles.screen2Handle}>•••</span>
                    <span className={`${styles.screen2ItemText} ${styles.screen2ItemSub}`}>
                      2.1 Характеристика объекта исследования
                    </span>
                  </div>

                  <div className={styles.screen2Item}>
                    <span className={styles.screen2Handle}>•••</span>
                    <span className={`${styles.screen2ItemText} ${styles.screen2ItemSub}`}>
                      2.2 Анализ рынка и оценка эффективности
                    </span>
                  </div>

                  <div className={styles.screen2Item} style={{ opacity: 0.8 }}>
                    <span className={styles.screen2Handle}>•••</span>
                    <span className={styles.screen2ItemText}>
                      Глава 3. Разработка рекомендаций
                    </span>
                  </div>

                  <div className={styles.screen2Item}>
                    <span className={styles.screen2Handle}>•••</span>
                    <span className={`${styles.screen2ItemText} ${styles.screen2ItemSub}`}>
                      3.1 Автоматизация клиентского сервиса
                    </span>
                  </div>

                  <div className={styles.screen2Item}>
                    <span className={styles.screen2Handle}>•••</span>
                    <span className={`${styles.screen2ItemText} ${styles.screen2ItemSub}`}>
                      3.2 Прогноз повышения ROI и расчет затрат
                    </span>
                  </div>

                  <div className={styles.screen2AddRow}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"/>
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Добавить новую главу
                  </div>
                </div>
              </div>
            </div>

            {/* ── СЦЕНА 3: Через 5-10 минут работа готова ── */}
            <div className={`${styles.sceneContainer} ${activeStep === 2 ? styles.sceneContainerActive : ""}`}>
              <div className={styles.screen3Wrap}>
                <div className={styles.screen3DocBox}>
                  <div className={styles.screen3DocIcon}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                      <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                  </div>
                  <div className={styles.screen3DocInfo}>
                    <h4 className={styles.screen3DocTitle}>
                      Курсовая работа.docx
                    </h4>
                    <p className={styles.screen3DocMeta}>
                      Готово к скачиванию • 88% уникальности
                    </p>
                  </div>
                  <span className={styles.screen3CheckIcon}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Кнопка действия */}
        <div className={styles.stepsCtaWrap} data-reveal data-delay="2">
          <a href="#generator" className={styles.stepsCta}>
            Перейти к генератору
            <span className={styles.stepsCtaIcon} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </a>
        </div>      </div>
    </section>
  );
}
