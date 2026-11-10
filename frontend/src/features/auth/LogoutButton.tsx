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
    <div>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className="rounded border border-zinc-400 px-4 py-2 disabled:opacity-50"
      >
        ログアウト
      </button>
    </div>
  );
}
