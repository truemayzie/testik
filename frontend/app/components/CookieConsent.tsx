"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./CookieConsent.module.css";

/** Только скрытие баннера; аналитика грузится из layout всегда. */
const STORAGE_KEY = "refai_cookie_notice_dismissed";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") {
        setVisible(false);
        return;
      }
    } catch {
      /* показываем баннер */
    }
    setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div className={styles.wrap} role="dialog" aria-label="Уведомление о cookie">
      <div className={styles.inner}>
        <p className={styles.text}>
          Продолжая пользоваться сайтом, вы соглашаетесь с использованием cookie и сервисов аналитики.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.btnPrimary} onClick={dismiss} aria-label="Принять">
            <span className={styles.btnCheck} aria-hidden>✓</span>
            Принять
          </button>
        </div>
      </div>
    </div>
  );
}
