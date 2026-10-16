"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import styles from "./Header.module.css";
import { userInitials } from "@/lib/userInitials";

const LogoInner = () => (
  <>
    <span className={styles.logoMark} aria-hidden>
      <svg className={styles.logoSpark} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="11.25" fill="var(--primary)" />
        <rect x="6.38" y="7.13" width="11.25" height="1.88" rx="0.94" fill="#FFFFFF" />
        <rect x="6.38" y="10.88" width="8.25" height="1.88" rx="0.94" fill="#FFFFFF" opacity="0.7" />
        <rect x="6.38" y="14.63" width="6" height="1.88" rx="0.94" fill="#FFFFFF" />
        <path d="M15.38 13.69Q16.03 14.91 17.25 15.56Q16.03 16.22 15.38 17.44Q14.72 16.22 13.5 15.56Q14.72 14.91 15.38 13.69Z" fill="#FFFFFF" />
      </svg>
    </span>
    <div className={styles.logoTexts}>
      <span className={styles.logoWord}>Ref<span className={styles.logoAi}>ai</span></span>
      <span className={styles.logoTagline}>Генератор учебных работ</span>
    </div>
  </>
);

function UserAvatarButton({
  image,
  initials,
  onClick,
  expanded,
}: {
  image?: string | null;
  initials: string;
  onClick: () => void;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      className={styles.avatarBtn}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-label="Меню аккаунта"
      aria-expanded={expanded}
      aria-haspopup="menu"
    >
      {image ? (
        <img src={image} alt="" className={styles.avatarImg} />
      ) : (
        <span className={styles.avatarInitials} aria-hidden>{initials}</span>
      )}
      <svg className={styles.avatarChevron} width="12" height="12" viewBox="0 0 12 12" aria-hidden>
        <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function shortDisplayId(userId: string): string {
  const tail = userId.replace(/[^a-z0-9]/gi, "").slice(-6);
  return tail || userId.slice(0, 8);
}

function displayUserName(user: { name?: string | null; email?: string | null }): string {
  const name = user.name?.trim();
  if (name) return name;
  const email = user.email?.trim();
  if (email) return email.split("@")[0] ?? email;
  return "Аккаунт";
}

export default function Header() {
  const { data: session, status } = useSession();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [bannerHidden, setBannerHidden] = useState(true);
  const [floated, setFloated] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  const isAuthPage = pathname?.startsWith("/auth");
  const isHomePage = pathname === "/";
  const isDashboard = pathname?.startsWith("/dashboard");
  const isWorksPage = pathname?.startsWith("/works");
  const isOrderPage = pathname?.startsWith("/order");
  const isStaging = process.env.NEXT_PUBLIC_IS_STAGING === "1";

  const syncHeaderHeight = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    document.documentElement.style.setProperty("--site-header-h", `${el.offsetHeight}px`);
  }, []);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    setBannerHidden(localStorage.getItem("langBannerHidden") === "1");
  }, [mounted]);

  useEffect(() => {
    syncHeaderHeight();
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(syncHeaderHeight);
    ro.observe(el);
    window.addEventListener("resize", syncHeaderHeight);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncHeaderHeight);
    };
  }, [syncHeaderHeight, bannerHidden, isHomePage, isStaging, mounted, status, floated]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop;
      setFloated(y > 16);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!userMenuOpen) return;
      const t = e.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(t)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [userMenuOpen]);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  if (isAuthPage) return null;

  const showLangBanner = !bannerHidden && isHomePage && !isStaging && !floated;
  const userId = (session?.user as { id?: string } | undefined)?.id ?? "";
  const initials = session?.user
    ? userInitials({ name: session.user.name, email: session.user.email })
    : "?";

  async function copyUserId() {
    if (!userId) return;
    try {
      await navigator.clipboard.writeText(userId);
      setIdCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setIdCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <div
        ref={wrapRef}
        data-site-header=""
        className={`${styles.headerWrap} ${floated ? styles.headerWrapFloating : ""} ${showLangBanner ? styles.headerWrapWithBanner : ""} ${isOrderPage ? styles.headerWrapOrder : ""}`}
      >
        <div className={styles.headerShell}>
          <header className={styles.header}>
            <div className={styles.headerBar}>
              <Link href="/" className={styles.logo}><LogoInner /></Link>

              <div
                className={`${styles.headerRight} ${session ? styles.headerRightAuth : styles.headerRightGuest}`}
              >
                <Link
                  href="/works"
                  className={`${styles.dashLink} ${styles.dashLinkCatalog} ${isWorksPage ? styles.dashLinkActive : ""}`}
                >
                  <span className={styles.dashLinkFullText}>Каталог работ</span>
                  <span className={styles.dashLinkShortText}>Каталог</span>
                </Link>
                {!mounted || status === "loading" ? (
                  <div className={styles.skeleton} />
                ) : session ? (
                  <>
                    <Link
                      href="/dashboard"
                      className={`${styles.dashLink} ${styles.dashLinkWorks} ${isDashboard ? styles.dashLinkActive : ""}`}
                    >
                      Мои работы
                    </Link>
                    <div className={styles.userMenuWrap} ref={userMenuRef}>
                      <UserAvatarButton
                        image={session.user?.image}
                        initials={initials}
                        expanded={userMenuOpen}
                        onClick={() => setUserMenuOpen((o) => !o)}
                      />
                      {userMenuOpen && (
                        <div className={styles.userDropdown} role="menu">
                          {userId ? (
                            <button
                              type="button"
                              className={styles.userIdCopy}
                              onClick={() => void copyUserId()}
                              title="Скопировать ID"
                            >
                              <span className={styles.userIdCopyIcon} aria-hidden>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                  <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
                                  <path d="M6 16H5a2 2 0 01-2-2V5a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="1.8" />
                                </svg>
                              </span>
                              <span className={styles.userIdCopyText}>
                                {idCopied ? "Скопировано" : `id: ${shortDisplayId(userId)}`}
                              </span>
                            </button>
                          ) : null}
                          <p className={styles.userDisplayName}>
                            {displayUserName(session.user!)}
                          </p>
                          <div className={styles.userDropdownDivider} />
                          <div className={styles.userDropdownNav}>
                            <Link
                              href="/dashboard"
                              className={`${styles.userDropdownLink} ${isDashboard ? styles.userDropdownLinkActive : ""}`}
                              onClick={() => setUserMenuOpen(false)}
                            >
                              <span className={styles.userDropdownIcon} aria-hidden>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                </svg>
                              </span>
                              Мои работы
                            </Link>
                            <Link
                              href="/works"
                              className={`${styles.userDropdownLink} ${isWorksPage ? styles.userDropdownLinkActive : ""}`}
                              onClick={() => setUserMenuOpen(false)}
                            >
                              <span className={styles.userDropdownIcon} aria-hidden>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                                </svg>
                              </span>
                              Каталог работ
                            </Link>
                          </div>
                          <div className={styles.userDropdownDivider} />
                          <button
                            type="button"
                            className={styles.userDropdownSignOut}
                            role="menuitem"
                            onClick={() => signOut({ callbackUrl: "/" })}
                          >
                            <span className={styles.signOutIcon} aria-hidden>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                <path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                            Выйти
                          </button>
                        </div>
                      )}
                    </div>
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
        </div>

        {showLangBanner && (
          <div className={styles.langBanner} role="status" aria-live="polite">
            <div className={styles.langBannerInner}>
              <span className={styles.langBannerIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20" />
                  <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                </svg>
              </span>
              <span className={styles.langBannerText}>
                Поддержка генерации на русском, английском, казахском и других языках
              </span>
              <span className={styles.langBannerBadge}>RU · EN · KZ</span>
              <button
                type="button"
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
      <div className={styles.headerSpacer} aria-hidden />
    </>
  );
}
