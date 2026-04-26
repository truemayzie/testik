"use client";

import { useEffect, useState, useCallback } from "react";
import styles from "../admin.module.css";

const ALL_ISSUES = ["Структура", "Объём", "Оформление", "Содержание", "Другое"];

type FeedbackItem = {
  id:        string;
  createdAt: string;
  issues:    string[];
  comment:   string | null;
  topic:     string;
  workType:  string;
  rating:    number | null;
  userEmail: string | null;
  userName:  string | null;
};

type PageData = {
  items: FeedbackItem[];
  total: number;
  page:  number;
  pages: number;
};

function Stars({ rating }: { rating: number | null }) {
  if (!rating) return <span style={{ color: "#475569" }}>—</span>;
  return (
    <span style={{ color: "#C9962A", letterSpacing: 1, fontSize: "1rem" }} title={`${rating}/5`}>
      {"★".repeat(rating)}{"☆".repeat(5 - rating)}
    </span>
  );
}

export default function AdminFeedback() {
  const [data, setData]       = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);
  const [issue, setIssue]     = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page) });
    if (issue) p.set("issue", issue);
    fetch(`/api/admin/feedback?${p}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [page, issue]);

  useEffect(() => { load(); }, [load]);

  const fmt = (d: string) =>
    new Date(d).toLocaleString("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Отзывы</h1>
        <p className={styles.pageSubtitle}>Детальная обратная связь от пользователей</p>
      </div>

      <div className={styles.pageBody}>
        <div className={styles.toolbar}>
          <select
            className={styles.filterInput}
            value={issue}
            onChange={e => { setIssue(e.target.value); setPage(1); }}
          >
            <option value="">Все проблемы</option>
            {ALL_ISSUES.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
          <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} onClick={() => { setPage(1); load(); }}>
            Применить
          </button>
          {data && (
            <span className={styles.toolbarCount}>{data.total} отзывов</span>
          )}
        </div>

        <div className={styles.tableWrap}>
          {loading ? (
            <div className={styles.loading}><div className={styles.spinner}/> Загружаем...</div>
          ) : !data || data.items.length === 0 ? (
            <div style={{ padding: "48px 0", textAlign: "center", color: "#475569" }}>Отзывов пока нет</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Пользователь</th>
                  <th>Работа</th>
                  <th>Тип</th>
                  <th style={{ textAlign: "center" }}>Оценка</th>
                  <th>Проблемы</th>
                  <th>Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(item => (
                  <tr key={item.id}>
                    <td style={{ whiteSpace: "nowrap", fontSize: "0.8rem" }} suppressHydrationWarning>
                      {fmt(item.createdAt)}
                    </td>
                    <td>
                      <div className={styles.userName}>{item.userName || "—"}</div>
                      <div className={styles.userEmail}>{item.userEmail || "—"}</div>
                    </td>
                    <td>
                      <div className={styles.topicCell} title={item.topic}>{item.topic}</div>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${styles.badgeAdmin}`}>{item.workType}</span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <Stars rating={item.rating} />
                    </td>
                    <td>
                      {item.issues.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {item.issues.map(iss => (
                            <span
                              key={iss}
                              style={{
                                background: "rgba(239,68,68,0.12)",
                                color: "#FCA5A5",
                                borderRadius: 4, padding: "2px 7px",
                                fontSize: "0.75rem", fontWeight: 600,
                              }}
                            >
                              {iss}
                            </span>
                          ))}
                        </div>
                      ) : <span style={{ color: "#475569" }}>—</span>}
                    </td>
                    <td style={{ maxWidth: 260 }}>
                      {item.comment
                        ? <span style={{ color: "#CBD5E1", fontSize: "0.85rem", lineHeight: 1.5 }}>{item.comment}</span>
                        : <span style={{ color: "#475569" }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Пагинация */}
        {data && data.pages > 1 && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 20 }}>
            <button
              className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >← Назад</button>
            <span style={{ color: "#94A3B8", lineHeight: "34px", fontSize: "0.875rem" }}>
              Стр. {page} из {data.pages}
            </span>
            <button
              className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
              disabled={page >= data.pages}
              onClick={() => setPage(p => p + 1)}
            >Вперёд →</button>
          </div>
        )}
      </div>
    </>
  );
}
