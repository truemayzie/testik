import Link from "next/link";
import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>

        <div className={styles.footerTop}>

          {/* Бренд */}
          <div className={styles.footerBrand}>
            <div className={styles.footerLogo}>
              <span className={styles.footerLogoAccent}>A</span>cademic
            </div>
            <p className={styles.footerTagline}>
              Генератор учебных работ по ГОСТ.<br />
              Рефераты, курсовые, эссе — быстро и бесплатно.
            </p>
            <div className={styles.footerSocials}>
              <a href="https://vk.com" target="_blank" rel="noopener noreferrer"
                className={styles.socialBtn} aria-label="ВКонтакте">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.408 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.862-.523-2.049-1.712-1.033-1.01-1.49-.897-1.745.096v1.616h-1.337c-2.72 0-5.133-1.648-7.015-4.868C3.64 9.576 3.2 7.875 3.2 7.875s-.064-.186.14-.186h1.744c.652 0 .897.373 1.12.998 1.2 3.413 3.2 6.4 4.026 6.4.31 0 .45-.143.45-.924V11.38c-.09-1.65-.967-1.79-.967-2.38 0-.28.22-.56.58-.56h2.742c.55 0 .742.297.742.942v3.963c0 .55.238.742.387.742.31 0 .57-.192 1.14-.77 1.756-1.972 3.012-5.01 3.012-5.01s.163-.366.816-.366h1.744c.524 0 .64.27.524.64-.217.994-2.304 3.874-2.304 3.874-.183.296-.248.43 0 .762.183.248.785.761 1.187 1.224.736.838 1.298 1.543 1.452 2.033.14.483-.105.73-.636.73z"/>
                </svg>
                ВКонтакте
              </a>
              <a href="https://t.me" target="_blank" rel="noopener noreferrer"
                className={styles.socialBtn} aria-label="Telegram">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
                Telegram
              </a>
            </div>
          </div>

          {/* Колонки */}
          <div className={styles.footerCols}>
            <div className={styles.footerCol}>
              <h4 className={styles.footerColTitle}>Поддержка</h4>
              <ul className={styles.footerLinks}>
                <li><a href="https://t.me" target="_blank" rel="noopener noreferrer">Telegram-чат</a></li>
                <li><a href="https://vk.com" target="_blank" rel="noopener noreferrer">ВКонтакте</a></li>
              </ul>
            </div>
            <div className={styles.footerCol}>
              <h4 className={styles.footerColTitle}>О сервисе</h4>
              <ul className={styles.footerLinks}>
                <li><a href="/">Генератор рефератов</a></li>
                <li><Link href="/dashboard">Мои работы</Link></li>
                <li><Link href="/auth/signin">Войти</Link></li>
              </ul>
            </div>
            <div className={styles.footerCol}>
              <h4 className={styles.footerColTitle}>Информация</h4>
              <ul className={styles.footerLinks}>
                <li><a href="#">Публичная оферта</a></li>
                <li><a href="#">Политика конфиденциальности</a></li>
                <li><a href="#">Условия использования</a></li>
              </ul>
            </div>
          </div>

        </div>

        <div className={styles.footerBottom}>
          <p className={styles.footerCopy}>© 2025–2026 Academic Service. Все права защищены.</p>
          <div className={styles.footerBadges}>
            <span className={styles.footerBadge}>ГОСТ 7.32-2017</span>
            <span className={styles.footerBadge}>Бесплатно</span>
            <span className={styles.footerBadge}>Без регистрации</span>
          </div>
        </div>

      </div>
    </footer>
  );
}
