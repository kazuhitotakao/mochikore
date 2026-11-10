"use client";

import { NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";

// 02_画面配置 共通10：読み込みが500・通信失敗になったときの共通の表示
export default function ErrorPage({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <main className="flex flex-col gap-4 py-8">
      <p role="alert">{NETWORK_ERROR_MESSAGE}</p>
      <button
        type="button"
        onClick={() => retry()}
        className="self-start rounded border border-zinc-400 px-4 py-2"
      >
        もう一度読み込む
      </button>
    </main>
  );
}
