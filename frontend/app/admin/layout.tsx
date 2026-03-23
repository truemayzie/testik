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
  if (!session?.user?.email) redirect("/auth/signin");

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });

  if (user?.role !== "admin") redirect("/");

  return (
    <div className={styles.adminShell}>
      <AdminSidebar />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
