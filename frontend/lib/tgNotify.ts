import { HttpsProxyAgent } from "https-proxy-agent";
import * as https from "https";

const TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
const PROXY   = process.env.HTTPS_PROXY || process.env.https_proxy;

export function tgNotify(text: string): void {
  if (!TOKEN || !CHAT_ID) {
    console.warn("[tgNotify] TOKEN или CHAT_ID не заданы");
    return;
  }

  const body   = JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" });
  const path   = `/bot${TOKEN}/sendMessage`;
  const agent  = PROXY ? new HttpsProxyAgent(PROXY) : undefined;

  const req = https.request(
    {
      hostname: "api.telegram.org",
      port: 443,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      agent,
    },
    (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => console.error("[tgNotify] Ошибка:", res.statusCode, data));
      } else {
        res.resume();
      }
    }
  );

  req.on("error", (e) => console.error("[tgNotify] request failed:", e.message));
  req.setTimeout(15000, () => { req.destroy(); console.error("[tgNotify] timeout"); });
  req.write(body);
  req.end();
}
