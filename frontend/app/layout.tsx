import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import Header from "./components/Header";
import Footer from "./components/Footer";
import GenerationWidget from "./components/GenerationWidget";

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
        <meta name="format-detection" content="telephone=no, email=no, address=no" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
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
        </Providers>
      </body>
    </html>
  );
}
