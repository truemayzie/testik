import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      id?: string;
      role?: string;
      banned?: boolean;
      createdAt?: string;
      /** Есть ли ещё бесплатный предпросмотр (или админ) */
      previewAvailable?: boolean;
      previewQuota?: number;
      previewUses?: number;
      previewRemaining?: number;
      /** −20% на первую оплаченную работу (роль user, ещё не было succeeded-оплаты) */
      firstOrderDiscountEligible?: boolean;
    };
  }
}
