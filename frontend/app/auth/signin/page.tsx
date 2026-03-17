"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import Link from "next/link";
import styles from "./signin.module.css";

export default function SignInPage() {
  const [email, setEmail]     = useState("");
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  async function handleOAuth(provider: string) {
    setLoading(provider);
    await signIn(provider, { callbackUrl: "/" });
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading("email");
    await signIn("email", { email, callbackUrl: "/", redirect: false });
    setSent(true);
    setLoading(null);
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        {/* Логотип */}
        <Link href="/" className={styles.logo}>
          <span className={styles.logoMark}>A</span>
          <span className={styles.logoText}>cademic</span>
        </Link>

        <h1 className={styles.title}>Войти в аккаунт</h1>
        <p className={styles.subtitle}>
          Сохраняйте работы и скачивайте их в любое время
        </p>

        {sent ? (
          <div className={styles.successBox}>
            <span className={styles.successIcon}>✉️</span>
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
                  <span className={styles.spinner} />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13.32 0H10.1C6.37 0 4.14 1.9 4.14 5.02c0 2.7 1.26 4.07 3.67 5.67L5.18 15.8H1.5L0 24h4.38l1.14-6.5h2.1L9.4 24h4.38l-2-12.07c2.43-1.6 3.84-3.6 3.84-6.5C15.62 1.9 15 0 13.32 0zm-2.1 10.1h-.9V4.3h.9c1.44 0 2.1.72 2.1 2.88 0 2.16-.66 2.92-2.1 2.92z"/>
                  </svg>
                )}
                Войти через Яндекс
              </button>

              {/* VK — заглушка, включить когда будет HTTPS домен */}
              <button
                className={`${styles.oauthBtn} ${styles.vk}`}
                disabled
                title="Доступно после подключения домена"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.07 2H8.93C3.33 2 2 3.33 2 8.93v6.14C2 20.67 3.33 22 8.93 22h6.14C20.67 22 22 20.67 22 15.07V8.93C22 3.33 20.67 2 15.07 2zm3.08 13.36h-1.57c-.59 0-.78-.47-1.84-1.55-.93-.9-1.33-.9-1.56-.9-.32 0-.41.09-.41.53v1.41c0 .38-.12.6-1.12.6-1.65 0-3.48-1-4.76-2.87-1.93-2.72-2.46-4.75-2.46-5.17 0-.23.09-.44.53-.44h1.57c.4 0 .55.18.7.6.77 2.22 2.06 4.17 2.59 4.17.2 0 .29-.09.29-.59V9.86c-.06-1.06-.62-1.15-.62-1.53 0-.18.15-.36.38-.36h2.47c.33 0 .44.18.44.56v2.99c0 .33.15.44.24.44.2 0 .37-.11.74-.5 1.14-1.28 1.96-3.25 1.96-3.25.11-.23.29-.44.69-.44h1.57c.47 0 .57.24.47.56-.2.91-2.12 3.63-2.12 3.63-.17.27-.23.38 0 .68.17.23.72.71 1.09 1.14.67.77 1.19 1.41 1.33 1.86.12.41-.1.62-.51.62z"/>
                </svg>
                Войти через ВКонтакте
                <span className={styles.vkSoon}>скоро</span>
              </button>
            </div>

            {/* Разделитель */}
            <div className={styles.divider}>
              <span>или войдите по email</span>
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
                  <span className={styles.spinner} />
                ) : "Получить ссылку для входа"}
              </button>
            </form>

            <p className={styles.terms}>
              Входя в аккаунт, вы принимаете{" "}
              <a href="/terms">условия использования</a>
            </p>
          </>
        )}

        <Link href="/" className={styles.backLink}>← На главную</Link>
      </div>
    </div>
  );
}
