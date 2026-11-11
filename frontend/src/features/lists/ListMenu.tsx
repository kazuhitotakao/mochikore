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
};

// SC-07-4「…」メニュー。今は「リストを編集」「このリストを削除」だけ。
// 「グループを整理」「チェックを全部外す」は、その機能を作るときに足す
export function ListMenu({ listId, title }: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    try {
      await clientApi<void>(`/lists/${listId}`, { method: "DELETE" });
      // SC-07-15：削除したら自分のリスト一覧（SC-05）へ。戻るで消したリストを開かないよう置き換える。
      // 移動が終わるまで送信中のままにして、二重送信を防ぐ
      router.replace("/lists");
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;

      // 共通9：ほかの画面で先に削除されていたら、読み直して「ページが見つかりません」にする（D-43）
      if (failure instanceof ApiError && failure.status === 404) {
        router.refresh();
        return;
      }

      setError(NETWORK_ERROR_MESSAGE);
      setDeleting(false);
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
              onClick={() => {
                setMenuOpen(false);
                setError(null);
                setConfirming(true);
              }}
              className="block w-full px-4 py-2 text-left text-red-700"
            >
              このリストを削除
            </button>
          </li>
        </ul>
      )}

      {/* SC-07-15・D-26：実際のリスト名と、中の持ち物も消えることを伝える */}
      <ConfirmDialog
        open={confirming}
        message={`「${title}」を削除しますか？中の持ち物も削除されます。`}
        confirmLabel="削除する"
        cancelLabel="やめる"
        busy={deleting}
        error={error}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
