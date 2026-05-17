"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import styles from "./Header.module.css";
import { useModalContext } from "@/app/lib/ModalContext";

const LogoInner = () => (
  <>
    <span className={styles.logoMark} aria-hidden>
      <svg className={styles.logoSpark} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="11" fill="url(#refaiLogoBg)" />
        <path d="M12 4.5L13.6 10.2L19.5 12L13.6 13.8L12 19.5L10.4 13.8L4.5 12L10.4 10.2Z" fill="#D97706" />
        <defs>
          <linearGradient id="refaiLogoBg" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1B3A6B" />
            <stop offset="1" stopColor="#0f2645" />
          </linearGradient>
        </defs>
      </svg>
    </span>
    <div className={styles.logoTexts}>
      <span className={styles.logoWord}>Ref<span className={styles.logoAi}>ai</span></span>
      <span className={styles.logoTagline}>Генератор учебных работ</span>
    </div>
  </>
);

export default function Header() {
  const { data: session, status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [bannerHidden, setBannerHidden] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isAuthPage = pathname?.startsWith("/auth");
  const isHomePage = pathname === "/";
  const isStaging = process.env.NEXT_PUBLIC_IS_STAGING === "1";
  const { isModalOpen } = useModalContext();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    const key = "langBannerHidden";
    const hidden = localStorage.getItem(key) === "1";
    setBannerHidden(hidden);
  }, [mounted]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  if (isAuthPage) return null;

  return (
    <div className={styles.headerWrap} style={{ zIndex: isModalOpen ? 1 : undefined }}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
        <Link href="/" className={styles.logo}><LogoInner /></Link>

        {/* Десктоп nav */}
        <nav className={styles.nav}>
          {!mounted || status === "loading" ? (
            <div className={styles.skeleton}/>
          ) : session ? (
            <>
              <Link href="/dashboard" className={styles.dashLink}>Мои работы</Link>
              {session.user?.image && (
                <img src={session.user.image} alt="" className={styles.avatar}/>
              )}
              <span className={styles.userName}>
                {session.user?.name?.split(" ")[0] || session.user?.email}
              </span>
              <button
                className={styles.signOutBtn}
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                Выйти
              </button>
            </>
          ) : (
            <Link href="/auth/signin" className={styles.signInBtn}>Войти</Link>
          )}
        </nav>

        {/* Мобильный бургер */}
        <div className={styles.mobileRight} ref={menuRef}>
          {!mounted || status === "loading" ? (
            <div className={styles.skeleton}/>
          ) : session ? (
            <>
              <button
                className={styles.burgerBtn}
                onClick={() => setMenuOpen(o => !o)}
                aria-label="Меню"
              >
                {menuOpen ? (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                )}
              </button>

              {menuOpen && (
                <div className={styles.mobileMenu}>
                  {session.user?.image && (
                    <div className={styles.mobileUser}>
                      <img src={session.user.image} alt="" className={styles.mobileAvatar}/>
                      <span className={styles.mobileUserName}>
                        {session.user?.name?.split(" ")[0] || session.user?.email}
                      </span>
                    </div>
                  )}
                  <Link href="/dashboard" className={styles.mobileLink} onClick={() => setMenuOpen(false)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    </svg>
                    Мои работы
                  </Link>
                  <div className={styles.mobileDivider}/>
                  <button
                    className={styles.mobileSignOut}
                    onClick={() => { setMenuOpen(false); signOut({ callbackUrl: "/" }); }}
                  >
                    Выйти
                  </button>
                </div>
              )}
            </>
          ) : (
            <Link href="/auth/signin" className={styles.signInBtn}>Войти</Link>
          )}
        </div>
        </div>
      </header>
      {isStaging && (
        <div className={styles.stagingRibbon} role="status">
          <span className={styles.stagingRibbonText}>
            Staging — черновик дизайна. Продакшен: ref-ai.ru
          </span>
        </div>
      )}
      {!bannerHidden && isHomePage && !isStaging && (
        <div className={styles.langBanner} role="status" aria-live="polite">
          <div className={styles.langBannerShell}>
            <div className={styles.langBannerInner}>
              <span className={styles.langBannerIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L13.9 8.1L20 10L13.9 11.9L12 18L10.1 11.9L4 10L10.1 8.1L12 2Z" fill="currentColor"/>
                </svg>
              </span>
              <span className={styles.langBannerText}>
                Поддержка генерации на русском, английском, казахском и других языках
              </span>
              <span className={styles.langBannerBadge}>RU · EN · KZ</span>
            </div>
            <button
              className={styles.langBannerClose}
              aria-label="Скрыть уведомление"
              onClick={() => {
                localStorage.setItem("langBannerHidden", "1");
                setBannerHidden(true);
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
