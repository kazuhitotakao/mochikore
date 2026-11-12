"use client";

import { useEffect, useState } from "react";

// 02_画面配置 共通4：ほかの結果通知と同じく、5秒で消す
const NOTICE_DURATION_MS = 5000;

export function CopyPublicListNotice() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // 再読み込みで同じ完了通知を出し直さないよう、表示のきっかけを取り除く
    const url = new URL(window.location.href);
    url.searchParams.delete("copied");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);

    const timer = setTimeout(() => setVisible(false), NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <p
      role="status"
      className="rounded border border-green-300 bg-green-50 px-4 py-3 text-green-900"
    >
      リストをコピーしました。
    </p>
  );
}
