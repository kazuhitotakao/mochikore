"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";

// API-24：同じアドレスへの再送は60秒あける
const RESEND_INTERVAL_SECONDS = 60;

// SC-04-5「確認メールを送り直す」
export function ResendVerificationButton() {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (waitSeconds <= 0) return;
    const timer = setTimeout(() => setWaitSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [waitSeconds]);

  async function handleClick() {
    setSending(true);
    setMessage(null);

    try {
      await clientApi("/email/verification-notification", { method: "POST" });
      setMessage("確認メールを送り直しました。");
      // SC-04-5：送信したら1分間は押せない
      setWaitSeconds(RESEND_INTERVAL_SECONDS);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace(`/login?next=${encodeURIComponent("/verify-email")}`);
        return;
      }
      if (error instanceof ApiError && error.code === "too_many_requests") {
        setWaitSeconds(error.retryAfter ?? RESEND_INTERVAL_SECONDS);
      } else {
        setMessage(NETWORK_ERROR_MESSAGE);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={sending || waitSeconds > 0}
        className="self-start rounded border border-zinc-400 px-4 py-2 disabled:opacity-50"
      >
        確認メールを送り直す
      </button>
      {waitSeconds > 0 && (
        <p role="status">あと{waitSeconds}秒で送り直せます</p>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
