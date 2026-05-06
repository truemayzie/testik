/**
 * Утилита для сохранения состояния генерации в localStorage.
 * Используется для мини-виджета и восстановления прогресса при F5.
 */

export interface GenState {
  active: boolean;
  percent: number;
  stepLabel: string;
  workType: string;
  topic: string;
  pages: number;
  startedAt: number;
  /** id записи Generation в БД (для восстановления и финализации) */
  generationId?: string;
}

const LS_KEY = "refai_gen";
const EV_KEY = "refai:gen";
const MAX_MS  = 25 * 60 * 1000; // 25 минут

export function writeGenState(state: GenState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(EV_KEY));
  } catch {}
}

export function patchGenState(patch: Partial<GenState>): void {
  try {
    const cur = readGenState();
    if (!cur) return;
    const next = { ...cur, ...patch };
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(EV_KEY));
  } catch {}
}

export function readGenState(): GenState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GenState;
    if (Date.now() - s.startedAt > MAX_MS) {
      localStorage.removeItem(LS_KEY);
      return null;
    }
    return s;
  } catch { return null; }
}

export function clearGenState(): void {
  try {
    localStorage.removeItem(LS_KEY);
    window.dispatchEvent(new CustomEvent(EV_KEY));
  } catch {}
}

/** Подписка на изменения состояния (в рамках вкладки и между вкладками). */
export function subscribeGenState(cb: (s: GenState | null) => void): () => void {
  const onEvent   = () => cb(readGenState());
  const onStorage = (e: StorageEvent) => { if (e.key === LS_KEY) cb(readGenState()); };
  window.addEventListener(EV_KEY as keyof WindowEventMap, onEvent);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EV_KEY as keyof WindowEventMap, onEvent);
    window.removeEventListener("storage", onStorage);
  };
}
