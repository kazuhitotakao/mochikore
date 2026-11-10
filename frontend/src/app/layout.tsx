import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "もちこれ",
  description: "用途ごとに持ち物・買い物のリストを作り、チェックして使うアプリ",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* D-73：スマホ幅を基準に1列で並べ、パソコンでは中央に最大640pxで表示する */}
        <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col px-4">
          {children}
        </div>
      </body>
    </html>
  );
}
