"use client";

import { useEffect, useState } from "react";
import styles from "../admin.module.css";

type Payment = {
  id: string; amount: number; status: string;
  workType: string; createdAt: string; yokassaId: string | null;
  user: { id: string; name: string | null; email: string | null; image: string | null };
};

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  succeeded: { label: "Оплачено",  cls: styles.badgeSuccess },
  pending:   { label: "Ожидание", cls: styles.badgePending },
  canceled:  { label: "Отменён",  cls: styles.badgeFailed  },
};

export default function AdminPayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch("/api/admin/payments")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setPayments(Array.isArray(d.payments) ? d.payments : []); setTotal(d.total ?? 0); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const fmt = (d: string) =>
    new Date(d).toLocaleString("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Платежи</h1>
        <p className={styles.pageSubtitle}>История транзакций</p>
      </div>

      <div className={styles.pageBody}>
        <div className={styles.tableWrap}>
          {loading ? (
            <div className={styles.loading}><div className={styles.spinner}/> Загружаем...</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Пользователь</th>
                  <th>Тип работы</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                  <th>Дата</th>
                  <th>ЮКасса ID</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr className={styles.emptyRow}><td colSpan={6}>Платежей нет</td></tr>
                ) : (
                  <>
                    {payments.map(p => {
                      const st = STATUS_MAP[p.status] ?? { label: p.status, cls: styles.badgeUser };
                      return (
                        <tr key={p.id}>
                          <td>
                            <div className={styles.userCell}>
                              {p.user.image
                                ? <img src={p.user.image} alt="" className={styles.userAvatar}/>
                                : <div className={styles.userAvatarPlaceholder}>
                                    {(p.user.name || p.user.email || "?")[0].toUpperCase()}
                                  </div>
                              }
                              <div>
                                <div className={styles.userName}>{p.user.name || "—"}</div>
                                <div className={styles.userEmail}>{p.user.email || "—"}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`${styles.badge} ${styles.badgeAdmin}`}>{p.workType}</span>
                          </td>
                          <td style={{ fontWeight: 600, color: "#22C55E" }}>{p.amount} ₽</td>
                          <td><span className={`${styles.badge} ${st.cls}`}>{st.label}</span></td>
                          <td suppressHydrationWarning style={{ whiteSpace: "nowrap", fontSize: "0.8rem" }}>{fmt(p.createdAt)}</td>
                          <td style={{ fontSize: "0.75rem", color: "#94A3B8", fontFamily: "monospace" }}>
                            {p.yokassaId ?? "dev"}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className={styles.totalRow}>
                      <td colSpan={2}>Итого (успешные платежи)</td>
                      <td>{total.toLocaleString("ru-RU")} ₽</td>
                      <td colSpan={3}></td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
