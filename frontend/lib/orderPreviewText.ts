const SKIP_SECTION = /^(введение|заключение|список\s+литературы|литература|кіріспе|қорытынды|introduction|conclusion|sources?|references?|bibliography)$/i;

/** Убирает нумерацию документа: «1.1. Текст» → «Текст». */
export function stripLeadingNumber(raw: string): string {
  const s = String(raw ?? "").trim();
  const stripped = s
    .replace(/^\d+(?:\.\d+)*\.?\s*/, "")
    .replace(/^(?:глава|chapter|б(?:ө|о)лім)\s*\d+\.?\s*/i, "")
    .trim();
  return stripped || s;
}

export function isBibliographySection(title: string): boolean {
  return SKIP_SECTION.test(String(title ?? "").trim());
}

/** Пункты оглавления без служебных разделов и дублей. */
export function tocDisplayItems(structure: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of structure) {
    const raw = String(item ?? "").trim();
    if (!raw || isBibliographySection(raw)) continue;
    const label = stripLeadingNumber(raw);
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/** Разделы для превью текста (без списка литературы и пустых). */
export function previewBodySections(
  structure: string[],
  content: Record<string, string>,
): string[] {
  return structure.filter((section) => {
    const raw = String(section ?? "").trim();
    if (!raw || isBibliographySection(raw)) return false;
    return Boolean(content[section]?.trim());
  });
}

/** Источник без «1. » в начале — для списка с автонумерацией. */
export function sourceDisplayLine(src: string): string {
  return String(src ?? "")
    .trim()
    .replace(/^\d+\.\s*/, "")
    .trim();
}
