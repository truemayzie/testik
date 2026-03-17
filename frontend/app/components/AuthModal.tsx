"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useEffect } from "react";
import styles from "./AuthModal.module.css";

type Props = {
  onClose: () => void;
};

export default function AuthModal({ onClose }: Props) {
  // Блокируем скролл страницы пока модал открыт
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>

        <button className={styles.closeBtn} onClick={onClose} aria-label="Закрыть">✕</button>

        <div className={styles.icon}>🎓</div>

        <h2 className={styles.title}>Войдите, чтобы генерировать</h2>
        <p className={styles.sub}>
          После входа вы получите <strong>2 бесплатные генерации</strong>.
          Реферат будет сохранён в личном кабинете.
        </p>

        <div className={styles.buttons}>
          <button
            className={styles.yandexBtn}
            onClick={() => signIn("yandex", { callbackUrl: "/" })}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13.32 0H10.1C6.37 0 4.14 1.9 4.14 5.02c0 2.7 1.26 4.07 3.67 5.67L5.18 15.8H1.5L0 24h4.38l1.14-6.5h2.1L9.4 24h4.38l-2-12.07c2.43-1.6 3.84-3.6 3.84-6.5C15.62 1.9 15 0 13.32 0zm-2.1 10.1h-.9V4.3h.9c1.44 0 2.1.72 2.1 2.88 0 2.16-.66 2.92-2.1 2.92z"/>
            </svg>
            Войти через Яндекс
          </button>

          <Link href="/auth/signin" className={styles.emailBtn} onClick={onClose}>
            ✉ Войти по Email
          </Link>
        </div>

        <p className={styles.hint}>
          Вход занимает 10 секунд. Без пароля — только магическая ссылка.
        </p>

      </div>
    </div>
  );
}
