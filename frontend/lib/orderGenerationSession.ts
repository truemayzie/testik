export type OrderGenPhase = "generating" | "done";

export type OrderGenSession = {
  taskId: string;
  topic: string;
  workType: string;
  pages: number;
  extras: string[];
  phase: OrderGenPhase;
  generationId?: string;
  startedAt?: number;
  savedAt?: number;
};

const storageKey = (taskId: string) => `refai_order_gen_${taskId}`;

function normalize(raw: unknown): OrderGenSession | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const taskId = typeof p.taskId === "string" ? p.taskId : "";
  const topic = String(p.topic ?? "").trim();
  const workType = String(p.workType ?? "").trim();
  if (!taskId || !topic || !workType) return null;
  const pages = Number(p.pages);
  const extras = Array.isArray(p.extras)
    ? p.extras.filter((x): x is string => typeof x === "string")
    : [];
  const phase = p.phase === "done" ? "done" : "generating";
  return {
    taskId,
    topic,
    workType,
    pages: Number.isFinite(pages) && pages > 0 ? pages : 20,
    extras,
    phase,
    generationId: typeof p.generationId === "string" ? p.generationId : undefined,
    startedAt: typeof p.startedAt === "number" ? p.startedAt : undefined,
    savedAt: typeof p.savedAt === "number" ? p.savedAt : undefined,
  };
}

export function loadOrderGenSession(taskId: string): OrderGenSession | null {
  for (const store of [sessionStorage, localStorage] as const) {
    try {
      const raw = store.getItem(storageKey(taskId));
      if (!raw) continue;
      const parsed = normalize(JSON.parse(raw));
      if (parsed?.taskId === taskId) return parsed;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function saveOrderGenSession(session: OrderGenSession): void {
  const payload: OrderGenSession = { ...session, savedAt: Date.now() };
  const raw = JSON.stringify(payload);
  try {
    sessionStorage.setItem(storageKey(session.taskId), raw);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(storageKey(session.taskId), raw);
  } catch {
    /* ignore */
  }
}

export function patchOrderGenSession(taskId: string, patch: Partial<OrderGenSession>): void {
  const prev = loadOrderGenSession(taskId);
  if (!prev) return;
  saveOrderGenSession({ ...prev, ...patch, taskId });
}

function orderStartLockKey(taskId: string) {
  return `refai_order_gen_started_${taskId}`;
}

function markOrderGenerationStarted(taskId: string, startedAt: number) {
  try {
    sessionStorage.setItem(orderStartLockKey(taskId), "1");
    sessionStorage.setItem(`${orderStartLockKey(taskId)}_at`, String(startedAt));
  } catch {
    /* ignore */
  }
}

function readOrderGenerationStartedAt(taskId: string): number | undefined {
  try {
    const raw = sessionStorage.getItem(`${orderStartLockKey(taskId)}_at`);
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

function clearOrderGenerationStartLock(taskId: string) {
  try {
    sessionStorage.removeItem(orderStartLockKey(taskId));
    sessionStorage.removeItem(`${orderStartLockKey(taskId)}_at`);
  } catch {
    /* ignore */
  }
}

export function clearOrderGenSession(taskId: string): void {
  clearOrderGenerationStartLock(taskId);
  const key = storageKey(taskId);
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function markOrderGenerationStartedForTask(taskId: string, startedAt: number) {
  markOrderGenerationStarted(taskId, startedAt);
}

export function readOrderGenerationStartedAtForTask(taskId: string): number | undefined {
  return readOrderGenerationStartedAt(taskId);
}

/** Найти taskId заказа по generationId (localStorage/sessionStorage). */
export function findOrderTaskIdByGenerationId(generationId: string): string | null {
  if (!generationId) return null;
  for (const store of [sessionStorage, localStorage] as const) {
    try {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (!key?.startsWith("refai_order_gen_")) continue;
        const raw = store.getItem(key);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as { taskId?: string; generationId?: string };
          if (parsed.generationId === generationId && typeof parsed.taskId === "string") {
            return parsed.taskId;
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}
