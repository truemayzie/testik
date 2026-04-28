// lib/auth.ts — настройки NextAuth
// Провайдеры: Яндекс ID, VK ID, Email (magic link)

import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import EmailProvider from "next-auth/providers/email";
import { prisma } from "./prisma";
import { magicLinkHtml } from "./email";
import { getDeviceId, deleteDeviceId } from "./vk-device-store";
import { tgNotify } from "./tgNotify";

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

// ── VK провайдер (VK ID + PKCE) ──────────────────────────────────
const VKProvider = {
  id: "vk",
  name: "ВКонтакте",
  type: "oauth" as const,
  checks: ["pkce", "state"] as ["pkce", "state"],
  authorization: {
    url: "https://id.vk.com/authorize",
    params: {
      scope: "email",
      response_type: "code",
    },
  },
  token: {
    url: "https://id.vk.com/oauth2/auth",
    async request(context: {
      params: { code: string; device_id?: string; state?: string; [key: string]: string | undefined };
      provider: { clientId: string; clientSecret: string; callbackUrl: string };
      checks: { code_verifier?: string };
    }) {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: context.provider.clientId,
        client_secret: context.provider.clientSecret,
        redirect_uri: context.provider.callbackUrl,
        code: context.params.code,
      });
      // device_id от VK ID — не передаётся через стандартный OAuth context,
      // читаем из временного store (заполняется в route.ts при callback)
      const state = context.params.state as string | undefined;
      const deviceId = state ? getDeviceId(state) : undefined;
      if (deviceId) {
        body.set("device_id", deviceId);
        if (state) deleteDeviceId(state);
      }
      if (context.checks?.code_verifier) body.set("code_verifier", context.checks.code_verifier);
      const res = await fetch("https://id.vk.com/oauth2/auth", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const data = await res.json();
      return {
        tokens: {
          access_token: data.access_token,
          id_token: data.id_token,
          // email и user_id не кладём в tokens — они не нужны PrismaAdapter
          // и вызывают ошибку "Unknown argument user_id"
        },
      };
    },
  },
  userinfo: {
    async request(context: {
      tokens: { access_token: string; id_token?: string };
      provider: { clientId: string };
    }) {
      // VK API возвращает имя на родном языке пользователя (Иван, а не Ivan)
      const apiRes = await fetch(
        `https://api.vk.com/method/users.get?fields=photo_200&access_token=${context.tokens.access_token}&v=5.131`
      );
      const apiData = await apiRes.json();
      const u = apiData.response?.[0];
      if (u) {
        // email берём из VK ID user_info, т.к. VK API его не возвращает
        const idRes = await fetch("https://id.vk.com/oauth2/user_info", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            access_token: context.tokens.access_token,
            client_id: context.provider.clientId,
          }),
        });
        const idData = await idRes.json();
        const email = idData.user?.email || null;
        return {
          id: String(u.id),
          name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || String(u.id),
          email,
          image: u.photo_200 ?? null,
        };
      }

      // Фолбэк: user_id из id_token
      const payload = context.tokens.id_token?.split(".")?.[1];
      const decoded = payload ? JSON.parse(Buffer.from(payload, "base64").toString()) : {};
      const userId = String(decoded.sub ?? "vk_user");
      return { id: userId, name: userId, email: null, image: null };
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    VKProvider as any,
    EmailProvider({
      from: process.env.EMAIL_FROM || "Refai <support@ref-ai.ru>",
      async sendVerificationRequest({ identifier: email, url }) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || "Refai <support@ref-ai.ru>",
            to: [email],
            subject: "Ссылка для входа в Refai",
            html: magicLinkHtml(url),
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

  events: {
    async createUser({ user }) {
      tgNotify(`👤 <b>Новый пользователь</b>\n${user.name || "—"} (${user.email || "без email"})`);
    },
  },

  session: {
    strategy: "database",
  },

  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};
