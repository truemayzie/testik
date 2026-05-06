"use client";

export type PaymentMarket = "ru" | "kz";

function hasKzHint(value: string): boolean {
  const v = value.toLowerCase();
  return v.includes("kz") || v.includes("kaz");
}

export function detectPaymentMarket(): PaymentMarket {
  if (typeof window === "undefined") return "ru";

  try {
    const qp = new URLSearchParams(window.location.search);
    const utmCampaign = qp.get("utm_campaign") || "";
    const utmSource = qp.get("utm_source") || "";
    const country = qp.get("country") || "";

    if (hasKzHint(utmCampaign) || hasKzHint(utmSource) || hasKzHint(country)) {
      return "kz";
    }
  } catch {
    // ignore and fallback
  }

  const lang = (navigator.language || "").toLowerCase();
  if (lang.startsWith("kk")) return "kz";

  return "ru";
}

