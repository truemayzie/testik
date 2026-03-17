"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import styles from "./signin.module.css";

export default function SignInPage() {
  const [email, setEmail]     = useState("");
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  async function handleOAuth(provider: string) {
    setLoading(provider);
    await signIn(provider, { callbackUrl: "/profile" });
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading("email");
    await signIn("email", { email, callbackUrl: "/profile", redirect: false });
    setSent(true);
    setLoading(null);
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        {/* Логотип */}
        <div className={styles.logo}>
          <span className={styles.logoIcon}>📄</span>
          <span className={styles.logoText}>Academic Service</span>
        </div>

        <h1 className={styles.title}>Войти в аккаунт</h1>
        <p className={styles.subtitle}>
          Сохраняйте работы и скачивайте их в любое время
        </p>

        {sent ? (
          <div className={styles.successBox}>
            <span className={styles.successIcon}>✉</span>
            <p>Ссылка для входа отправлена на <strong>{email}</strong></p>
            <p className={styles.successHint}>Проверьте папку «Входящие» и «Спам»</p>
          </div>
        ) : (
          <>
            {/* OAuth кнопки */}
            <div className={styles.oauthButtons}>
              <button
                className={`${styles.oauthBtn} ${styles.yandex}`}
                onClick={() => handleOAuth("yandex")}
                disabled={loading !== null}
              >
                {loading === "yandex" ? (
                  <span className={styles.spinner}/>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13.32 0H10.1C6.37 0 4.14 1.9 4.14 5.02c0 2.7 1.26 4.07 3.67 5.67L5.18 15.8H1.5L0 24h4.38l1.14-6.5h2.1L9.4 24h4.38l-2-12.07c2.43-1.6 3.84-3.6 3.84-6.5C15.62 1.9 15 0 13.32 0zm-2.1 10.1h-.9V4.3h.9c1.44 0 2.1.72 2.1 2.88 0 2.16-.66 2.92-2.1 2.92z"/>
                  </svg>
                )}
                Войти через Яндекс
              </button>

              {/* VK кнопка — включить когда будет домен с https
              <button
                className={`${styles.oauthBtn} ${styles.vk}`}
                onClick={() => handleOAuth("vk")}
                disabled={loading !== null}
              >
                Войти через ВКонтакте
              </button>
              */}
            </div>

            {/* Разделитель */}
            <div className={styles.divider}>
              <span>или</span>
            </div>

            {/* Email форма */}
            <form onSubmit={handleEmail} className={styles.emailForm}>
              <label className={styles.label}>Email</label>
              <input
                type="email"
                className={styles.input}
                placeholder="your@email.ru"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                disabled={loading !== null}
              />
              <button
                type="submit"
                className={styles.emailBtn}
                disabled={loading !== null || !email.trim()}
              >
                {loading === "email" ? (
                  <span className={styles.spinner}/>
                ) : "Получить ссылку для входа"}
              </button>
            </form>

            <p className={styles.terms}>
              Входя в аккаунт, вы принимаете{" "}
              <a href="/terms">условия использования</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
