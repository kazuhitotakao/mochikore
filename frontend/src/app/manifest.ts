import type { MetadataRoute } from "next";

// D-115：スマホのホーム画面に追加したとき、ブラウザの枠を隠してアプリのように開く。
// 電波がないときの機能（オフライン）は作らないので、Service Worker は置かない
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "もちこれ",
    short_name: "もちこれ",
    description:
      "用途ごとに持ち物・買い物のリストを作り、チェックして使うアプリ",
    lang: "ja",
    // SC-01：ログイン済みなら自分のリスト一覧（SC-05）へ移る（今までの動き）
    start_url: "/",
    scope: "/",
    display: "standalone",
    // 開くときの地と上の帯は、画面の地と同じ生成り（globals.css の background）
    background_color: "#fffdf8",
    theme_color: "#fffdf8",
    // app/icon.tsx が作る画像。絵は中心の円に収めてあるので、Android の丸い切り抜き（maskable）にも使う
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
