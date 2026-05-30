export type Bullet = { bold?: string; text?: string } | string;
export type StatItem = { num: string; desc: string };
export type ConclusionItem = { title: string; text?: string } | string;

export type IonSlide = {
  type: "TITLE" | "TOC" | "CONTENT" | "CONCLUSION" | "FINAL" | string;
  title?: string;
  work_type?: string;
  university?: string;
  faculty?: string;
  department?: string;
  full_name?: string;
  group?: string;
  teacher?: string;
  city?: string;
  year?: string;
  heading?: string;
  items?: (string | ConclusionItem)[];
  slide_num?: number;
  total?: number;
  topic?: string;
  bullets?: Bullet[];
  stats?: StatItem[];
};

export type PresentationSlidesPayload = {
  slides?: unknown;
  accent?: string;
};

/** Массив слайдов из extras.presentationSlides (объект, строка JSON или legacy-формат). */
export function extractSlidesFromPresentationSlides(raw: unknown): IonSlide[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw as IonSlide[];
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t.startsWith("{") && !t.startsWith("[")) return null;
    try {
      return extractSlidesFromPresentationSlides(JSON.parse(t) as unknown);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") {
    const s = (raw as { slides?: unknown }).slides;
    if (Array.isArray(s)) return s as IonSlide[];
  }
  return null;
}

export function slideStructureLabel(sl: IonSlide): string {
  const t = (sl.type || "").toUpperCase();
  if (t === "TOC") return "Структура презентации";
  if (t === "CONCLUSION") return "Выводы";
  if (t === "FINAL") return "Завершение";
  if (t === "TITLE") return "Титульный слайд";
  return sl.heading?.trim() || "Слайд";
}
