"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type { PackingList } from "@/types/api";

type Props = {
  listId: number;
  loggedIn: boolean;
  emailVerified: boolean;
};

export function CopyPublicListButton({
  listId,
  loggedIn,
  emailVerified,
}: Props) {
  const router = useRouter();
  const redirectOnAuthError = useAuthErrorRedirect();
  const busy = useRef(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    if (busy.current) return;
    const currentPath = window.location.pathname + window.location.search;
    if (!loggedIn) {
      router.push(`/login?${new URLSearchParams({ next: currentPath })}`);
      return;
    }
    if (!emailVerified) {
      router.push("/verify-email");
      return;
    }

    busy.current = true;
    setSending(true);
    setError(null);
    try {
      const result = await clientApi<PackingList>(
        `/public/lists/${listId}/copy`,
        { method: "POST" },
      );
      // SC-11：移動が終わるまで送信中のままにし、同じ操作で複数コピーを作らない
      router.push(`/lists/${result.id}?copied=1`);
    } catch (failure) {
      // SC-11-6：コピーを押した時点でログイン・メール認証が必要なら、それぞれの画面へ案内する
      if (redirectOnAuthError(failure, currentPath)) return;
      if (failure instanceof ApiError && failure.code === "not_found") {
        router.refresh();
        return;
      }
      setError(
        failure instanceof ApiError && failure.code === "list_limit_reached"
          ? "リストは100件までです。"
          : NETWORK_ERROR_MESSAGE,
      );
      busy.current = false;
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-zinc-300 bg-background">
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-2 px-4 py-3">
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={sending}
          onClick={() => void copy()}
          className="rounded bg-zinc-900 px-4 py-3 text-white disabled:opacity-50"
        >
          {sending ? "コピー中…" : "自分用にコピー"}
        </button>
      </div>
    </div>
  );
}
