// lib/auth.ts — настройки NextAuth
// Провайдеры: Яндекс ID, VK ID, Email (magic link)

import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import EmailProvider from "next-auth/providers/email";
import { prisma } from "./prisma";

// ── Яндекс провайдер ─────────────────────────────────────────────
const YandexProvider = {
  id: "yandex",
  name: "Яндекс",
  type: "oauth" as const,
  authorization: {
    url: "https://oauth.yandex.ru/authorize",
    params: { scope: "login:email login:info login:avatar" },
  },
  token: "https://oauth.yandex.ru/token",
  userinfo: "https://login.yandex.ru/info?format=json",
  clientId: process.env.YANDEX_CLIENT_ID!,
  clientSecret: process.env.YANDEX_CLIENT_SECRET!,
  profile(profile: {
    id: string;
    real_name?: string;
    display_name?: string;
    default_email?: string;
    default_avatar_id?: string;
  }) {
    return {
      id: profile.id,
      name: profile.real_name || profile.display_name,
      email: profile.default_email,
      image: profile.default_avatar_id
        ? `https://avatars.yandex.net/get-yapic/${profile.default_avatar_id}/islands-200`
        : null,
    };
  },
};

// ── VK провайдер ─────────────────────────────────────────────────
const VKProvider = {
  id: "vk",
  name: "ВКонтакте",
  type: "oauth" as const,
  authorization: {
    url: "https://oauth.vk.com/authorize",
    params: {
      scope: "email",
      v: "5.131",
      display: "page",
    },
  },
  token: {
    url: "https://oauth.vk.com/access_token",
    async request(context: {
      params: { code: string };
      provider: { clientId: string; clientSecret: string; callbackUrl: string };
    }) {
      const params = new URLSearchParams({
        client_id: context.provider.clientId,
        client_secret: context.provider.clientSecret,
        redirect_uri: context.provider.callbackUrl,
        code: context.params.code,
      });
      const res = await fetch(
        `https://oauth.vk.com/access_token?${params}`
      );
      const data = await res.json();
      return {
        tokens: {
          access_token: data.access_token,
          email: data.email,
          user_id: data.user_id,
        },
      };
    },
  },
  userinfo: {
    async request(context: {
      tokens: { access_token: string; email?: string; user_id?: string };
    }) {
      const res = await fetch(
        `https://api.vk.com/method/users.get?fields=photo_200&access_token=${context.tokens.access_token}&v=5.131`
      );
      const data = await res.json();
      const user = data.response[0];
      return {
        id: String(user.id),
        name: `${user.first_name} ${user.last_name}`,
        email: context.tokens.email,
        image: user.photo_200,
      };
    },
  },
  clientId: process.env.VK_CLIENT_ID!,
  clientSecret: process.env.VK_CLIENT_SECRET!,
  profile(profile: {
    id: string;
    name: string;
    email?: string;
    image?: string;
  }) {
    return {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      image: profile.image,
    };
  },
};

// ── Настройки NextAuth ───────────────────────────────────────────
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions["adapter"],

  providers: [
    YandexProvider,
    // VKProvider,  // Включить когда будет домен с https
    EmailProvider({
      from: process.env.EMAIL_FROM || "support@ref-ai.ru",
      async sendVerificationRequest({ identifier: email, url, provider }) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: provider.from,
            to: [email],
            subject: "Войти в Refai",
            html: `
              <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:40px 24px;background:#faf9f7;border-radius:8px;">
                <h2 style="color:#1a1a1a;margin:0 0 12px;">Ссылка для входа</h2>
                <p style="color:#555;margin:0 0 28px;line-height:1.6;">
                  Нажмите на кнопку ниже, чтобы войти в <strong>Refai</strong>:
                </p>
                <a href="${url}" style="display:inline-block;background:#2d5a8e;color:#fff;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:600;font-size:15px;">
                  Войти в аккаунт →
                </a>
                <p style="color:#999;font-size:12px;margin-top:28px;line-height:1.5;">
                  Ссылка действует 24 часа.<br>
                  Если вы не запрашивали вход — просто проигнорируйте это письмо.
                </p>
              </div>
            `,
          }),
        });
        if (!res.ok) {
          const error = await res.text();
          throw new Error(`Resend error: ${error}`);
        }
      },
    }),
  ],

  pages: {
    signIn: "/auth/signin",  // Наша кастомная страница входа
    error:  "/auth/signin",
  },

  callbacks: {
    async redirect({ baseUrl }) {
      return baseUrl;
    },
    // Добавляем id, role, banned пользователя в сессию
    async session({ session, user }) {
      if (session.user) {
        const u = user as typeof user & { role?: string; banned?: boolean };
        (session.user as typeof session.user & { id: string; role: string; banned: boolean }).id = u.id;
        (session.user as typeof session.user & { id: string; role: string; banned: boolean }).role = u.role ?? "user";
        (session.user as typeof session.user & { id: string; role: string; banned: boolean }).banned = u.banned ?? false;
      }
      return session;
    },
  },

  session: {
    strategy: "database",
  },

  secret: process.env.NEXTAUTH_SECRET,
};
