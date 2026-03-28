"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import styles from "./Footer.module.css";

export default function Footer() {
  const { status } = useSession();
  const authed = status === "authenticated";
  const pathname = usePathname();
  if (pathname?.startsWith("/auth")) return null;

  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>

        <div className={styles.footerTop}>

          {/* Бренд */}
          <div className={styles.footerBrand}>
            <div className={styles.footerLogo}>
              <svg className={styles.footerLogoSpark} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M10 1L11.8 8.2L19 10L11.8 11.8L10 19L8.2 11.8L1 10L8.2 8.2Z" fill="url(#footerGrad)"/>
                <defs>
                  <linearGradient id="footerGrad" x1="1" y1="1" x2="19" y2="19" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#818CF8"/>
                    <stop offset="1" stopColor="#60A5FA"/>
                  </linearGradient>
                </defs>
              </svg>
              <span className={styles.footerLogoWord}>Ref<span className={styles.footerLogoAi}>ai</span></span>
            </div>
            <p className={styles.footerTagline}>
              Генератор учебных работ по ГОСТ.<br />
              Рефераты, курсовые, эссе — быстро и качественно.
            </p>
            <p className={styles.footerContact}>
              По вопросам: <a href="mailto:support@ref-ai.ru">support@ref-ai.ru</a>
            </p>
          </div>

          {/* Колонки */}
          <div className={styles.footerCols}>
            <div className={styles.footerCol}>
              <h4 className={styles.footerColTitle}>Поддержка</h4>
              <ul className={styles.footerLinks}>
                <li>
                  <a href="mailto:support@ref-ai.ru" className={styles.footerMailLink}>
                    <span className={styles.footerMailIcon}>✉</span>
                    Написать на почту
                  </a>
                </li>
                {authed && <li><Link href="/dashboard">Мои работы</Link></li>}
                {!authed && <li><Link href="/auth/signin">Войти</Link></li>}
              </ul>
            </div>
            <div className={styles.footerCol}>
              <h4 className={styles.footerColTitle}>Написать работу</h4>
              <ul className={styles.footerLinks}>
                <li><a href="/?workType=Сочинение">Написать сочинение</a></li>
                <li><a href="/?workType=Эссе">Написать эссе</a></li>
                <li><a href="/?workType=Доклад">Написать доклад</a></li>
                <li><a href="/?workType=Реферат">Написать реферат</a></li>
                <li><a href="/?workType=Курсовая">Написать курсовую</a></li>
                <li><a href="/?workType=ВКР">Написать ВКР</a></li>
              </ul>
            </div>
            <div className={styles.footerCol}>
              <h4 className={styles.footerColTitle}>Информация</h4>
              <ul className={styles.footerLinks}>
                <li><Link href="/oferta">Публичная оферта</Link></li>
                <li><Link href="/privacy">Политика конфиденциальности</Link></li>
                <li><Link href="/terms">Условия использования</Link></li>
              </ul>
            </div>
          </div>

        </div>

        <div className={styles.footerBottom}>
          <div>
            <p className={styles.footerCopy}>© 2025–2026 Refai. Все права защищены.</p>
            <p className={styles.footerInn}>ИНН самозанятого: 860233222535 · По вопросам: support@ref-ai.ru</p>
          </div>
          <div className={styles.footerBadges}>
            <span className={styles.footerBadge}>ГОСТ 7.32-2017</span>
            <span className={styles.footerBadge}>ИИ-генерация</span>
            <span className={styles.footerBadge}>Быстро</span>
          </div>
        </div>

      </div>
    </footer>
  );
}
