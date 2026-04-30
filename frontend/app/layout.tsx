import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import Header from "./components/Header";
import Footer from "./components/Footer";
import GenerationWidget from "./components/GenerationWidget";
import TelegramSupport from "./components/TelegramSupport";
import { safeJsonLd } from "@/lib/safeJsonLd";

export const metadata: Metadata = {
  title: "Refai — Генератор учебных работ на ИИ | Реферат за 2 минуты",
  description: "Генератор рефератов, курсовых и дипломов на ИИ. Уникальный текст 80%+, оформление по ГОСТ 7.32-2017, реальные источники 2020–2025. Готово за 2 минуты.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Refai — Генератор учебных работ на ИИ",
    description: "Рефераты, курсовые, ВКР за 2–8 минут. ГОСТ 7.32-2017, реальные источники, уникальность 70–90%.",
    url: "https://ref-ai.ru",
    siteName: "Refai",
    images: [{ url: "https://ref-ai.ru/og-image.png", width: 1200, height: 630, alt: "Refai — Генератор учебных работ на ИИ" }],
    locale: "ru_RU",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Refai — Генератор учебных работ на ИИ",
    description: "Рефераты, курсовые, ВКР за 2–8 минут. ГОСТ, реальные источники.",
    images: ["https://ref-ai.ru/og-image.png"],
  },
  verification: {
    google: 'p1ep5ZwgTpZLx_v2nbMaRLcqOVu5GdiWqhy1g7OC2-8',
    other: {
      'yandex-verification': 'f057543c18db56dd',
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="format-detection" content="telephone=no, email=no, address=no" />

        {/* Preload критичных шрифтов — кириллица загружается первой */}
        <link rel="preload" href="/fonts/golos-text-cyrillic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/pt-serif-400-cyrillic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/pt-serif-700-cyrillic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />

        {/* Google Analytics */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-G1QKHNT5Y9" />
        <script dangerouslySetInnerHTML={{ __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-G1QKHNT5Y9');
        `}} />

        {/* Yandex Metrika */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(m,e,t,r,i,k,a){
            m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
            m[i].l=1*new Date();
            for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
            k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
          })(window,document,'script','https://mc.yandex.ru/metrika/tag.js?id=108284268','ym');
          ym(108284268,'init',{ssr:true,webvisor:true,clickmap:true,ecommerce:"dataLayer",referrer:document.referrer,url:location.href,accurateTrackBounce:true,trackLinks:true});
        `}} />
        <noscript dangerouslySetInnerHTML={{ __html: `<div><img src="https://mc.yandex.ru/watch/108284268" style="position:absolute;left:-9999px;" alt="" /></div>` }} />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Refai',
            url: 'https://ref-ai.ru',
            applicationCategory: 'EducationApplication',
            operatingSystem: 'Web',
            description: 'Генератор рефератов, курсовых и дипломов на ИИ. Уникальный текст, оформление по ГОСТ 7.32-2017, реальные источники.',
            offers: {
              '@type': 'Offer',
              price: '99',
              priceCurrency: 'RUB',
            },
          }) }}
        />
      </head>
      <body>
        <Providers>
          <Header />
          {children}
          <Footer />
          <GenerationWidget />
          <TelegramSupport />
        </Providers>
      </body>
    </html>
  );
}
