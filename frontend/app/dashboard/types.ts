export type Generation = {
  id: string;
  topic: string;
  pages: number;
  workType: string;
  status: string;
  createdAt: string;
  slug: string | null;
  isPublic: boolean;
  extras: string | null; // JSON: {"presentation":"job_id","speech":"job_id"}
};

export type PendingOrder = {
  id: string;
  topic: string;
  pages: number;
  workType: string;
  createdAt: string;
  status: "awaiting_payment";
};

export type ReferatResult = {
  title: string;
  structure: string[];
  content: Record<string, string>;
  sources: string[];
  meta: Record<string, string | number>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile?: Record<string, any>;
};

export type PresentationSlides = {
  accent?: string;
  slides?: unknown[];
  provider?: string;
};

export type ExtrasData = {
  presentation?: string;
  speech?: string;
  presentationSlides?: PresentationSlides;
  _taskId?: string;
};

export type ViewingGen = {
  id: string;
  topic: string;
  workType: string;
  pages: number;
  slug: string | null;
  isPublic: boolean;
  extras: ExtrasData | null;
  result: ReferatResult;
};

export type TitleForm = {
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

export const DOC_WIDTH = 816;

export const TITLE_PAGE_TYPES = ["Реферат", "Курсовая", "ВКР", "Доклад"];

/** Типы, для которых доступны презентация и текст выступления */
export const WORK_TYPES_WITHOUT_EXTRAS = new Set(["Сочинение", "Эссе"]);

export function supportsExtras(workType: string) {
  return !WORK_TYPES_WITHOUT_EXTRAS.has(workType);
}
