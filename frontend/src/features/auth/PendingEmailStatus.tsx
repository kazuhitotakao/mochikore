"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { clientApi } from "@/lib/api/client";
import { NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import { useAuthErrorRedirect } from "./useAuthErrorRedirect";

type Props = {
  // API-04 は確認リンクの期限内だけ値を返す（D-107）
  pendingEmail: string | null;
};

// SC-12-3：確認中の変更先と「変更を取り消す」（API-43・D-107）
export function PendingEmailStatus({ pendingEmail }: Props) {
  const router = useRouter();
  const redirectOnAuthError = useAuthErrorRedirect();
  const busy = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setError(null);

    try {
      await clientApi("/me/email-change", { method: "DELETE" });
      setCancelled(true);
      // 保存した内容から読み直し、「確認メールの案内を開く」も消す
      router.refresh();
    } catch (failure) {
      if (!redirectOnAuthError(failure)) setError(NETWORK_ERROR_MESSAGE);
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  return (
    <>
      {pendingEmail && !cancelled && (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="break-all">確認中：{pendingEmail}</p>
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitting}
            className="underline tap-target disabled:opacity-50"
          >
            変更を取り消す
          </button>
        </div>
      )}
      {cancelled && <p role="status">メールアドレスの変更を取り消しました。</p>}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </>
  );
}
