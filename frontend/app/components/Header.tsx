"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import styles from "./Header.module.css";

export default function Header() {
  const { data: session, status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo}>
        <span className={styles.logoIcon}>R</span>
        <span className={styles.logoText}>efai</span>
      </Link>

      {/* Десктоп nav */}
      <nav className={styles.nav}>
        {!mounted || status === "loading" ? (
          <div className={styles.skeleton}/>
        ) : session ? (
          <>
            <Link href="/profile" className={styles.dashLink}>Профиль</Link>
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
                <Link href="/profile" className={styles.mobileLink} onClick={() => setMenuOpen(false)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                  Профиль
                </Link>
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
