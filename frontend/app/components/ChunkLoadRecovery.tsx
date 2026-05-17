"use client";

import { useEffect } from "react";

const RELOAD_FLAG = "__refai_chunk_reload";

/**
 * После деплоя в кэше может остаться старый HTML со ссылками на удалённые chunks → 404.
 * Один раз за сессию перезагружаем страницу, чтобы подтянуть актуальный build.
 */
export default function ChunkLoadRecovery() {
  useEffect(() => {
    const tryReload = () => {
      if (sessionStorage.getItem(RELOAD_FLAG)) return;
      sessionStorage.setItem(RELOAD_FLAG, "1");
      window.location.reload();
    };

    const onError = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLScriptElement && t.src?.includes("/_next/static/")) {
        tryReload();
      }
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      const msg =
        typeof r === "object" && r !== null && "message" in r
          ? String((r as { message?: unknown }).message)
          : String(r ?? "");
      if (
        msg.includes("Loading chunk") ||
        msg.includes("ChunkLoadError") ||
        msg.includes("Failed to fetch dynamically imported module")
      ) {
        tryReload();
      }
    };

    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      sessionStorage.removeItem(RELOAD_FLAG);
    }, 8000);
    return () => window.clearTimeout(t);
  }, []);

  return null;
}
