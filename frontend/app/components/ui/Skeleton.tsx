import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  /** Ширина (px, %, любая CSS-единица) */
  width?: number | string;
  /** Высота */
  height?: number | string;
  /** Скруглить до круга (аватар) */
  circle?: boolean;
  className?: string;
}

/** Плейсхолдер загрузки дизайн-системы */
export function Skeleton({ width, height, circle, className }: SkeletonProps) {
  return (
    <span
      className={[styles.skeleton, circle ? styles.circle : "", className ?? ""].join(" ")}
      style={{ width, height }}
      aria-hidden
    />
  );
}

/** Карточка-скелетон для списков (дашборд, админка) */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className={styles.card} aria-hidden>
      <div className={styles.cardRow}>
        <Skeleton width={88} height={22} />
        <Skeleton width={64} height={22} />
      </div>
      <Skeleton width="70%" height={18} />
      {Array.from({ length: lines - 1 }).map((_, i) => (
        <Skeleton key={i} width={`${90 - i * 12}%`} height={14} />
      ))}
    </div>
  );
}
