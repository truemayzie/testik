"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import styles from "./Header.module.css";

export default function Header() {
  const { data: session, status } = useSession();

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo}>
        <span style={{ color: '#6366F1' }}>A</span>cademic
      </Link>

      <nav className={styles.nav}>
        {status === "loading" ? (
          <div className={styles.skeleton}/>
        ) : session ? (
          <>
            <Link href="/profile" className={styles.dashLink}>
              Профиль
            </Link>
            <Link href="/dashboard" className={styles.dashLink}>
              Мои работы
            </Link>
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
          <Link href="/auth/signin" className={styles.signInBtn}>
            Войти
          </Link>
        )}
      </nav>
    </header>
  );
}
