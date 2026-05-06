"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // При частых деплоях иногда всплывает рассинхрон server actions.
    // Самый надёжный UX — попросить браузер подтянуть свежий бандл.
    const msg = String(error?.message || "");
    if (msg.includes("Failed to find Server Action")) {
      const t = setTimeout(() => window.location.reload(), 300);
      return () => clearTimeout(t);
    }
  }, [error]);

  return (
    <html>
      <body style={{
        margin: 0,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
        background: "#f7f7fb",
        color: "#111827",
      }}>
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{
            maxWidth: 520,
            width: "100%",
            background: "#fff",
            borderRadius: 18,
            padding: 22,
            boxShadow: "0 24px 64px rgba(0,0,0,0.12)",
            border: "1px solid #e5e7eb",
          }}>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Что‑то пошло не так</div>
            <div style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
              Обычно помогает обновление страницы — особенно после обновления сайта.
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: "#6366f1",
                  color: "#fff",
                  border: "none",
                  borderRadius: 12,
                  padding: "10px 14px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Обновить страницу
              </button>
              <button
                onClick={() => reset()}
                style={{
                  background: "#f3f4f6",
                  color: "#111827",
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: "10px 14px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Попробовать снова
              </button>
            </div>
            <div style={{ marginTop: 12, color: "#9ca3af", fontSize: 12 }}>
              {error?.digest ? `Код: ${error.digest}` : null}
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

