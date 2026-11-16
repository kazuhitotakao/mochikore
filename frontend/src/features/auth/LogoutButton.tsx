"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { clientApi } from "@/lib/api/client";
import { NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";

// SC-12-6 ログアウト
export function LogoutButton() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setSubmitting(true);
    setError(null);

    try {
      await clientApi("/logout", { method: "POST" });
      router.replace("/");
    } catch {
      // Laravel のトークンを無効にできなかったときは Cookie が残るので、もう一度押せる
      setError(NETWORK_ERROR_MESSAGE);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className="btn-outline w-full"
      >
        ログアウト
      </button>
    </div>
  );
}
