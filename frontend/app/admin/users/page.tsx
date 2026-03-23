"use client";

import { useEffect, useState, useCallback } from "react";
import styles from "../admin.module.css";

type User = {
  id: string; name: string | null; email: string | null;
  image: string | null; createdAt: string;
  role: string; banned: boolean;
  genCount: number; totalSpent: number;
};

function Avatar({ user }: { user: User }) {
  if (user.image) {
    return <img src={user.image} alt="" className={styles.userAvatar} />;
  }
  const letter = (user.name || user.email || "?")[0].toUpperCase();
  return <div className={styles.userAvatarPlaceholder}>{letter}</div>;
}

export default function AdminUsers() {
  const [users, setUsers]   = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback((q = search) => {
    setLoading(true);
    fetch(`/api/admin/users?search=${encodeURIComponent(q)}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setUsers(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [search]);

  useEffect(() => { load(""); }, []); // eslint-disable-line

  const action = async (id: string, act: string) => {
    setPending(id + act);
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: act }),
    });
    await load(search);
    setPending(null);
  };

  const fmt = (d: string) => new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Пользователи</h1>
        <p className={styles.pageSubtitle}>Управление аккаунтами</p>
      </div>

      <div className={styles.pageBody}>
        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              className={styles.searchInput}
              placeholder="Поиск по имени или email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && load(search)}
            />
          </div>
          <button className={styles.actionBtn + " " + styles.actionBtnPrimary} onClick={() => load(search)}>
            Найти
          </button>
          <span className={styles.toolbarCount}>{users.length} польз.</span>
        </div>

        <div className={styles.tableWrap}>
          {loading ? (
            <div className={styles.loading}><div className={styles.spinner}/> Загружаем...</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Пользователь</th>
                  <th>Дата регистрации</th>
                  <th>Работ</th>
                  <th>Потрачено</th>
                  <th>Роль</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr className={styles.emptyRow}><td colSpan={7}>Пользователи не найдены</td></tr>
                ) : users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className={styles.userCell}>
                        <Avatar user={u} />
                        <div>
                          <div className={styles.userName}>{u.name || "—"}</div>
                          <div className={styles.userEmail}>{u.email || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td suppressHydrationWarning>{fmt(u.createdAt)}</td>
                    <td>{u.genCount}</td>
                    <td>{u.totalSpent > 0 ? `${u.totalSpent} ₽` : "—"}</td>
                    <td>
                      <span className={`${styles.badge} ${u.role === "admin" ? styles.badgeAdmin : styles.badgeUser}`}>
                        {u.role === "admin" ? "Админ" : "Юзер"}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${u.banned ? styles.badgeBanned : styles.badgeActive}`}>
                        {u.banned ? "Забанен" : "Активен"}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actionsCell}>
                        {u.banned ? (
                          <button
                            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                            disabled={pending === u.id + "unban"}
                            onClick={() => action(u.id, "unban")}
                          >
                            Разбанить
                          </button>
                        ) : (
                          <button
                            className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                            disabled={pending === u.id + "ban"}
                            onClick={() => action(u.id, "ban")}
                          >
                            Забанить
                          </button>
                        )}
                        {u.role === "admin" ? (
                          <button
                            className={`${styles.actionBtn} ${styles.actionBtnWarning}`}
                            disabled={pending === u.id + "removeAdmin"}
                            onClick={() => action(u.id, "removeAdmin")}
                          >
                            Снять права
                          </button>
                        ) : (
                          <button
                            className={`${styles.actionBtn} ${styles.actionBtnGhost}`}
                            disabled={pending === u.id + "makeAdmin"}
                            onClick={() => action(u.id, "makeAdmin")}
                          >
                            Сделать админом
                          </button>
                        )}
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
