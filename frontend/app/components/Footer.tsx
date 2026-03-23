"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import styles from "./Footer.module.css";

export default function Footer() {
  const { status } = useSession();
  const authed = status === "authenticated";

  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>

        <div className={styles.footerTop}>

          {/* Бренд */}
          <div className={styles.footerBrand}>
            <div className={styles.footerLogo}>
              <span className={styles.footerLogoIcon}>R</span>
              <span className={styles.footerLogoText}>efai</span>
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
                <li><a href="mailto:support@ref-ai.ru">support@ref-ai.ru</a></li>
              </ul>
            </div>
            <div className={styles.footerCol}>
              <h4 className={styles.footerColTitle}>О сервисе</h4>
              <ul className={styles.footerLinks}>
                <li><a href="/">Генератор рефератов</a></li>
                <li><Link href="/dashboard">Мои работы</Link></li>
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
