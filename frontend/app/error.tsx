"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const msg = String(error?.message || "");
    if (msg.includes("Failed to find Server Action")) {
      const t = setTimeout(() => window.location.reload(), 300);
      return () => clearTimeout(t);
    }
  }, [error]);

  return (
    <div style={{
      minHeight: "70vh",
      display: "grid",
      placeItems: "center",
      padding: 24,
    }}>
      <div style={{ maxWidth: 520, width: "100%", background: "#fff", borderRadius: 18, padding: 20, border: "1px solid #e5e7eb" }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Ошибка на странице</div>
        <div style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
          Нажми «Обновить» — чаще всего проблема исчезает сразу.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => window.location.reload()}
            style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: 12, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
          >
            Обновить
          </button>
          <button
            onClick={() => reset()}
            style={{ background: "#f3f4f6", color: "#111827", border: "1px solid #e5e7eb", borderRadius: 12, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
          >
            Повторить
          </button>
        </div>
      </div>
    </div>
  );
}

