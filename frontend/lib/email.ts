/**
 * lib/email.ts — отправка писем через Resend
 * Все шаблоны используют inline-стили (email-клиенты не поддерживают CSS-классы).
 * Дизайн: navy #061525 + amber #D97706 / #C9962A — повторяет палитру сайта.
 */

const RESEND_API = "https://api.resend.com/emails";

/** Обёртка над Resend API */
export async function sendEmail(to: string, subject: string, html: string) {
  const from = process.env.EMAIL_FROM || "Refai <support@ref-ai.ru>";
  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }
  return res.json();
}

// ─── Базовый layout ──────────────────────────────────────────────────────────

function base(body: string, footerNote?: string): string {
  const note = footerNote
    ? `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.22);margin:0 0 8px;line-height:1.65;">${footerNote}</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="ru" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
</head>
<body style="margin:0;padding:0;background-color:#061525;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#061525">
  <tr>
    <td align="center" style="padding:40px 16px 48px;">

      <!-- Card -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"
             style="max-width:520px;width:100%;background-color:#0B1829;border-radius:16px;border:1px solid rgba(255,255,255,0.07);">

        <!-- ── Logo header ─────────────────────────────────────────── -->
        <tr>
          <td align="center" style="padding:32px 40px 26px;border-bottom:1px solid rgba(201,150,42,0.18);">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
              <tr>
                <!-- Star icon (SVG — точный логотип сайта) -->
                <td style="vertical-align:middle;padding-right:10px;font-size:0;line-height:1;">
                  <svg width="22" height="22" viewBox="0 0 20 20" fill="none"
                       xmlns="http://www.w3.org/2000/svg" style="display:block;">
                    <path d="M10 1L11.8 8.2L19 10L11.8 11.8L10 19L8.2 11.8L1 10L8.2 8.2Z"
                          fill="#D97706"/>
                  </svg>
                </td>
                <!-- Logo text -->
                <td style="vertical-align:middle;">
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;
                              font-size:20px;font-weight:700;line-height:1;letter-spacing:-0.01em;color:#ffffff;">
                    Ref<span style="color:#D97706;">ai</span>
                  </div>
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;
                              font-size:9px;color:#475569;letter-spacing:0.12em;text-transform:uppercase;margin-top:3px;">
                    Генератор учебных работ
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── Тело ────────────────────────────────────────────────── -->
        ${body}

        <!-- ── Footer ──────────────────────────────────────────────── -->
        <tr>
          <td style="background-color:#060D1A;border-top:1px solid rgba(255,255,255,0.05);
                     border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">
            ${note}
            <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                      font-size:12px;color:rgba(255,255,255,0.2);margin:0;line-height:1.6;">
              &copy; 2026 Refai &nbsp;&middot;&nbsp;
              <a href="mailto:support@ref-ai.ru"
                 style="color:rgba(255,255,255,0.35);text-decoration:none;">support@ref-ai.ru</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;
}

// ─── Шаблон: Magic Link ──────────────────────────────────────────────────────

export function magicLinkHtml(url: string): string {
  const body = `
  <tr>
    <td style="padding:36px 40px 32px;">

      <h1 style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                 font-size:22px;font-weight:700;color:#ffffff;margin:0 0 12px;line-height:1.25;">
        Ссылка для входа
      </h1>
      <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                font-size:15px;color:#94A3B8;margin:0 0 28px;line-height:1.7;">
        Вы запросили вход в&nbsp;<strong style="color:#D4A843;font-weight:600;">Refai</strong>.
        Нажмите на кнопку ниже&nbsp;&mdash; ссылка одноразовая и действует
        <strong style="color:#ffffff;">24&nbsp;часа</strong>.
      </p>

      <!-- CTA кнопка -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td align="center" style="padding-bottom:32px;">
            <a href="${url}"
               style="display:inline-block;
                      background:linear-gradient(135deg,#C9962A 0%,#B8851F 100%);
                      color:#ffffff;text-decoration:none;
                      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                      font-size:16px;font-weight:700;
                      padding:16px 48px;border-radius:12px;letter-spacing:0.01em;">
              Войти в аккаунт&nbsp;&rarr;
            </a>
          </td>
        </tr>
      </table>

      <!-- Разделитель -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
        <tr>
          <td style="height:1px;background:rgba(255,255,255,0.07);font-size:0;line-height:0;">&nbsp;</td>
        </tr>
      </table>

      <!-- Возможности -->
      <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                font-size:10px;color:#475569;letter-spacing:0.1em;text-transform:uppercase;
                font-weight:600;margin:0 0 12px;">
        С Refai вы можете
      </p>
      <table role="presentation" cellpadding="0" cellspacing="4" border="0" width="100%">
        <tr>
          <td style="padding:5px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                     font-size:14px;color:#64748B;line-height:1.55;">
            &#9889;&nbsp; Генерировать рефераты, эссе, курсовые и ВКР за&nbsp;3&ndash;5&nbsp;минут
          </td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                     font-size:14px;color:#64748B;line-height:1.55;">
            &#128196;&nbsp; Получать DOCX с оформлением строго по&nbsp;ГОСТ
          </td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                     font-size:14px;color:#64748B;line-height:1.55;">
            &#128218;&nbsp; Хранить историю работ в&nbsp;личном кабинете
          </td>
        </tr>
      </table>

    </td>
  </tr>`;

  return base(body, "Ссылка действует <strong style=\"color:rgba(255,255,255,0.4);\">24&nbsp;часа</strong> и может быть использована только один раз. Если вы не запрашивали вход&nbsp;&mdash; просто проигнорируйте это письмо.");
}

// ─── Шаблон: Работа готова ───────────────────────────────────────────────────

export function generationReadyHtml(
  topic: string,
  workType: string,
  generationId: string,
  appUrl: string
): string {
  const dashboardUrl = `${appUrl}/dashboard`;
  const ratingBase   = `${appUrl}/api/feedback?generationId=${generationId}&rating=`;

  const body = `
  <tr>
    <td style="padding:36px 40px 32px;">

      <!-- Badge тип работы -->
      <div style="display:inline-block;background:rgba(201,150,42,0.12);
                  border:1px solid rgba(201,150,42,0.28);border-radius:6px;
                  padding:4px 12px;margin-bottom:18px;">
        <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                     font-size:11px;font-weight:700;color:#D4A843;letter-spacing:0.06em;">
          ${workType.toUpperCase()}
        </span>
      </div>

      <h1 style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                 font-size:22px;font-weight:700;color:#ffffff;margin:0 0 10px;line-height:1.25;">
        Ваша работа готова!
      </h1>
      <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                font-size:15px;color:#94A3B8;margin:0 0 28px;line-height:1.7;">
        ${workType} на тему&nbsp;<strong style="color:#CBD5E1;">&laquo;${topic}&raquo;</strong>
        сгенерирован и сохранён в&nbsp;вашем личном кабинете.
      </p>

      <!-- CTA кнопка -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td align="center" style="padding-bottom:32px;">
            <a href="${dashboardUrl}"
               style="display:inline-block;
                      background:linear-gradient(135deg,#C9962A 0%,#B8851F 100%);
                      color:#ffffff;text-decoration:none;
                      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                      font-size:16px;font-weight:700;
                      padding:16px 48px;border-radius:12px;letter-spacing:0.01em;">
              Открыть личный кабинет&nbsp;&rarr;
            </a>
          </td>
        </tr>
      </table>

      <!-- Разделитель -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
        <tr>
          <td style="height:1px;background:rgba(255,255,255,0.07);font-size:0;line-height:0;">&nbsp;</td>
        </tr>
      </table>

      <!-- Блок оценки -->
      <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                font-size:10px;color:#475569;letter-spacing:0.1em;text-transform:uppercase;
                font-weight:600;margin:0 0 14px;text-align:center;">
        Как вам результат?
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td align="center">
            <a href="${ratingBase}1" style="font-size:28px;color:#C9962A;text-decoration:none;padding:0 3px;" title="1 — Плохо">&#9733;</a
            ><a href="${ratingBase}2" style="font-size:28px;color:#C9962A;text-decoration:none;padding:0 3px;" title="2 — Слабо">&#9733;</a
            ><a href="${ratingBase}3" style="font-size:28px;color:#C9962A;text-decoration:none;padding:0 3px;" title="3 — Нормально">&#9733;</a
            ><a href="${ratingBase}4" style="font-size:28px;color:#C9962A;text-decoration:none;padding:0 3px;" title="4 — Хорошо">&#9733;</a
            ><a href="${ratingBase}5" style="font-size:28px;color:#C9962A;text-decoration:none;padding:0 3px;" title="5 — Отлично">&#9733;</a>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top:8px;">
            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                         font-size:12px;color:#334155;">Нажмите на нужную звезду</span>
          </td>
        </tr>
      </table>

    </td>
  </tr>`;

  return base(body);
}
