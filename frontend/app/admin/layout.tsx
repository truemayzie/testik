import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import AdminSidebar from "./AdminSidebar";
import styles from "./admin.module.css";

export const metadata = { title: "Refai — Админка" };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) redirect("/auth/signin");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (user?.role !== "admin") {
    return (
      <div className={styles.noAccess}>
        <div className={styles.noAccessIcon}>🚫</div>
        <h1 className={styles.noAccessTitle}>Нет доступа</h1>
        <p className={styles.noAccessText}>У вас недостаточно прав для просмотра этой страницы.</p>
        <a href="/" className={styles.noAccessLink}>← На главную</a>
      </div>
    );
  }

  return (
    <div className={styles.adminShell}>
      <AdminSidebar />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
