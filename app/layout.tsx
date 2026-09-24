import type { Metadata } from "next";
import { Gowun_Batang, Noto_Sans_KR } from "next/font/google";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

const serif = Gowun_Batang({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-serif",
});

const sans = Noto_Sans_KR({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "잉크웰 — 웹소설 작업실",
  description: "장르와 인물을 기억하고 다음 문장을 이어 쓰는 AI 웹소설 작업실",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`${serif.variable} ${sans.variable}`}>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
