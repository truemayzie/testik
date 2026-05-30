/** Цвета слайдов для PresentationViewer */

export const ACCENT_COLOR: Record<string, string> = {
  blue:     "#1E3A5F",
  green:    "#1A3A2A",
  bordeaux: "#3B1A1A",
};

export const PANEL_BG: Record<string, string> = {
  blue:     "#F0F4F8",
  green:    "#F0F4F0",
  bordeaux: "#F8F0F0",
};

export const BORDER_COLOR: Record<string, string> = {
  blue:     "#CBD5E1",
  green:    "#C1D5C1",
  bordeaux: "#D5C1C1",
};

export function accentColor(accent: string) { return ACCENT_COLOR[accent] ?? ACCENT_COLOR.blue; }
export function panelBg(accent: string)     { return PANEL_BG[accent]     ?? PANEL_BG.blue; }
export function borderColor(accent: string) { return BORDER_COLOR[accent]  ?? BORDER_COLOR.blue; }
