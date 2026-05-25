/**
 * Клиентское кэширование и единый in-flight запрос превью оплаты:
 * повторное открытие модалки с той же темой/типом не дергает API второй раз
 * и не жжёт лишние токены на бэкенде.
 */

export type PreviewPayload = {
  work_type: string;
  topic: string;
  doc_lang: string;
  has_toc_sheet: boolean;
  toc: { num?: string; title: string; page: string }[];
  excerpt_title: string;
  excerpt: string;
  excerpt_sections?: { title: string; text: string }[];
  locked_section_titles: string[];
};

export type PreviewFetchResult =
  | { ok: true; data: PreviewPayload }
  | { ok: false; status: number; error: string; code?: string };

const MEMORY_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export function previewCacheKey(topic: string, workType: string): string {
  return `${workType}::${topic.trim()}`;
}

type CachedPreviewEntry = { payload: PreviewPayload; savedAt: number };

const memoryPayload = new Map<string, CachedPreviewEntry>();
const inflight = new Map<string, Promise<PreviewFetchResult>>();

function dropStaleMemoryEntry(key: string, entry: CachedPreviewEntry): boolean {
  if (Date.now() - entry.savedAt <= MEMORY_SESSION_TTL_MS) return false;
  memoryPayload.delete(key);
  return true;
}

export function getMemoryPreviewPayload(key: string): PreviewPayload | null {
  const e = memoryPayload.get(key);
  if (!e) return null;
  if (dropStaleMemoryEntry(key, e)) return null;
  return e.payload;
}

/** После успешной оплаты — сброс локальных кэшей превью. */
export function clearPaymentPreviewClientCaches(): void {
  memoryPayload.clear();
  inflight.clear();
  try {
    sessionStorage.removeItem("paymentPreviewCache");
  } catch {
    /* ignore */
  }
}

export function loadPreviewSessionCache(topic: string, workType: string): PreviewPayload | null {
  try {
    const raw = sessionStorage.getItem("paymentPreviewCache");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key: string; data: PreviewPayload; savedAt: number };
    if (parsed.key !== previewCacheKey(topic, workType)) return null;
    if (Date.now() - parsed.savedAt > MEMORY_SESSION_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function savePreviewSessionCache(
  topic: string,
  workType: string,
  data: PreviewPayload,
  savedAt?: number,
): void {
  const at = savedAt ?? Date.now();
  try {
    sessionStorage.setItem(
      "paymentPreviewCache",
      JSON.stringify({ key: previewCacheKey(topic, workType), data, savedAt: at }),
    );
  } catch {
    /* ignore */
  }
}

/** Восстановление из paymentWidgetRestore — то же состояние, что после успешного fetch. */
export function rememberPaymentPreview(topic: string, workType: string, data: PreviewPayload): void {
  const at = Date.now();
  memoryPayload.set(previewCacheKey(topic, workType), { payload: data, savedAt: at });
  savePreviewSessionCache(topic, workType, data, at);
}

/** Один параллельный POST на ключ; успех кладётся в память и sessionStorage даже если модалку уже закрыли. */
export function fetchPaymentPreviewDeduped(topic: string, workType: string): Promise<PreviewFetchResult> {
  const key = previewCacheKey(topic, workType);

  const mem = memoryPayload.get(key);
  if (mem && !dropStaleMemoryEntry(key, mem)) return Promise.resolve({ ok: true, data: mem.payload });

  const sessionCached = loadPreviewSessionCache(topic, workType);
  if (sessionCached) {
    const at = Date.now();
    memoryPayload.set(key, { payload: sessionCached, savedAt: at });
    return Promise.resolve({ ok: true, data: sessionCached });
  }

  let p = inflight.get(key);
  if (!p) {
    p = (async (): Promise<PreviewFetchResult> => {
      try {
        const res = await fetch("/api/generate/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic, workType }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 403 && data.code === "PREVIEW_USED") {
          return {
            ok: false,
            status: 403,
            error: typeof data.error === "string" ? data.error : "Лимит превью исчерпан",
            code: "PREVIEW_USED",
          };
        }
        if (!res.ok) {
          return {
            ok: false,
            status: res.status,
            error: typeof data.error === "string" ? data.error : "Не удалось загрузить превью",
          };
        }
        const payload = data as PreviewPayload;
        const at = Date.now();
        memoryPayload.set(key, { payload, savedAt: at });
        savePreviewSessionCache(topic, workType, payload, at);
        return { ok: true, data: payload };
      } catch {
        return { ok: false, status: 0, error: "Не удалось загрузить превью" };
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
  }
  return p;
}
