export type Step = { label: string; duration: number };

export function getProgressSteps(workType: string): Step[] {
  if (workType === "Тест") {
    return [
      { label: "Подключаемся к Claude", duration: 15000 },
      { label: "Генерируем ответ",      duration: 45000 },
      { label: "Финальная проверка",    duration: 10000 },
    ];
  }
  if (workType === "Сочинение" || workType === "Эссе") {
    return [
      { label: "Анализируем тему",   duration: 5000  },
      { label: "Подбираем стиль",    duration: 8000  },
      { label: "Пишем текст",        duration: 50000 },
      { label: "Финальная проверка", duration: 7000  },
    ];
  }
  if (workType === "Доклад") {
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
    return [
      { label: "Анализируем тему",     duration: 8000  },
      { label: "Ищем источники",       duration: 30000 },
      { label: "Формируем структуру",  duration: 10000 },
      { label: "Пишем введение",       duration: 25000 },
      { label: "Пишем главу 1",        duration: 85000 },
      { label: "Пишем главу 2",        duration: 85000 },
      { label: "Пишем главу 3",        duration: 85000 },
      { label: "Пишем заключение",     duration: 25000 },
      { label: "Оформляем приложения", duration: 8000  },
      { label: "Оформляем литературу", duration: 12000 },
      { label: "Финальная проверка",   duration: 7000  },
    ];
  }
  if (workType === "Курсовая") {
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
  // Реферат (default)
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

/**
 * Вычисляет текущий процент и метку шага по прошедшему времени.
 * elapsed — миллисекунды с начала генерации.
 */
export function computeProgress(workType: string, elapsed: number): { percent: number; stepLabel: string } {
  const steps = getProgressSteps(workType);
  const total = steps.reduce((s, st) => s + st.duration, 0);

  let acc = 0;
  let stepLabel = steps[0].label;
  for (const step of steps) {
    if (elapsed < acc + step.duration) {
      stepLabel = step.label;
      break;
    }
    acc += step.duration;
    stepLabel = step.label;
  }

  const percent = Math.min(Math.round((elapsed / total) * 100), 98);
  return { percent, stepLabel };
}
