/** Заголовки для вызовов FastAPI только с Next.js (не с публичного интернета). */
export function internalApiHeaders(extra?: HeadersInit): HeadersInit {
  const token = process.env.INTERNAL_API_SECRET || process.env.PROXY_SECRET;
  return {
    ...(extra ?? {}),
    ...(token ? { "X-Internal-Token": token } : {}),
  };
}
