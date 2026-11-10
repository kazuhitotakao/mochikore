"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import { verificationApiPath, type VerificationLink } from "./verificationLink";

type Props = {
  link: VerificationLink;
  // ログインし直した後に、このリンクへ戻るためのパス
  currentPath: string;
};

type Status = "verifying" | "invalid" | "failed";

// SC-04-6 認証の結果。画面を開いた後に API-23 を呼ぶ（D-72）。
// メールの安全確認のために先にリンクを開くサービスは JavaScript を動かさないので、認証は起きない
export function EmailVerificationLink({ link, currentPath }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("verifying");
  // 開発中の Strict Mode では effect が2回動くので、1回だけ送る
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    clientApi(verificationApiPath(link))
      // SC-04-6：成功を伝えてSC-05へ移る。文は移動先で出す（SC-15の完了と同じ形）
      .then(() => router.replace("/lists?verified=1"))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          // SC-04-6：ログイン後にこのリンクへ戻って、続けて認証する
          router.replace(`/login?next=${encodeURIComponent(currentPath)}`);
          return;
        }
        setStatus(
          error instanceof ApiError && error.code === "link_invalid"
            ? "invalid"
            : "failed",
        );
      });
  }, [link, currentPath, router]);

  if (status === "verifying") {
    return <p role="status">メール認証を確認しています…</p>;
  }

  if (status === "invalid") {
    return (
      <div role="alert" className="text-red-700">
        <p>リンクの有効期限が切れているか、無効です。</p>
        <p>下のボタンから、確認メールを送り直してください。</p>
      </div>
    );
  }

  return (
    <p role="alert" className="text-red-700">
      {NETWORK_ERROR_MESSAGE}
    </p>
  );
}
