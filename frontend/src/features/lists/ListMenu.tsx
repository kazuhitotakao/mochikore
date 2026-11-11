"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";

type Props = {
  listId: number;
  title: string;
  onChecksReset: () => void;
};

type Confirming = "reset-checks" | "delete" | null;

// SC-07-4「…」メニュー。「グループを整理」は手順書第15章で足す
export function ListMenu({ listId, title, onChecksReset }: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openConfirm(kind: Exclude<Confirming, null>) {
    setMenuOpen(false);
    setError(null);
    setConfirming(kind);
  }

  // 401・403 email_not_verified・404 で画面を移動・読み直ししたら true
  function handleMovingError(failure: unknown): boolean {
    if (redirectIfAuthError(failure)) return true;

    // 共通9：ほかの画面で先に削除されていたら、読み直して「ページが見つかりません」にする（D-43）
    if (failure instanceof ApiError && failure.status === 404) {
      router.refresh();
      return true;
    }

    return false;
  }

  // SC-07-14・D-17：チェックだけ外し、持ち物は残す（API-13）
  async function handleResetChecks() {
    setSending(true);
    setError(null);

    try {
      await clientApi<void>(`/lists/${listId}/reset-checks`, {
        method: "POST",
      });
      onChecksReset();
      setConfirming(null);
    } catch (failure) {
      if (handleMovingError(failure)) return;
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    setSending(true);
    setError(null);

    try {
      await clientApi<void>(`/lists/${listId}`, { method: "DELETE" });
      // SC-07-15：削除したら自分のリスト一覧（SC-05）へ。戻るで消したリストを開かないよう置き換える。
      // 移動が終わるまで送信中のままにして、二重送信を防ぐ
      router.replace("/lists");
    } catch (failure) {
      if (handleMovingError(failure)) return;
      setError(NETWORK_ERROR_MESSAGE);
      setSending(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="リストの操作"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        onClick={() => setMenuOpen((open) => !open)}
        className="rounded border border-zinc-300 px-3 py-1"
      >
        …
      </button>

      {menuOpen && (
        <ul
          id={menuId}
          className="absolute right-0 z-10 mt-1 flex w-48 flex-col rounded border border-zinc-300 bg-background py-1 shadow"
        >
          <li>
            <Link
              href={`/lists/${listId}/edit`}
              prefetch={false}
              className="block px-4 py-2"
            >
              リストを編集
            </Link>
          </li>
          <li>
            <button
              type="button"
              onClick={() => openConfirm("reset-checks")}
              className="block w-full px-4 py-2 text-left"
            >
              チェックを全部外す
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => openConfirm("delete")}
              className="block w-full px-4 py-2 text-left text-red-700"
            >
              このリストを削除
            </button>
          </li>
        </ul>
      )}

      <ConfirmDialog
        open={confirming === "reset-checks"}
        message="このリストのチェックを全部外しますか？"
        confirmLabel="外す"
        cancelLabel="やめる"
        busy={sending}
        error={error}
        onConfirm={handleResetChecks}
        onCancel={() => setConfirming(null)}
      />

      {/* SC-07-15・D-26：実際のリスト名と、中の持ち物も消えることを伝える */}
      <ConfirmDialog
        open={confirming === "delete"}
        message={`「${title}」を削除しますか？中の持ち物も削除されます。`}
        confirmLabel="削除する"
        cancelLabel="やめる"
        busy={sending}
        destructive
        error={error}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
