"use client";

import { useEffect, useState } from "react";

// 02_画面配置 共通4：ほかの結果通知と同じく、5秒で消す
const NOTICE_DURATION_MS = 5000;

// 新しいリストへ移ったときの通知。公開リストのコピー（SC-11-6・SC-18-5）。
// 自分のリストの複製は一覧（SC-05）に残るので、一覧の通知で知らせる（D-120）
const MESSAGES = {
  copied: "リストをコピーしました。",
} as const;

export type ListCreatedKind = keyof typeof MESSAGES;

export function ListCreatedNotice({ kind }: { kind: ListCreatedKind }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // 再読み込みで同じ完了通知を出し直さないよう、表示のきっかけを取り除く
    const url = new URL(window.location.href);
    url.searchParams.delete(kind);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);

    const timer = setTimeout(() => setVisible(false), NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [kind]);

  if (!visible) return null;

  return (
    <p
      role="status"
      className="rounded-xl border border-brand/30 bg-brand-soft px-4 py-3 text-brand-deep"
    >
      {MESSAGES[kind]}
    </p>
  );
}
