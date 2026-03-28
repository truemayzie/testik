// lib/auth.ts — настройки NextAuth
// Провайдеры: Яндекс ID, VK ID, Email (magic link)

import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import EmailProvider from "next-auth/providers/email";
import { prisma } from "./prisma";
import { getDeviceId, deleteDeviceId } from "./vk-device-store";

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
      console.log("[VK] device_id found:", !!deviceId);
      const res = await fetch("https://id.vk.com/oauth2/auth", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const data = await res.json();
      console.log("[VK] token response:", JSON.stringify(data));
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
            html: `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Войти в Refai</title>
</head>
<body style="margin:0;padding:0;background-color:#0D0B2E;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0D0B2E">
    <tr>
      <td align="center" style="padding:48px 16px 56px;">

        <!-- Основная карточка -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" style="max-width:480px;width:100%;">

          <!-- Шапка с градиентом -->
          <tr>
            <td align="center" bgcolor="#4F46E5"
                style="background:#4F46E5;background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 50%,#5B21B6 100%);border-radius:20px 20px 0 0;padding:40px 40px 32px;">
              <!-- Иконка-звезда -->
              <div style="width:58px;height:58px;line-height:54px;background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.25);border-radius:16px;margin:0 auto 18px;text-align:center;font-size:28px;color:#fff;">
                ✦
              </div>
              <!-- Название -->
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:2rem;font-weight:800;color:#fff;letter-spacing:-0.02em;margin-bottom:6px;">
                Refai
              </div>
              <div style="font-size:0.72rem;color:rgba(255,255,255,0.55);letter-spacing:0.1em;text-transform:uppercase;">
                Генератор учебных работ
              </div>
            </td>
          </tr>

          <!-- Тело письма -->
          <tr>
            <td bgcolor="#1E1B4B"
                style="background:#1E1B4B;border-left:1px solid rgba(255,255,255,0.08);border-right:1px solid rgba(255,255,255,0.08);padding:40px 40px 36px;">

              <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:1.55rem;font-weight:700;color:#fff;margin:0 0 14px;line-height:1.25;">
                Ссылка для входа
              </h1>
              <p style="font-size:0.95rem;color:rgba(255,255,255,0.62);margin:0 0 30px;line-height:1.7;">
                Вы запросили вход в <strong style="color:#A78BFA;font-weight:600;">Refai</strong>.
                Нажмите на кнопку ниже — ссылка одноразовая и действует 24&nbsp;часа.
              </p>

              <!-- Кнопка CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding-bottom:32px;">
                    <a href="${url}"
                       style="display:inline-block;background:#6366F1;background:linear-gradient(135deg,#6366F1 0%,#8B5CF6 100%);color:#fff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:1rem;font-weight:700;padding:17px 44px;border-radius:12px;letter-spacing:0.02em;box-shadow:0 4px 20px rgba(99,102,241,0.45);">
                      Войти в аккаунт →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Разделитель -->
              <div style="height:1px;background:rgba(255,255,255,0.08);margin-bottom:28px;"></div>

              <!-- Возможности -->
              <p style="font-size:0.78rem;color:rgba(255,255,255,0.35);margin:0 0 12px;letter-spacing:0.04em;text-transform:uppercase;font-weight:600;">
                С Refai вы можете
              </p>
              <table role="presentation" cellpadding="0" cellspacing="4" border="0" width="100%">
                <tr>
                  <td style="padding:5px 0;font-size:0.88rem;color:rgba(255,255,255,0.58);line-height:1.5;">
                    ⚡&nbsp; Генерировать рефераты, эссе, курсовые и ВКР за 2–5 минут
                  </td>
                </tr>
                <tr>
                  <td style="padding:5px 0;font-size:0.88rem;color:rgba(255,255,255,0.58);line-height:1.5;">
                    📄&nbsp; Получать DOCX с оформлением по ГОСТ 7.32-2017
                  </td>
                </tr>
                <tr>
                  <td style="padding:5px 0;font-size:0.88rem;color:rgba(255,255,255,0.58);line-height:1.5;">
                    📚&nbsp; Сохранять историю работ в личном кабинете
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Подвал -->
          <tr>
            <td bgcolor="#100E2A"
                style="background:#100E2A;border-radius:0 0 20px 20px;border:1px solid rgba(255,255,255,0.07);border-top:none;padding:24px 40px;text-align:center;">
              <p style="font-size:0.78rem;color:rgba(255,255,255,0.28);margin:0 0 8px;line-height:1.65;">
                Ссылка действует <strong style="color:rgba(255,255,255,0.45);">24 часа</strong> и может быть использована только один раз.<br>
                Если вы не запрашивали вход — просто проигнорируйте это письмо.
              </p>
              <p style="font-size:0.72rem;color:rgba(255,255,255,0.18);margin:10px 0 0;">
                © 2026 Refai &nbsp;·&nbsp;
                <a href="mailto:support@ref-ai.ru" style="color:rgba(255,255,255,0.28);text-decoration:none;">support@ref-ai.ru</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
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
  debug: true,
};
