/** Встроенные темы и шаблоны Presenton (docs.presenton.ai) */

export type PresentonThemeId =
  | "professional-blue"
  | "professional-dark"
  | "mint-blue"
  | "edge-yellow"
  | "light-rose";

export type PresentonTemplateId = "general" | "modern" | "standard" | "swift";

export type PresentonThemeColors = {
  primary: string;
  panel: string;
  border: string;
  accent?: string;
};

export const PRESENTON_THEMES: {
  id: PresentonThemeId;
  label: string;
  labelRu: string;
  description: string;
  swatch: string;
  colors: PresentonThemeColors;
  /** Шрифт заголовков в этой палитре (как в Presenton) */
  fontHeading: string;
  fontBody: string;
}[] = [
  {
    id: "professional-blue",
    label: "Professional Blue",
    labelRu: "Синий академический",
    description: "Классический синий — для рефератов и докладов.",
    swatch: "#1E3A5F",
    colors: { primary: "#1E3A5F", panel: "#F0F4F8", border: "#CBD5E1", accent: "#3B82F6" },
    fontHeading: "Inter",
    fontBody: "Inter",
  },
  {
    id: "professional-dark",
    label: "Professional Dark",
    labelRu: "Тёмный профи",
    description: "Тёмные заголовки, светлый фон слайда.",
    swatch: "#0F172A",
    colors: { primary: "#0F172A", panel: "#F1F5F9", border: "#CBD5E1", accent: "#64748B" },
    fontHeading: "Inter",
    fontBody: "Inter",
  },
  {
    id: "mint-blue",
    label: "Mint Blue",
    labelRu: "Мятный",
    description: "Свежий бирюзовый акцент.",
    swatch: "#0D9488",
    colors: { primary: "#0D9488", panel: "#F0FDFA", border: "#99F6E4", accent: "#14B8A6" },
    fontHeading: "Inter",
    fontBody: "Inter",
  },
  {
    id: "edge-yellow",
    label: "Edge Yellow",
    labelRu: "Жёлтый акцент",
    description: "Тёплый жёлтый на светлом фоне.",
    swatch: "#CA8A04",
    colors: { primary: "#CA8A04", panel: "#FFFBEB", border: "#FDE68A", accent: "#EAB308" },
    fontHeading: "Inter",
    fontBody: "Inter",
  },
  {
    id: "light-rose",
    label: "Light Rose",
    labelRu: "Розовый",
    description: "Мягкий розовый для гуманитарных тем.",
    swatch: "#BE185D",
    colors: { primary: "#BE185D", panel: "#FDF2F8", border: "#FBCFE8", accent: "#EC4899" },
    fontHeading: "Inter",
    fontBody: "Inter",
  },
];

export const PRESENTON_TEMPLATES: {
  id: PresentonTemplateId;
  label: string;
  labelRu: string;
  description: string;
  layoutCount: number;
  previewAccent: string;
  fontHeading: string;
  fontBody: string;
  fontHeadingFamily: string;
  fontBodyFamily: string;
}[] = [
  {
    id: "general",
    label: "General",
    labelRu: "Универсальный",
    description: "Заголовки, списки, графики — подходит для любой работы.",
    layoutCount: 12,
    previewAccent: "#7C3AED",
    fontHeading: "Inter",
    fontBody: "Inter",
    fontHeadingFamily: "'Inter', system-ui, sans-serif",
    fontBodyFamily: "'Inter', system-ui, sans-serif",
  },
  {
    id: "modern",
    label: "Modern",
    labelRu: "Современный",
    description: "Две колонки, крупные заголовки, бизнес-стиль.",
    layoutCount: 9,
    previewAccent: "#1E40AF",
    fontHeading: "Inter",
    fontBody: "Inter",
    fontHeadingFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
    fontBodyFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
  },
  {
    id: "standard",
    label: "Standard",
    labelRu: "Классический",
    description: "Serif-заголовки, много текста и фото на слайде.",
    layoutCount: 11,
    previewAccent: "#059669",
    fontHeading: "Georgia",
    fontBody: "Arial",
    fontHeadingFamily: "Georgia, 'Times New Roman', serif",
    fontBodyFamily: "Arial, Helvetica, sans-serif",
  },
  {
    id: "swift",
    label: "Swift",
    labelRu: "Компактный",
    description: "Плотная вёрстка, короткие блоки — быстрый ритм.",
    layoutCount: 5,
    previewAccent: "#0891B2",
    fontHeading: "DM Sans",
    fontBody: "DM Sans",
    fontHeadingFamily: "'DM Sans', 'Segoe UI', sans-serif",
    fontBodyFamily: "'DM Sans', 'Segoe UI', sans-serif",
  },
];

export function getPresentonThemeColors(themeId: string): PresentonThemeColors {
  return PRESENTON_THEMES.find(t => t.id === themeId)?.colors ?? PRESENTON_THEMES[0].colors;
}

export function getPresentonSwatch(themeId: string): string {
  return getPresentonThemeColors(themeId).primary;
}

export function getPresentonTheme(themeId: string) {
  return PRESENTON_THEMES.find(t => t.id === themeId) ?? PRESENTON_THEMES[0];
}

export function getPresentonTemplate(templateId: string) {
  return PRESENTON_TEMPLATES.find(t => t.id === templateId) ?? PRESENTON_TEMPLATES[0];
}

/** Для PPTX-рендера (legacy поле accent в JSON) */
export function themeToRefaiAccent(themeId: string): string {
  const map: Record<string, string> = {
    "professional-blue": "blue",
    "professional-dark": "blue",
    "mint-blue": "green",
    "edge-yellow": "blue",
    "light-rose": "blue",
  };
  return map[themeId] ?? "blue";
}
