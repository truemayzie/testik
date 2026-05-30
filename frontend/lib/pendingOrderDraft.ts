export const PENDING_DRAFT_STORAGE_KEY = "refai_pending_order_draft";
export const PENDING_PREVIEW_FLAG_KEY = "pendingPreviewAfterAuth";
export const PENDING_AUTH_RETURN_KEY = "pendingAuthReturn";

export type PendingOrderDraft = {
  topic: string;
  workType: string;
  pages: number;
  taskId?: string;
  paymentId?: string;
  savedAt?: number;
};

function normalizeDraft(raw: unknown): PendingOrderDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const topic = String(p.topic ?? "").trim();
  const workType = String(p.workType ?? "").trim();
  if (!topic || !workType) return null;
  const pages = Number(p.pages);
  return {
    topic,
    workType,
    pages: Number.isFinite(pages) && pages > 0 ? pages : 0,
    taskId: typeof p.taskId === "string" ? p.taskId : undefined,
    paymentId: typeof p.paymentId === "string" ? p.paymentId : undefined,
    savedAt: typeof p.savedAt === "number" ? p.savedAt : undefined,
  };
}

function readRaw(key: "session" | "local"): string | null {
  try {
    if (key === "session") return sessionStorage.getItem("pendingGeneration");
    return localStorage.getItem(PENDING_DRAFT_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Читает черновик заказа: sessionStorage → localStorage (для magic link в новой вкладке). */
export function loadPendingOrderDraft(): PendingOrderDraft | null {
  for (const source of ["session", "local"] as const) {
    const raw = readRaw(source);
    if (!raw) continue;
    try {
      const draft = normalizeDraft(JSON.parse(raw));
      if (draft) return draft;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function savePendingOrderDraft(draft: PendingOrderDraft): void {
  const payload = { ...draft, savedAt: Date.now() };
  const raw = JSON.stringify(payload);
  try {
    sessionStorage.setItem("pendingGeneration", raw);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(PENDING_DRAFT_STORAGE_KEY, raw);
  } catch {
    /* ignore */
  }
}

export function clearPendingOrderDraft(): void {
  try {
    sessionStorage.removeItem("pendingGeneration");
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(PENDING_DRAFT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function markPendingPreviewAfterAuth(): void {
  try {
    sessionStorage.setItem(PENDING_PREVIEW_FLAG_KEY, "1");
    sessionStorage.setItem(PENDING_AUTH_RETURN_KEY, "1");
    localStorage.setItem(PENDING_PREVIEW_FLAG_KEY, "1");
    localStorage.setItem(PENDING_AUTH_RETURN_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function consumePendingPreviewAfterAuth(): boolean {
  try {
    const flagged =
      sessionStorage.getItem(PENDING_PREVIEW_FLAG_KEY) === "1" ||
      localStorage.getItem(PENDING_PREVIEW_FLAG_KEY) === "1";
    sessionStorage.removeItem(PENDING_PREVIEW_FLAG_KEY);
    sessionStorage.removeItem(PENDING_AUTH_RETURN_KEY);
    localStorage.removeItem(PENDING_PREVIEW_FLAG_KEY);
    localStorage.removeItem(PENDING_AUTH_RETURN_KEY);
    return flagged;
  } catch {
    return false;
  }
}

export function hasPendingPreviewAfterAuth(): boolean {
  try {
    return (
      sessionStorage.getItem(PENDING_PREVIEW_FLAG_KEY) === "1" ||
      localStorage.getItem(PENDING_PREVIEW_FLAG_KEY) === "1"
    );
  } catch {
    return false;
  }
}
