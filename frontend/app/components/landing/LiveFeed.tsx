"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../../page.module.css";

const TYPE_COLORS: Record<string, string> = {
  "Сочинение": "#1D5CFF",
  "Эссе":      "#0F3D99",
  "Доклад":    "#0FA968",
  "Реферат":   "#1D5CFF",
  "Курсовая":  "#0F3D99",
  "ВКР":       "#0F3D99",
};

type FeedItem = {
  id: string;
  workType: string;
  topic: string;
  createdAt: number;
  fresh: boolean;
};

type ApiItem = {
  id: string;
  topic: string;
  workType: string;
  createdAt: string;
};

function formatAgo(ms: number): string {
  const minutes = Math.floor((Date.now() - ms) / 60_000);
  if (minutes < 1) return "только что";
  if (minutes === 1) return "1 мин назад";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1 ч назад";
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

/** Показываем свежие элементы: если реальных данных нет — лента просто не рендерится. */
export default function LiveFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const cursorRef = useRef(0);
  const poolRef = useRef<ApiItem[]>([]);
  const [, setTick] = useState(0);

  // Загрузка реальных анонимных тем
  useEffect(() => {
    let cancelled = false;
    fetch("/api/generations/recent?take=48", { cache: "no-store" })
      .then(r => r.json())
      .then((data: unknown) => {
        if (cancelled || !Array.isArray(data)) return;
        const parsed: ApiItem[] = data.filter(
          (w): w is ApiItem =>
            typeof w === "object" &&
            w !== null &&
            typeof (w as ApiItem).id === "string" &&
            typeof (w as ApiItem).topic === "string" &&
            (w as ApiItem).topic.trim().length > 0 &&
            typeof (w as ApiItem).workType === "string",
        );
        if (parsed.length === 0) return;

        // Свежие сверху — как пришло с сервера (orderBy createdAt desc)
        const start = Math.floor(Math.random() * Math.min(parsed.length, 8));
        const initial: FeedItem[] = parsed
          .slice(start, start + 4)
          .map(g => ({
            id: g.id,
            workType: g.workType,
            topic: g.topic,
            createdAt: Date.parse(g.createdAt) || Date.now(),
            fresh: false,
          }));
        poolRef.current = parsed;
        cursorRef.current = 0;
        setItems(initial);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Новая тема появляется сверху, старая снизу уходит
  useEffect(() => {
    const t = setInterval(() => {
      setItems(prev => {
        const pool = poolRef.current;
        if (pool.length === 0) return prev;
        const src = pool[cursorRef.current % pool.length];
        cursorRef.current += 1;
        const next: FeedItem = {
          id: src.id,
          workType: src.workType,
          topic: src.topic,
          createdAt: Date.now(),
          fresh: true,
        };
        // Не дублируем тему, если она уже в ленте
        if (prev.some(it => it.id === next.id && it.fresh)) return prev;
        return [next, ...prev.filter(it => it.id !== next.id)].slice(0, 4);
      });
    }, 14_000);
    return () => clearInterval(t);
  }, []);

  // Сброс подсветки «новая» + обновление меток времени
  useEffect(() => {
    const t = setInterval(() => {
      setItems(prev =>
        prev.map(it =>
          it.fresh && Date.now() - it.createdAt > 6_000 ? { ...it, fresh: false } : it,
        ),
      );
      setTick(x => x + 1);
    }, 5_000);
    return () => clearInterval(t);
  }, []);

  if (items.length === 0) {
    return (
      <aside className={styles.liveFeed} aria-label="Работы, которые генерируются прямо сейчас">
        <div className={styles.liveFeedCard}>
          <div className={styles.liveFeedHead}>
            <span className={styles.liveFeedDot} aria-hidden />
            <span className={styles.liveFeedTitle}>Сейчас генерируют</span>
            <span className={styles.liveFeedCount}>…</span>
          </div>
          <div className={styles.liveFeedList}>
            <div className={styles.liveFeedItem}>
              <p className={styles.liveFeedTopic}>Загружаем свежие темы…</p>
            </div>
          </div>
          <p className={styles.liveFeedFoot}>Обновляется в реальном времени</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className={styles.liveFeed} aria-label="Работы, которые генерируются прямо сейчас">
      <div className={styles.liveFeedCard}>
        <div className={styles.liveFeedHead}>
          <span className={styles.liveFeedDot} aria-hidden />
          <span className={styles.liveFeedTitle}>Сейчас генерируют</span>
          <span className={styles.liveFeedCount}>{items.length}</span>
        </div>
        <div className={styles.liveFeedList}>
          {items.map(it => (
            <div
              key={it.id + it.createdAt}
              className={`${styles.liveFeedItem} ${it.fresh ? styles.liveFeedItemFresh : ""}`}
            >
              <div className={styles.liveFeedItemTop}>
                <span
                  className={styles.liveFeedType}
                  style={{ color: TYPE_COLORS[it.workType] || "#1D5CFF" }}
                >
                  {it.workType}
                </span>
                <span className={styles.liveFeedTime}>{formatAgo(it.createdAt)}</span>
              </div>
              <p className={styles.liveFeedTopic}>{it.topic}</p>
            </div>
          ))}
        </div>
        <p className={styles.liveFeedFoot}>Обновляется в реальном времени</p>
      </div>
    </aside>
  );
}
