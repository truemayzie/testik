"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./admin.module.css";

const NAV = [
  { href: "/admin",           icon: "📊", label: "Дашборд" },
  { href: "/admin/seo-pages", icon: "🔎", label: "SEO и превью" },
  { href: "/admin/users",     icon: "👥", label: "Пользователи" },
  { href: "/admin/works",     icon: "📄", label: "Работы" },
  { href: "/admin/payments",  icon: "💳", label: "Платежи" },
  { href: "/admin/feedback",  icon: "💬", label: "Отзывы" },
  { href: "/admin/health",    icon: "🟢", label: "Статус системы" },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={styles.sidebar}>
        <Link href="/admin" className={styles.sidebarLogo}>
          <span className={styles.sidebarLogoIcon}>R</span>
          <span className={styles.sidebarLogoText}>Refai Admin</span>
        </Link>

        <div className={styles.sidebarSection}>
          <span className={styles.sidebarLabel}>Меню</span>
          {NAV.map(item => {
            const isActive =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.sidebarLink} ${isActive ? styles.sidebarLinkActive : ""}`}
              >
                <span className={styles.sidebarIcon}>{item.icon}</span>
                <span className={styles.sidebarLinkText}>{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div style={{ marginTop: "auto", padding: "0 12px" }}>
          <Link href="/" className={styles.sidebarLink} style={{ fontSize: "0.82rem" }}>
            <span className={styles.sidebarIcon}>←</span>
            <span className={styles.sidebarLinkText}>На сайт</span>
          </Link>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className={styles.mobileTabBar}>
        {NAV.map(item => {
          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.mobileTab} ${isActive ? styles.mobileTabActive : ""}`}
            >
              <span className={styles.mobileTabIcon}>{item.icon}</span>
              <span className={styles.mobileTabLabel}>{item.label}</span>
            </Link>
          );
        })}
        <Link href="/" className={styles.mobileTab}>
          <span className={styles.mobileTabIcon}>←</span>
          <span className={styles.mobileTabLabel}>Сайт</span>
        </Link>
      </nav>
    </>
  );
}
