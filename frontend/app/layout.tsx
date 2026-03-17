import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import Header from "./components/Header";
import Footer from "./components/Footer";

export const metadata: Metadata = {
  title: "Academic Service — Генератор учебных работ",
  description: "Генерация рефератов, курсовых и других учебных работ по ГОСТ",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        <Providers>
          <Header />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
