/** Публичный origin сайта для абсолютных ссылок в админке и API. */
export function getSiteOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://ref-ai.ru").replace(/\/$/, "");
}

export function absolutePublicUrl(path: string): string {
  const base = getSiteOrigin();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
