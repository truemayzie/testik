"use client";

import { useEffect, useState, useCallback } from "react";
import styles from "../admin.module.css";

type Check = {
  id: string;
  checkedAt: string;
  frontend: boolean;
  backend: boolean;
  database: boolean;
  groq: boolean;
  details: string | null;
};

function Dot({ ok }: { ok: boolean }) {
  return (
    <span style={{
      display: "inline-block",
      width: 12, height: 12,
      borderRadius: "50%",
      background: ok ? "#22C55E" : "#EF4444",
      boxShadow: ok ? "0 0 6px #22C55E88" : "0 0 6px #EF444488",
      flexShrink: 0,
    }} title={ok ? "OK" : "ERROR"} />
  );
}

export default function HealthPage() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/health");
      if (res.ok) setChecks(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  async function runNow() {
    setRunning(true);
    try {
      await fetch("/api/admin/health", { method: "POST" });
      await load();
    } finally {
      setRunning(false);
    }
  }

  const latest = checks[0];

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Статус системы</h1>
        <p className={styles.pageSubtitle}>Проверки каждые 5 минут</p>
      </div>

      <div className={styles.pageBody}>
        {/* Текущий статус */}
        {latest && (
          <div style={{
            display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24,
          }}>
            {(["frontend","backend","database","groq"] as const).map(key => {
              const labels: Record<string, string> = {
                frontend: "Фронтенд", backend: "Бэкенд",
                database: "База данных", groq: "Claude API",
              };
              const ok = latest[key];
              return (
                <div key={key} style={{
                  background: "#fff", borderRadius: 12, padding: "16px 20px",
                  display: "flex", alignItems: "center", gap: 10,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)", minWidth: 140,
                }}>
                  <Dot ok={ok} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "#0F172A" }}>
                      {labels[key]}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: ok ? "#22C55E" : "#EF4444", fontWeight: 500 }}>
                      {ok ? "Работает" : "Ошибка"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Кнопка проверки */}
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={runNow}
            disabled={running}
            style={{
              padding: "9px 20px", borderRadius: 10, border: "none",
              background: "#1B3A6B",
              color: "#fff", fontWeight: 600, fontSize: "0.9rem",
              cursor: running ? "not-allowed" : "pointer", opacity: running ? 0.7 : 1,
            }}
          >
            {running ? "Проверяем..." : "Проверить сейчас"}
          </button>
        </div>

        {/* Таблица */}
        {loading ? (
          <div className={styles.loading}><div className={styles.spinner} /> Загрузка...</div>
        ) : checks.length === 0 ? (
          <p style={{ color: "#64748B" }}>Нет данных. Первая проверка запустится через ~10 секунд после старта сервера.</p>
        ) : (
          <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                  {["Время", "Фронтенд", "Бэкенд", "База данных", "Groq API", "Детали"].map(h => (
                    <th key={h} style={{
                      padding: "12px 16px", textAlign: "left",
                      fontWeight: 600, color: "#64748B", fontSize: "0.8rem",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {checks.map((c, i) => {
                  const errs = c.details ? (() => { try { return JSON.parse(c.details!); } catch { return {}; } })() : {};
                  return (
                    <tr key={c.id} style={{
                      borderBottom: i < checks.length - 1 ? "1px solid #F1F5F9" : "none",
                      background: i % 2 === 0 ? "#fff" : "#FAFAFA",
                    }}>
                      <td style={{ padding: "10px 16px", color: "#334155", whiteSpace: "nowrap" }}>
                        {new Date(c.checkedAt).toLocaleString("ru-RU", {
                          day: "2-digit", month: "2-digit",
                          hour: "2-digit", minute: "2-digit", second: "2-digit",
                        })}
                      </td>
                      {(["frontend","backend","database","groq"] as const).map(k => (
                        <td key={k} style={{ padding: "10px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <Dot ok={c[k]} />
                            <span style={{ color: c[k] ? "#22C55E" : "#EF4444", fontWeight: 500 }}>
                              {c[k] ? "OK" : "ERR"}
                            </span>
                          </div>
                        </td>
                      ))}
                      <td style={{ padding: "10px 16px", color: "#64748B", fontSize: "0.78rem", maxWidth: 300 }}>
                        {Object.entries(errs).map(([k, v]) => (
                          <div key={k} style={{ color: "#EF4444" }}>
                            <strong>{k}:</strong> {String(v).slice(0, 120)}
                          </div>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
