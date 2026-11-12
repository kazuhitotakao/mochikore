"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type { SavedGroup } from "@/types/api";

// 読み込んだ候補。null は読み込み中
export type CandidatesState = { savedGroups: SavedGroup[] } | { error: string };

type Props = {
  candidates: CandidatesState | null;
  // 下書きにある丸の名前。同じ名前の候補は「追加済み」にして押せなくする
  takenNames: readonly string[];
  // グループが20件のときは押せない（D-57）
  full: boolean;
  onPick: (name: string) => void;
  onRemoved: (savedGroupId: number) => void;
  onRetry: () => void;
};

/**
 * SC-09-11・12：「グループを追加」の入力欄の下に出す、よく使うグループの候補（F-28、D-102）。
 * このリストのカテゴリーの候補だけを、新しく保存した順に出す。カテゴリーは切り替えない。
 * 押すと、名前を入力して確定したときと同じく丸を下書きに足す（OK まで保存しない）。
 */
export function SavedGroupCandidates({
  candidates,
  takenNames,
  full,
  onPick,
  onRemoved,
  onRetry,
}: Props) {
  const redirectIfAuthError = useAuthErrorRedirect();
  const [deleteTarget, setDeleteTarget] = useState<SavedGroup | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // SC-09-12：確認してから完全に削除する（API-41）。下書きの丸・ほかのリストのグループは残る
  async function handleDelete() {
    if (!deleteTarget) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      await clientApi<void>(`/saved-groups/${deleteTarget.id}`, {
        method: "DELETE",
      });
      onRemoved(deleteTarget.id);
      setDeleteTarget(null);
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      // ほかの画面で先に削除されていたら、消えたものとして候補から外す
      if (failure instanceof ApiError && failure.status === 404) {
        onRemoved(deleteTarget.id);
        setDeleteTarget(null);
        return;
      }
      setDeleteError(NETWORK_ERROR_MESSAGE);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section aria-label="よく使うグループ" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">よく使うグループ</h3>
      {candidates === null ? (
        // 共通3：応答を待つ間だけ出す
        <p role="status" className="text-sm">
          読み込み中…
        </p>
      ) : "error" in candidates ? (
        // SC-09-1：候補を読めなくても、名前を入力して追加できる
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-700">
            {candidates.error}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded border border-zinc-400 px-3 py-1 text-sm"
          >
            もう一度読み込む
          </button>
        </div>
      ) : candidates.savedGroups.length === 0 ? (
        <p className="text-sm text-zinc-600">
          保存したグループはありません。丸の「…」から保存できます。
        </p>
      ) : (
        <ul className="flex max-h-48 flex-col overflow-y-auto">
          {candidates.savedGroups.map((savedGroup) => {
            const taken = takenNames.includes(savedGroup.name);
            return (
              <li
                key={savedGroup.id}
                className="flex items-center gap-3 border-b border-zinc-200 py-1"
              >
                <button
                  type="button"
                  onClick={() => onPick(savedGroup.name)}
                  disabled={taken || full}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1 wrap-break-word">
                    {savedGroup.name}
                  </span>
                  {/* 色だけでなく文字でも、追加できない理由を示す */}
                  {taken && <span className="shrink-0 text-xs">追加済み</span>}
                </button>
                <button
                  type="button"
                  aria-label={`${savedGroup.name}を候補から削除`}
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteTarget(savedGroup);
                  }}
                  className="shrink-0 rounded px-2 py-1 text-sm text-red-700"
                >
                  削除
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        message="この候補を削除しますか？"
        confirmLabel="削除する"
        cancelLabel="やめる"
        busy={deleting}
        destructive
        error={deleteError}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
