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
              <svg className={styles.footerLogoSpark} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <circle cx="12" cy="12" r="11.25" fill="var(--primary)" />
                <rect x="6.38" y="7.13" width="11.25" height="1.88" rx="0.94" fill="#FFFFFF" />
                <rect x="6.38" y="10.88" width="8.25" height="1.88" rx="0.94" fill="#FFFFFF" opacity="0.7" />
                <rect x="6.38" y="14.63" width="6" height="1.88" rx="0.94" fill="#FFFFFF" />
                <path d="M15.38 13.69Q16.03 14.91 17.25 15.56Q16.03 16.22 15.38 17.44Q14.72 16.22 13.5 15.56Q14.72 14.91 15.38 13.69Z" fill="#FFFFFF" />
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
              <h4 className={styles.footerColTitle}>Работы</h4>
              <ul className={styles.footerLinks}>
                <li><Link href="/referat">Рефераты</Link></li>
                <li><Link href="/kursovaya">Курсовые работы</Link></li>
                <li><Link href="/kursovaya-zakaz">Курсовая на заказ</Link></li>
                <li><Link href="/esse">Эссе</Link></li>
                <li><Link href="/doklad">Доклады</Link></li>
                <li><Link href="/vkr">ВКР</Link></li>
                <li><Link href="/vkr-zakaz">ВКР на заказ</Link></li>
                <li><Link href="/sochinenie">Сочинения</Link></li>
              </ul>
            </div>
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
