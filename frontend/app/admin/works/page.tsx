"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import styles from "../admin.module.css";

type Work = {
  id: string; topic: string; workType: string;
  pages: number; status: string; createdAt: string;
  slug: string | null; amount: number | null; rating: number | null;
  user: { id: string; name: string | null; email: string | null; image: string | null };
};

export default function AdminWorks() {
  const [works, setWorks]     = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (search)   p.set("search", search);
    if (dateFrom) p.set("from", dateFrom);
    if (dateTo)   p.set("to",   dateTo);
    fetch(`/api/admin/works?${p}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setWorks(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [search, dateFrom, dateTo]);

  useEffect(() => { load(); }, []); // eslint-disable-line

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить работу? Это действие необратимо.")) return;
    setDeleting(id);
    await fetch(`/api/admin/works/${id}`, { method: "DELETE" });
    setWorks(w => w.filter(x => x.id !== id));
    setDeleting(null);
  };

  const fmt = (d: string) =>
    new Date(d).toLocaleString("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Работы</h1>
        <p className={styles.pageSubtitle}>Все сгенерированные работы</p>
      </div>

      <div className={styles.pageBody}>
        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              className={styles.searchInput}
              placeholder="Поиск по теме..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && load()}
            />
          </div>
          <input type="date" className={styles.filterInput} value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="Дата от" />
          <input type="date" className={styles.filterInput} value={dateTo}   onChange={e => setDateTo(e.target.value)}   title="Дата до" />
          <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} onClick={load}>Применить</button>
          <span className={styles.toolbarCount}>{works.length} работ</span>
        </div>

        <div className={styles.tableWrap}>
          {loading ? (
            <div className={styles.loading}><div className={styles.spinner}/> Загружаем...</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Автор</th>
                  <th>Тема</th>
                  <th>Тип</th>
                  <th>Стр.</th>
                  <th>Оплата</th>
                  <th>Статус</th>
                  <th>Дата</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {works.length === 0 ? (
                  <tr className={styles.emptyRow}><td colSpan={8}>Работы не найдены</td></tr>
                ) : works.map(w => (
                  <tr key={w.id}>
                    <td>
                      <div className={styles.userCell}>
                        {w.user.image
                          ? <img src={w.user.image} alt="" className={styles.userAvatar}/>
                          : <div className={styles.userAvatarPlaceholder}>
                              {(w.user.name || w.user.email || "?")[0].toUpperCase()}
                            </div>
                        }
                        <div>
                          <div className={styles.userName}>{w.user.name || "—"}</div>
                          <div className={styles.userEmail}>{w.user.email || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className={styles.topicCell} title={w.topic}>{w.topic}</div>
                      {w.rating != null && (
                        <span style={{
                          display: "inline-block", marginTop: 3,
                          color: "#C9962A", fontSize: "0.78rem", fontWeight: 700,
                        }}>
                          {"★".repeat(w.rating)} {w.rating}/5
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${styles.badgeAdmin}`}>{w.workType}</span>
                    </td>
                    <td>{w.pages}</td>
                    <td>{w.amount != null ? `${w.amount} ₽` : "—"}</td>
                    <td>
                      <span className={`${styles.badge} ${w.status === "completed" ? styles.badgeSuccess : styles.badgeFailed}`}>
                        {w.status === "completed" ? "Готово" : w.status}
                      </span>
                    </td>
                    <td suppressHydrationWarning style={{ whiteSpace: "nowrap", fontSize: "0.8rem" }}>{fmt(w.createdAt)}</td>
                    <td>
                      <div className={styles.actionsCell}>
                        {w.slug && (
                          <Link href={`/preview/${w.slug}`} target="_blank" className={styles.tableLink}>
                            Открыть →
                          </Link>
                        )}
                        <a
                          href={`/api/admin/works/${w.id}/download`}
                          download
                          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
                          title="Скачать DOCX"
                        >
                          ↓ DOCX
                        </a>
                        <button
                          className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                          disabled={deleting === w.id}
                          onClick={() => handleDelete(w.id)}
                        >
                          {deleting === w.id ? "…" : "Удалить"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
