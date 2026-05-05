/** Публичный origin сайта для абсолютных ссылок в админке и API. */
export function getSiteOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://ref-ai.ru").replace(/\/$/, "");
}

export function absolutePublicUrl(path: string): string {
  const base = getSiteOrigin();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/** Нормализует абсолютный URL без хеша (дубликаты с/без завершающего слэша в path). */
export function normalizeIndexUrl(fullUrl: string): string {
  try {
    const u = new URL(fullUrl.trim());
    u.hash = "";
    const proto = u.protocol.toLowerCase();
    const host = u.hostname.toLowerCase();
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    const search = u.search || "";
    return `${proto}//${host}${path}${search}`;
  } catch {
    return fullUrl.trim();
  }
}

export function canonicalPublicUrl(path: string): string {
  return normalizeIndexUrl(absolutePublicUrl(path));
}
