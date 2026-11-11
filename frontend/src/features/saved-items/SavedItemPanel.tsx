"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type {
  BulkAddResult,
  Category,
  GroupingState,
  PackingListItem,
  SavedItem,
} from "@/types/api";

// V-13：一括追加（API-34）の競合と、入力が正しくないときの文言
const CONFLICT_MESSAGE = "リストが変更されています。読み直してください。";
const CHOOSE_AGAIN_MESSAGE = "追加する項目を選び直してください。";

type Props = {
  listId: number;
  // SC-08-3：候補のカテゴリーの初期値は、このリストのカテゴリー
  listCategoryId: number;
  categories: Category[];
  onClose: () => void;
  // 追加できた持ち物（選んだ順）。親は SC-07 に足してパネルを閉じる
  onAdded: (items: PackingListItem[]) => void;
  // 409 で読み直した、このリストの最新の持ち物
  onListReloaded: (items: PackingListItem[]) => void;
};

// 読み込んだ結果。どの読み込みの結果かを key で区別し、古い結果を表示しない
type Loaded =
  { key: string; savedItems: SavedItem[] } | { key: string; error: string };
type Revision = { key: number; value: number } | { key: number; error: string };

// SC-08 よく使う項目の選択（SC-07内パネル、F-22）。開くたびに作り直すので、親は開いている間だけ表示する。
// 自分のリストの内容（SC-07）の削除した持ち物の候補・チェック済みの表示切替は SC-07 側にあり、開け閉めで消えない
export function SavedItemPanel({
  listId,
  listCategoryId,
  categories,
  onClose,
  onAdded,
  onListReloaded,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const [categoryId, setCategoryId] = useState(listCategoryId);
  const [reloadCount, setReloadCount] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [revisionLoadCount, setRevisionLoadCount] = useState(0);
  const [revision, setRevision] = useState<Revision | null>(null);
  // SC-08-4：選んだ順に持つ。API-34 はこの順で末尾へ追加する（12_手動テスト 37-01）。
  // カテゴリーを切り替えても残すので、違うカテゴリーの候補もまとめて追加できる
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const requestKey = `${categoryId}-${reloadCount}`;
  // 今のカテゴリーの読み込みが終わるまでは null（読み込み中）
  const current = loaded?.key === requestKey ? loaded : null;
  const currentRevision = revision?.key === revisionLoadCount ? revision : null;
  const baseRevision =
    currentRevision && "value" in currentRevision
      ? currentRevision.value
      : null;

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

  // SC-08-1：開いたときに、一括追加に使う最新の grouping_revision を読む（API-29、D-79）
  useEffect(() => {
    let ignore = false;
    clientApi<GroupingState>(`/lists/${listId}/grouping`)
      .then((state) => {
        if (!ignore) {
          setRevision({
            key: revisionLoadCount,
            value: state.grouping_revision,
          });
        }
      })
      .catch((failure: unknown) => {
        if (ignore || redirectIfAuthError(failure)) return;
        // リストがほかの画面で削除されていたら、読み直して「ページが見つかりません」にする
        if (failure instanceof ApiError && failure.status === 404) {
          router.refresh();
          return;
        }
        setRevision({ key: revisionLoadCount, error: NETWORK_ERROR_MESSAGE });
      });
    return () => {
      ignore = true;
    };
  }, [listId, revisionLoadCount, redirectIfAuthError, router]);

  function toggleSelected(savedItemId: number) {
    setAddError(null);
    setSelectedIds((selected) =>
      selected.includes(savedItemId)
        ? selected.filter((id) => id !== savedItemId)
        : [...selected, savedItemId],
    );
  }

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
    setSelectedIds((selected) => selected.filter((id) => id !== savedItemId));
  }

  // SC-08-6：409 のときは最新の状態を読み直して表示する。新しい revision で自動では送り直さない
  async function reloadAfterConflict() {
    try {
      const state = await clientApi<GroupingState>(`/lists/${listId}/grouping`);
      setRevision({ key: revisionLoadCount, value: state.grouping_revision });
      onListReloaded(state.items);
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      setRevision({ key: revisionLoadCount, error: NETWORK_ERROR_MESSAGE });
    }
  }

  // SC-08-6：選んだ候補をまとめて追加する（API-34）。送信中は押せない
  async function handleAdd() {
    if (adding || selectedIds.length === 0 || baseRevision === null) return;

    setAdding(true);
    setAddError(null);
    try {
      const result = await clientApi<BulkAddResult>(
        `/lists/${listId}/items/bulk`,
        {
          method: "POST",
          body: { saved_item_ids: selectedIds, base_revision: baseRevision },
        },
      );
      onAdded(result.items);
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;

      if (!(failure instanceof ApiError)) {
        setAddError(NETWORK_ERROR_MESSAGE);
      } else if (failure.status === 404) {
        router.refresh();
      } else if (failure.code === "grouping_conflict") {
        setAddError(CONFLICT_MESSAGE);
        await reloadAfterConflict();
      } else if (failure.code === "item_limit_reached") {
        // 選んだ候補は残し、減らしてから送り直せるようにする
        setAddError("持ち物は200件までです。");
      } else if (failure.code === "validation_error") {
        // ほかの画面で候補が削除されたときなど。選び直してもらうため、選択を外して候補を読み直す
        setAddError(CHOOSE_AGAIN_MESSAGE);
        setSelectedIds([]);
        setReloadCount((count) => count + 1);
      } else {
        setAddError(NETWORK_ERROR_MESSAGE);
      }
    } finally {
      setAdding(false);
    }
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
        // Esc は「閉じる」と同じ。削除の確認を開いているとき・追加の送信中は閉じない
        event.preventDefault();
        if (!deleteTarget && !adding) onClose();
      }}
      className="mx-auto mt-auto mb-0 w-full max-w-[640px] rounded-t bg-background p-0 text-foreground backdrop:bg-black/40"
    >
      <div className="flex max-h-[80vh] flex-col gap-4 px-4 py-4">
        {/* SC-08-2：閉じても追加しない */}
        <div className="flex items-center justify-between gap-3">
          <h2 id="saved-item-panel-heading" className="text-lg font-bold">
            よく使う項目から追加
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={adding}
            className="rounded border border-zinc-400 px-3 py-1 disabled:opacity-50"
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
            // SC-08-4：新しく保存した順（D-72）。行を押すと選択・解除する。
            // 選ぶ印は、持ち物の完了チェック（四角）と違う丸い印と「選択中」の文字で示す
            <ul className="flex flex-col">
              {current.savedItems.map((savedItem) => {
                const selected = selectedIds.includes(savedItem.id);
                return (
                  <li
                    key={savedItem.id}
                    className="flex items-center gap-3 border-b border-zinc-200 py-2"
                  >
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleSelected(savedItem.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span
                        aria-hidden="true"
                        className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-sm ${
                          selected
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-400"
                        }`}
                      >
                        {selected ? "✓" : ""}
                      </span>
                      <span className="min-w-0 flex-1 wrap-break-word">
                        {savedItem.name}
                      </span>
                      {selected && (
                        <span className="shrink-0 text-xs">選択中</span>
                      )}
                    </button>
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
                );
              })}
            </ul>
          )}
        </div>

        {/* SC-08-6：選択件数と「追加」。1件以上選ぶと押せる */}
        <div className="flex flex-col gap-2 border-t border-zinc-300 pt-3">
          {addError && (
            <p role="alert" className="text-sm text-red-700">
              {addError}
            </p>
          )}
          {currentRevision && "error" in currentRevision && (
            <div className="flex items-center gap-3">
              <p role="alert" className="text-sm text-red-700">
                {currentRevision.error}
              </p>
              <button
                type="button"
                onClick={() => setRevisionLoadCount((count) => count + 1)}
                className="shrink-0 rounded border border-zinc-400 px-3 py-1 text-sm"
              >
                もう一度読み込む
              </button>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <p role="status">{selectedIds.length}件選択中</p>
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={
                selectedIds.length === 0 || adding || baseRevision === null
              }
              className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
            >
              追加
            </button>
          </div>
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
