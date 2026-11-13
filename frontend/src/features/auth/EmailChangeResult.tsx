"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import { EmailChangeForm } from "./EmailChangeForm";
import { emailChangeApiPath } from "./emailChangeLink";
import { useAuthErrorRedirect } from "./useAuthErrorRedirect";
import type { VerificationLink } from "./verificationLink";

type Props = {
  currentEmail: string;
  pendingEmail: string | null;
  link: VerificationLink | null;
  hasLink: boolean;
  currentPath: string;
  initialWaitSeconds: number;
};
type Status = "idle" | "verifying" | "changed" | "invalid" | "failed";

// SC-13：画面を開いた後にだけ確定し、SSR・先読みでは更新しない（D-72）
export function EmailChangeResult({
  currentEmail,
  pendingEmail,
  link,
  hasLink,
  currentPath,
  initialWaitSeconds,
}: Props) {
  const router = useRouter();
  const redirectOnAuthError = useAuthErrorRedirect();
  const [status, setStatus] = useState<Status>(
    hasLink ? (link ? "verifying" : "invalid") : "idle",
  );
  const [attempt, setAttempt] = useState(0);
  const lastRequest = useRef<string | null>(null);
  const apiPath = link ? emailChangeApiPath(link) : null;

  useEffect(() => {
    if (!apiPath) return;
    const key = `${attempt}:${apiPath}`;
    if (lastRequest.current === key) return;
    lastRequest.current = key;
    clientApi(apiPath, { method: "POST" })
      .then(() => {
        setStatus("changed");
        router.refresh();
      })
      .catch((error: unknown) => {
        if (redirectOnAuthError(error, currentPath)) return;
        setStatus(
          error instanceof ApiError && error.code === "link_invalid"
            ? "invalid"
            : "failed",
        );
      });
  }, [apiPath, attempt, currentPath, router, redirectOnAuthError]);

  if (status === "verifying")
    return <p role="status">メールアドレスの変更を確認しています…</p>;
  if (status === "changed")
    return <p role="status">メールアドレスを変更しました。</p>;

  return (
    <div className="flex flex-col gap-6">
      {status === "invalid" && (
        <p role="alert" className="text-red-700">
          リンクの有効期限が切れているか、無効です。
        </p>
      )}
      {status === "failed" && (
        <div className="flex flex-col gap-3">
          <p role="alert" className="text-red-700">
            {NETWORK_ERROR_MESSAGE}
          </p>
          <button
            type="button"
            onClick={() => {
              setStatus("verifying");
              setAttempt((value) => value + 1);
            }}
            className="self-start rounded border border-zinc-400 px-4 py-2"
          >
            もう一度確認する
          </button>
        </div>
      )}
      {pendingEmail && (
        <>
          <div className="flex flex-col gap-2">
            <p>
              送信先：
              <span className="font-medium break-all">{pendingEmail}</span>
            </p>
            <p>メールに届くリンクを開いてください。リンクは60分間有効です。</p>
            <p>変更を確定するまでは、現在のメールアドレスを使います。</p>
          </div>
          <EmailChangeForm
            currentEmail={currentEmail}
            pendingEmail={pendingEmail}
            initialWaitSeconds={initialWaitSeconds}
            onSent={() => setStatus("idle")}
          />
        </>
      )}
    </div>
  );
}
