"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import { ITEM_LIMIT_MESSAGE } from "./itemErrors";
import { useVerifiedUserGate } from "./useVerifiedUserGate";
import type { PackingList } from "@/types/api";

type Props = {
  // コピーのAPI。公開リスト詳細（SC-11）は API-17、限定公開のリスト（SC-18）は API-49（D-114）
  copyPath: string;
  loggedIn: boolean;
  emailVerified: boolean;
};

// SC-11-6・SC-18-5「自分用にコピー」。条件と動きはどちらの画面も同じ。画面下の枠は PublicListView が置く
export function CopyPublicListButton({
  copyPath,
  loggedIn,
  emailVerified,
}: Props) {
  const router = useRouter();
  const redirectOnAuthError = useAuthErrorRedirect();
  const requireVerifiedUser = useVerifiedUserGate(loggedIn, emailVerified);
  const busy = useRef(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    if (busy.current || !requireVerifiedUser()) return;
    const currentPath = window.location.pathname + window.location.search;

    busy.current = true;
    setSending(true);
    setError(null);
    try {
      const result = await clientApi<PackingList>(copyPath, {
        method: "POST",
      });
      // SC-11：移動が終わるまで送信中のままにし、同じ操作で複数コピーを作らない
      router.push(`/lists/${result.id}?copied=1`);
    } catch (failure) {
      // SC-11-6：コピーを押した時点でログイン・メール認証が必要なら、それぞれの画面へ案内する
      if (redirectOnAuthError(failure, currentPath)) return;
      if (failure instanceof ApiError && failure.code === "not_found") {
        router.refresh();
        return;
      }
      setError(copyErrorMessage(failure));
      busy.current = false;
      setSending(false);
    }
  }

  return (
    <>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={sending}
        onClick={() => void copy()}
        className="btn-primary"
      >
        {sending ? "コピー中…" : "自分用にコピー"}
      </button>
    </>
  );
}

// SC-11-6：コピーできなかった理由。画面は code で決める（D-53）
function copyErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return NETWORK_ERROR_MESSAGE;

  switch (error.code) {
    case "list_limit_reached":
      return "リストは100件までです。";
    // D-97：コピー元の持ち物が安全上限を超えるとき。コピーは1時間の回数には数えない
    case "item_limit_reached":
      return ITEM_LIMIT_MESSAGE;
    default:
      return NETWORK_ERROR_MESSAGE;
  }
}
