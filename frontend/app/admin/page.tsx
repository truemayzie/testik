"use client";

import { useEffect, useState } from "react";
import styles from "./admin.module.css";

type Stats = {
  totalUsers: number;
  generations: { today: number; month: number; all: number };
  revenue:     { today: number; month: number; all: number };
  chart: { date: string; count: number }[];
  feedback: {
    avgRating:    number | null;
    ratedCount:   number;
    feedbackWeek: number;
    topIssues:    { issue: string; count: number }[];
  } | null;
};

function fmt(n: number | undefined | null) {
  return (n ?? 0).toLocaleString("ru-RU");
}

function BarChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const W = 760, H = 160;
  const pad = { top: 12, bottom: 30, left: 8, right: 8 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;
  const bw = Math.floor(cw / data.length) - 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {data.map((d, i) => {
        const bh  = Math.max(2, Math.round((d.count / max) * ch));
        const x   = pad.left + i * (cw / data.length);
        const y   = pad.top + ch - bh;
        const showLabel = i % 5 === 0;
        return (
          <g key={d.date}>
            <rect
              x={x} y={y} width={bw} height={bh}
              fill={d.count > 0 ? "#1B3A6B" : "#DBEAFE"}
              rx="2"
              opacity={d.count > 0 ? 0.9 : 0.5}
            >
              <title>{d.date}: {d.count} работ</title>
            </rect>
            {showLabel && (
              <text
                x={x + bw / 2} y={H - 4}
                textAnchor="middle"
                fontSize="8"
                fill="#94A3B8"
                fontFamily="Golos Text, sans-serif"
              >
                {d.date.slice(5)}
              </text>
            )}
          </g>
        );
      })}
      {/* Max label */}
      <text x={pad.left} y={pad.top + 6} fontSize="8" fill="#CBD5E1" fontFamily="Golos Text, sans-serif">
        {max}
      </text>
    </svg>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(d => {
        if (d?.totalUsers === undefined) throw new Error("bad data");
        setStats(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Дашборд</h1>
        <p className={styles.pageSubtitle}>Общая статистика сервиса</p>
      </div>

      <div className={styles.pageBody}>
        {loading ? (
          <div className={styles.loading}><div className={styles.spinner}/> Загружаем...</div>
        ) : !stats ? (
          <p style={{ color: "#EF4444" }}>Ошибка загрузки</p>
        ) : (
          <>
            {/* Пользователи */}
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Всего пользователей</div>
                <div className={`${styles.statValue} ${styles.statAccent}`}>{fmt(stats.totalUsers)}</div>
              </div>

              <div className={styles.statCard}>
                <div className={styles.statLabel}>Генерации сегодня</div>
                <div className={styles.statValue}>{fmt(stats.generations.today)}</div>
                <div className={styles.statSub}>за месяц: {fmt(stats.generations.month)}</div>
              </div>

              <div className={styles.statCard}>
                <div className={styles.statLabel}>Всего генераций</div>
                <div className={styles.statValue}>{fmt(stats.generations.all)}</div>
              </div>

              <div className={styles.statCard}>
                <div className={styles.statLabel}>Доход сегодня</div>
                <div className={`${styles.statValue} ${styles.statGreen}`}>{fmt(stats.revenue.today)} ₽</div>
                <div className={styles.statSub}>за месяц: {fmt(stats.revenue.month)} ₽</div>
              </div>

              <div className={styles.statCard}>
                <div className={styles.statLabel}>Доход за всё время</div>
                <div className={`${styles.statValue} ${styles.statGreen}`}>{fmt(stats.revenue.all)} ₽</div>
              </div>

              {stats.feedback && (
                <>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Средний рейтинг</div>
                    <div className={styles.statValue} style={{ color: "#C9962A" }}>
                      {stats.feedback.avgRating != null
                        ? <>★ {stats.feedback.avgRating.toFixed(1)}</>
                        : "—"}
                    </div>
                    <div className={styles.statSub}>{fmt(stats.feedback.ratedCount)} оценено</div>
                  </div>

                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Отзывов за 7 дней</div>
                    <div className={styles.statValue}>{fmt(stats.feedback.feedbackWeek)}</div>
                  </div>

                  {stats.feedback.topIssues.length > 0 && (
                    <div className={styles.statCard} style={{ gridColumn: "span 2" }}>
                      <div className={styles.statLabel}>Топ проблем</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                        {stats.feedback.topIssues.map(({ issue, count }) => (
                          <div key={issue} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{
                              background: "rgba(239,68,68,0.12)", color: "#FCA5A5",
                              borderRadius: 4, padding: "2px 8px", fontSize: "0.8rem", fontWeight: 600, flexShrink: 0,
                            }}>{issue}</span>
                            <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{
                                height: "100%", borderRadius: 2,
                                background: "#EF4444",
                                width: `${Math.round((count / (stats.feedback!.topIssues[0]?.count || 1)) * 100)}%`,
                              }}/>
                            </div>
                            <span style={{ color: "#94A3B8", fontSize: "0.8rem", flexShrink: 0 }}>{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* График */}
            <div className={styles.chartCard}>
              <div className={styles.chartTitle}>📈 Генерации по дням — последние 30 дней</div>
              <BarChart data={stats.chart} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
