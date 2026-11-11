"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type { Category, SavedItem } from "@/types/api";

type Props = {
  // SC-08-3：候補のカテゴリーの初期値は、このリストのカテゴリー
  listCategoryId: number;
  categories: Category[];
  onClose: () => void;
};

// 読み込んだ結果。どの読み込みの結果かを key で区別し、古い結果を表示しない
type Loaded =
  { key: string; savedItems: SavedItem[] } | { key: string; error: string };

// SC-08 よく使う項目の選択（SC-07内パネル、F-22）。開くたびに作り直すので、親は開いている間だけ表示する。
// 自分のリストの内容（SC-07）の削除した持ち物の候補・チェック済みの表示切替は SC-07 側にあり、開け閉めで消えない。
// 候補を選んでまとめて追加する部分（API-29・34）は手順書第14章の次の順番で足す
export function SavedItemPanel({ listCategoryId, categories, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const redirectIfAuthError = useAuthErrorRedirect();
  const [categoryId, setCategoryId] = useState(listCategoryId);
  const [reloadCount, setReloadCount] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const requestKey = `${categoryId}-${reloadCount}`;
  // 今のカテゴリーの読み込みが終わるまでは null（読み込み中）
  const current = loaded?.key === requestKey ? loaded : null;

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  // SC-08-1・3：開いたとき・カテゴリーを切り替えたときに、そのカテゴリーの候補を読む（API-31）
  useEffect(() => {
    let ignore = false;
    clientApi<SavedItem[]>(`/saved-items?category_id=${categoryId}`)
      .then((savedItems) => {
        if (!ignore) setLoaded({ key: requestKey, savedItems });
      })
      .catch((failure: unknown) => {
        if (ignore || redirectIfAuthError(failure)) return;
        setLoaded({ key: requestKey, error: NETWORK_ERROR_MESSAGE });
      });
    return () => {
      ignore = true;
    };
  }, [categoryId, requestKey, redirectIfAuthError]);

  function removeSavedItem(savedItemId: number) {
    setLoaded((previous) =>
      previous && "savedItems" in previous
        ? {
            ...previous,
            savedItems: previous.savedItems.filter(
              (savedItem) => savedItem.id !== savedItemId,
            ),
          }
        : previous,
    );
  }

  // SC-08-7：確認してから完全に削除する（API-33）。追加済みの持ち物は残る（D-66）
  async function handleDelete() {
    if (!deleteTarget) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      await clientApi<void>(`/saved-items/${deleteTarget.id}`, {
        method: "DELETE",
      });
      removeSavedItem(deleteTarget.id);
      setDeleteTarget(null);
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      // ほかの画面で先に削除されていたら、消えたものとして一覧から外す
      if (failure instanceof ApiError && failure.status === 404) {
        removeSavedItem(deleteTarget.id);
        setDeleteTarget(null);
        return;
      }
      setDeleteError(NETWORK_ERROR_MESSAGE);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="saved-item-panel-heading"
      onCancel={(event) => {
        // Esc は「閉じる」と同じ。削除の確認を開いているときは、そちらだけを閉じる
        event.preventDefault();
        if (!deleteTarget) onClose();
      }}
      className="mx-auto mt-auto mb-0 w-full max-w-[640px] rounded-t bg-background p-0 text-foreground backdrop:bg-black/40"
    >
      <div className="flex max-h-[80vh] flex-col gap-4 px-4 py-4">
        {/* SC-08-2 */}
        <div className="flex items-center justify-between gap-3">
          <h2 id="saved-item-panel-heading" className="text-lg font-bold">
            よく使う項目から追加
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-zinc-400 px-3 py-1"
          >
            閉じる
          </button>
        </div>

        {/* SC-08-3：候補のカテゴリーだけを切り替える。リスト自体のカテゴリーは変えない */}
        <div>
          <label htmlFor="saved-item-category" className="block font-medium">
            カテゴリー
          </label>
          <select
            id="saved-item-category"
            value={categoryId}
            onChange={(event) => setCategoryId(Number(event.target.value))}
            className="w-full rounded border border-zinc-400 px-3 py-2"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="min-h-24 overflow-y-auto">
          {current === null ? (
            // 共通3：応答を待つ間だけ出す
            <p role="status">読み込み中…</p>
          ) : "error" in current ? (
            <div className="flex flex-col gap-2">
              <p role="alert" className="text-red-700">
                {current.error}
              </p>
              <button
                type="button"
                onClick={() => setReloadCount((count) => count + 1)}
                className="self-start rounded border border-zinc-400 px-3 py-1"
              >
                もう一度読み込む
              </button>
            </div>
          ) : current.savedItems.length === 0 ? (
            // SC-08-5
            <p>このカテゴリーの候補はありません。</p>
          ) : (
            // SC-08-4：新しく保存した順（D-72）。選ぶ印は次の順番で足す
            <ul className="flex flex-col">
              {current.savedItems.map((savedItem) => (
                <li
                  key={savedItem.id}
                  className="flex items-center gap-3 border-b border-zinc-200 py-2"
                >
                  <span className="min-w-0 flex-1 wrap-break-word">
                    {savedItem.name}
                  </span>
                  <button
                    type="button"
                    aria-label={`${savedItem.name}を候補から削除`}
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteTarget(savedItem);
                    }}
                    className="shrink-0 rounded px-2 py-1 text-sm text-red-700"
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

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
    </dialog>
  );
}
