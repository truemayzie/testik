import type { PreviewPayload } from "@/lib/paymentPreviewClient";

export type PreviewTocRow = PreviewPayload["toc"][number];

export const STRUCTURE_WORK_TYPES = new Set(["Доклад", "Реферат", "Курсовая", "ВКР"]);

export function supportsPreviewStructure(workType: string): boolean {
  return STRUCTURE_WORK_TYPES.has(workType);
}

/** Преобразует строку TOC превью в элемент structure для backend generator. */
export function tocRowToStructureItem(row: PreviewTocRow): string {
  const title = row.title.trim();
  if (!title) return "";
  const num = (row.num ?? "").trim();
  if (!num) return title;
  if (/^\d+\.\d+$/.test(num)) return `${num}. ${title}`;
  if (/^\d+$/.test(num)) return `${num}. ${title}`;
  return title;
}

export function tocToStructure(toc: PreviewTocRow[]): string[] {
  return toc.map(tocRowToStructureItem).filter(Boolean);
}

/** Служебные строки оглавления (без num): введение, заключение, список литературы. */
export function isLockedTocRow(row: PreviewTocRow): boolean {
  return !(row.num ?? "").trim();
}

function structureStorageKey(taskId: string): string {
  return `refai_preview_structure_${taskId}`;
}

export function savePreviewStructureForTask(taskId: string, structure: string[]): void {
  if (!taskId || structure.length < 2) return;
  try {
    sessionStorage.setItem(structureStorageKey(taskId), JSON.stringify(structure));
  } catch {
    /* ignore */
  }
}

export function loadPreviewStructureForTask(taskId: string): string[] | null {
  if (!taskId) return null;
  try {
    const raw = sessionStorage.getItem(structureStorageKey(taskId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const structure = parsed
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30);
    return structure.length >= 2 ? structure : null;
  } catch {
    return null;
  }
}

export function clearPreviewStructureForTask(taskId: string): void {
  if (!taskId) return;
  try {
    sessionStorage.removeItem(structureStorageKey(taskId));
  } catch {
    /* ignore */
  }
}
