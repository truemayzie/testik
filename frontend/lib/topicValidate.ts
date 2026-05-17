/** Максимальная длина темы после очистки (отправка в API). */
export const TOPIC_MAX_LEN = 280;

const TOPIC_MIN_LEN = 5;

/** Тихо приводит ввод к «теме одной фразой». */
export function normalizeTopic(raw: string): string {
  let t = raw.trim().replace(/\s+/g, " ");
  if (!t) return "";

  const fromLabel =
    t.match(/(?:на\s+тему|тема\s*:|topic\s*:?)\s*[«"']([^»"']{3,})[»"']/i) ||
    t.match(/[«"']([^»"']{3,})[»"']/);
  if (fromLabel) t = fromLabel[1].trim();

  const projectOn = t.match(
    /(?:проект|работа|реферат|доклад|курсовая|эссе|сочинение)\s+на\s+тему\s+(.+)/i,
  );
  if (projectOn) {
    const inner = projectOn[1].replace(/^[«"']+|[»"']+$/g, "").trim();
    if (inner.length >= TOPIC_MIN_LEN) t = inner;
  }

  for (let i = 0; i < 3; i++) {
    const prev = t;
    t = t.replace(
      /^(?:пожалуйста[,]?\s*)?(?:сделай|составь|напиши|создай|подготовь|разработай|оформи|нужно|надо)\s+/i,
      "",
    );
    t = t.replace(/^(?:мне\s+)?(?:нужен|нужна|нужно)\s+(?:сделать\s+)?/i, "");
    t = t.replace(
      /^(?:доклад|реферат|курсовую(?:\s+работу)?|курсовая|эссе|сочинение|вкр|диплом|проект)\s+(?:по|на|о|об|про)\s+/i,
      "",
    );
    t = t.replace(/^по\s+(?:истори(?:и|я)|предмету)\s+(?:о|об|про)\s+/i, "");
    t = t.replace(/^истори(?:я|и)\s+(?:о|об|про)\s+/i, "");
    if (t === prev) break;
  }

  t = t.replace(/^[«"'(\[]+|[»"')\].,;:]+$/g, "").trim();
  return t.slice(0, TOPIC_MAX_LEN);
}

function countNumberedItems(s: string): number {
  return (s.match(/(?:^|[\s;])\d{1,2}[\.\)]\s+\S/g) || []).length;
}

/** Явный заказ презентации в поле темы (не extras). */
function wantsPresentation(s: string): boolean {
  if (!/презентаци/i.test(s)) return false;
  return (
    /слайд/i.test(s) ||
    /(?:состав|сделай|созда|подготов|напиш).{0,20}презентаци/i.test(s)
  );
}

export type TopicPrepareResult =
  | { ok: true; topic: string }
  | { ok: false; message: string };

/**
 * Мягкая подготовка темы: чистим без лишних вопросов, блокируем только очевидный мусор.
 */
export function prepareTopic(raw: string): TopicPrepareResult {
  const original = raw.trim();
  if (!original) {
    return { ok: false, message: "Укажите тему работы" };
  }

  if (wantsPresentation(original)) {
    return {
      ok: false,
      message:
        "Презентацию можно заказать отдельно после готовой работы. Здесь укажите только тему — одной фразой.",
    };
  }

  if (countNumberedItems(original) >= 2) {
    return {
      ok: false,
      message:
        "Похоже на список заданий. Напишите только тему, например: «История и символика населённого пункта».",
    };
  }

  const topic = normalizeTopic(original);
  if (topic.length < TOPIC_MIN_LEN) {
    return {
      ok: false,
      message: "Тема слишком короткая — добавьте чуть подробнее, одной фразой.",
    };
  }

  return { ok: true, topic };
}
