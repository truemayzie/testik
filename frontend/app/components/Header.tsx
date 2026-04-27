"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import styles from "./Header.module.css";
import { useModalContext } from "@/app/lib/ModalContext";

const LogoInner = () => (
  <>
    <svg className={styles.logoSpark} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M10 1L11.8 8.2L19 10L11.8 11.8L10 19L8.2 11.8L1 10L8.2 8.2Z" fill="#D97706"/>
    </svg>
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
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isAuthPage = pathname?.startsWith("/auth");
  const { isModalOpen } = useModalContext();

  useEffect(() => { setMounted(true); }, []);

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
    <header className={styles.header} style={{ zIndex: isModalOpen ? 1 : undefined }}>
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
    </header>
  );
}
