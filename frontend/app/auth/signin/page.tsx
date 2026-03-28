"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./signin.module.css";

export default function SignInPage() {
  const router = useRouter();
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
          <span className={styles.logoIconWrap}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22" aria-hidden="true">
              <path d="M12 1L14.2 9.8L23 12L14.2 14.2L12 23L9.8 14.2L1 12L9.8 9.8Z" fill="url(#signinGrad)"/>
              <defs>
                <linearGradient id="signinGrad" x1="1" y1="1" x2="23" y2="23" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#818CF8"/>
                  <stop offset="1" stopColor="#60A5FA"/>
                </linearGradient>
              </defs>
            </svg>
          </span>
          <span className={styles.logoText}>Ref<span className={styles.logoAi}>ai</span></span>
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
                  <span className={styles.yandexLogoWrap}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M2.04 12c0-5.523 4.476-10 10-10 5.522 0 10 4.477 10 10s-4.478 10-10 10c-5.524 0-10-4.477-10-10z" fill="#FC3F1D"/>
                      <path d="M13.32 7.666h-.924c-1.694 0-2.585.858-2.585 2.123 0 1.43.616 2.1 1.881 2.959l1.045.704-3.003 4.487H7.49l2.695-4.014c-1.55-1.111-2.42-2.19-2.42-4.015 0-2.288 1.595-3.85 4.62-3.85h3.003v11.868H13.32V7.666z" fill="#fff"/>
                    </svg>
                  </span>
                )}
                Войти через Яндекс
              </button>

              <button
                className={`${styles.oauthBtn} ${styles.vk}`}
                onClick={() => handleOAuth("vk")}
                disabled={loading !== null}
              >
                {loading === "vk" ? (
                  <span className={styles.spinner} />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20.4517 7.41006C20.5863 6.98006 20.4517 6.66406 19.8405 6.66406H17.827C17.3124 6.66406 17.0757 6.93806 16.9411 7.23906C16.9411 7.23906 15.9119 9.74706 14.4583 11.3701C13.9882 11.8381 13.7762 11.9861 13.5232 11.9861C13.3886 11.9861 13.2049 11.8381 13.2049 11.4081V7.41006C13.2049 6.89606 13.054 6.66406 12.6248 6.66406H9.47395C9.15353 6.66406 8.96347 6.89706 8.96347 7.11706C8.96347 7.60306 9.68934 7.71606 9.76437 9.09606V12.0721C9.76437 12.7281 9.64133 12.8481 9.38833 12.8481C8.69545 12.8481 7.02474 10.3301 6.03327 7.45306C5.83704 6.89306 5.64469 6.66406 5.12999 6.66406H3.11653C2.54138 6.66406 2.42334 6.93806 2.42334 7.23906C2.42334 7.77406 3.11653 10.4311 5.6173 13.9491C7.28055 16.3561 9.64226 17.6601 11.7923 17.6601C13.0445 17.6601 13.2049 17.3701 13.2049 16.8711V15.0701C13.2049 14.4961 13.329 14.3761 13.7388 14.3761C14.0322 14.3761 14.5411 14.5241 15.7209 15.6601C17.0757 17.0081 17.3014 17.6601 18.0699 17.6601H20.0833C20.6584 17.6601 20.9446 17.3701 20.7836 16.8041C20.6067 16.2401 19.9441 15.4161 19.068 14.4381C18.5979 13.8871 17.8926 13.2921 17.6806 12.9901C17.3872 12.6081 17.4722 12.4421 17.6806 12.1001C17.6806 12.1001 20.1399 8.62706 20.4517 7.41006Z"/>
                  </svg>
                )}
                Войти через ВКонтакте
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

        <Link href="/" className={styles.backLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Вернуться на главную
        </Link>


      </div>
    </div>
  );
}
