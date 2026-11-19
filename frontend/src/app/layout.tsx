import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";

// D-73：端末ごとに書体が変わらないよう、画面の絵と同じ Noto Sans JP にそろえる（利用者の指示）。
// ビルドのときに取り込んで自分のサイトから配るので、利用者のブラウザは Google へ通信しない。
// 日本語の文字は細かく分けたファイルを、その画面で使う分だけ読み込む。先読みするのは英数字だけ
const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "もちこれ",
  description: "用途ごとに持ち物・買い物のリストを作り、チェックして使うアプリ",
  // D-115：iPhone でホーム画面に追加したときの表示名と、ブラウザの枠を隠して開く設定
  appleWebApp: {
    capable: true,
    title: "もちこれ",
    statusBarStyle: "default",
  },
};

// D-115：ホーム画面から開いたときの上の帯の色。画面の地（globals.css の background）と同じ生成り
export const viewport: Viewport = {
  themeColor: "#fffdf8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${notoSansJp.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* D-73：スマホ幅を基準に1列で並べ、パソコンでは中央に最大640pxで表示する。
            パソコンでは左右に生成り色の地を見せ、画面の地（少し明るい色）と線で分ける */}
        <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col bg-background px-5 sm:border-x sm:border-line">
          {children}
        </div>
      </body>
    </html>
  );
}
