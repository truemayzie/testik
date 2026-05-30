import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      id?: string;
      role?: string;
      banned?: boolean;
      createdAt?: string;
      /** Есть ли предпросмотр до оплаты (всегда для авторизованных) */
      previewAvailable?: boolean;
      /** −20% на первую оплаченную работу (роль user, ещё не было succeeded-оплаты) */
      firstOrderDiscountEligible?: boolean;
    };
  }
}
