import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    // Next.js 16.4 では、保存した開発用キャッシュを再起動で読み戻すと、
    // 画面が無限に再読み込みされることがある（vercel/next.js#100267）。
    // npm run build のたびに開発サーバーを止めて再開するので、修正版が出るまで保存しない
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
