"use client";

import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type {
  ItemDeleteResult,
  PackingListDetail,
  PackingListItem,
} from "@/types/api";
import { AddItemForm } from "./AddItemForm";
import { DeletedItems, type DeletedItem } from "./DeletedItems";
import { ItemRow, itemCheckboxId } from "./ItemRow";
import { isNotFound } from "./itemErrors";
import { reorderVisibleItems } from "./itemOrder";
import { useDelayedHide } from "./useDelayedHide";
import {
  itemSortAnnouncements,
  restrictToVerticalAxis,
  screenReaderInstructions,
  useItemSortSensors,
} from "./itemSorting";
import { LIST_MENU_BUTTON_ID, ListMenu } from "./ListMenu";
import { MAX_ITEMS } from "./validation";

// 02_画面配置 共通4：結果の通知は数秒で消す
const NOTICE_DURATION_MS = 5000;

// API-07 と同じ並び（全体の sort_order、同じならid の小さい順）
function byListOrder(a: PackingListItem, b: PackingListItem): number {
  return a.sort_order - b.sort_order || a.id - b.id;
}

type Props = {
  list: PackingListDetail;
};

// SC-07 自分のリストの内容（通常画面）。持ち物の追加・削除で件数や公開の表示が変わるので、
// 画面の状態として持ち、保存できた値（D-71）で表示を更新する
export function ListDetail({ list }: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  // サーバーとブラウザで同じ値になるIDを渡し、読み上げ用の要素のIDをそろえる
  const dndId = useId();
  const sensors = useItemSortSensors();
  const [items, setItems] = useState(list.items);
  const [isPublic, setIsPublic] = useState(list.is_public);
  const [notice, setNotice] = useState<string | null>(null);
  // SC-07-12：この画面で削除した持ち物の候補（D-28）
  const [deletedItems, setDeletedItems] = useState<DeletedItem[]>([]);
  const [reordering, setReordering] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  // D-94：チェック済みは初めは隠す。画面の中だけの状態で、開き直すと隠した状態から始まる
  const [showChecked, setShowChecked] = useState(false);
  // 行が隠れた後にカーソルを移す先。表示が変わってから移すので、描画に使わない ref に置く
  const pendingFocusId = useRef<string | null>(null);
  const { delayedIds, hideLater, cancelHide } =
    useDelayedHide(handleHideDelayEnd);

  // D-95：件数・200件の上限は、隠れたチェック済みも含む全件（items）で判定し、表示だけを絞る。
  // 隠している間にチェックを付けた持ち物は、少しの間だけ表示に残す（delayedIds）
  const visibleItems = showChecked
    ? items
    : items.filter((item) => !item.is_checked || delayedIds.has(item.id));
  const checkedCount = items.filter((item) => item.is_checked).length;

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // SC-07-7：チェックして行が隠れたら、次の行（なければ表示切替のある「…」ボタン）へカーソルを移す
  useEffect(() => {
    const targetId = pendingFocusId.current;
    if (!targetId) return;
    pendingFocusId.current = null;
    document.getElementById(targetId)?.focus();
  }, [items, delayedIds]);

  // 少し待った後、チェック済みの行が表示から外れる直前に呼ばれる
  function handleHideDelayEnd(itemId: number) {
    // 待っている間に全部表示へ切り替えた・チェックを外した・削除したときは、何も隠れない
    if (showChecked) return;
    const index = items.findIndex((item) => item.id === itemId);
    if (!items[index]?.is_checked) return;

    // その行にカーソルがあるとき（またはどこにもないとき）だけ移す。
    // 待っている間に追加欄など別の所へ移っていたら、そのままにする
    const row = document.getElementById(itemCheckboxId(itemId))?.closest("li");
    const active = document.activeElement;
    const focusInRow = row && active && row.contains(active);
    const focusLost = !active || active === document.body;
    if (!focusInRow && !focusLost) return;

    const next = items.slice(index + 1).find((item) => !item.is_checked);
    pendingFocusId.current = next
      ? itemCheckboxId(next.id)
      : LIST_MENU_BUTTON_ID;
  }

  function handleAdded(item: PackingListItem) {
    // API-10：新しい持ち物は全体の末尾に入る
    setItems((current) => [...current, item]);
  }

  // API-11 の成功後に呼ばれる。保存できた値で更新するので、隠す・戻すのも保存できてから（D-94）
  function handleChanged(item: PackingListItem) {
    const before = items.find((existing) => existing.id === item.id);
    if (!showChecked && item.is_checked && before && !before.is_checked) {
      hideLater(item.id);
    }
    if (!item.is_checked) cancelHide(item.id);

    setItems((current) =>
      current.map((existing) => (existing.id === item.id ? item : existing)),
    );
  }

  // API-13：このリストのチェックを全部外した。持ち物・順番はそのまま
  function handleChecksReset() {
    setItems((current) =>
      current.map((item) => ({ ...item, is_checked: false })),
    );
  }

  function handleDeleted(item: PackingListItem, result: ItemDeleteResult) {
    const position = items.findIndex((existing) => existing.id === item.id) + 1;
    setItems((current) =>
      current.filter((existing) => existing.id !== item.id),
    );
    // 削除した持ち物は候補に移し、新しく削除したものを上に出す
    setDeletedItems((current) => [
      { item, position },
      ...current.filter((deleted) => deleted.item.id !== item.id),
    ]);
    // D-51：公開中のリストで最後の持ち物を削除すると、自動で非公開になる
    if (isPublic && !result.is_public) {
      setNotice("持ち物がなくなったため、リストを非公開にしました。");
    }
    setIsPublic(result.is_public);
  }

  // API-25：戻した持ち物だけを候補から外し、番号の位置に入れる（D-28・D-31）
  function handleRestored(item: PackingListItem) {
    setItems((current) =>
      [...current.filter((existing) => existing.id !== item.id), item].sort(
        byListOrder,
      ),
    );
    setDeletedItems((current) =>
      current.filter((deleted) => deleted.item.id !== item.id),
    );
    // D-95：チェック済みのまま戻した持ち物は、隠している間は見えないので案内する
    if (item.is_checked && !showChecked) {
      setNotice("戻しました。チェック済みにあります。");
    }
  }

  // SC-07-9・F-15：離したら自動で保存する（API-19）。動かした順に先に表示し、失敗したら元の順に戻す。
  // グループの見出しがあるときに同じグループの中だけで動かす制限は、手順書第15章で足す
  async function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;

    // D-95：チェック済みを隠しているときは、表示中の持ち物の位置だけを入れ替える
    const before = items;
    const moved = reorderVisibleItems(
      before,
      visibleItems,
      Number(active.id),
      Number(over.id),
    );

    setItems(moved);
    setReordering(true);
    setReorderError(null);
    try {
      await clientApi<void>(`/lists/${list.id}/items/order`, {
        method: "PATCH",
        body: { item_ids: moved.map((item) => item.id) },
      });
      // D-31：並べ替えた後は、削除した持ち物を戻すと一番下に入る
      setDeletedItems((current) =>
        current.map((deleted) => ({ ...deleted, movesToBottom: true })),
      );
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      if (isNotFound(failure)) {
        router.refresh();
        return;
      }
      setItems(before);
      setReorderError(reorderErrorMessage(failure));
    } finally {
      setReordering(false);
    }
  }

  return (
    <>
      {/* 画面下に固定した追加欄に、最後の持ち物が隠れないよう余白をとる */}
      <div className="flex flex-col gap-6 pb-40">
        {/* SC-07-2・4 */}
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-bold wrap-break-word">{list.title}</h1>
            <p className="flex flex-wrap gap-x-3 text-sm text-zinc-600">
              <span>{list.category.name}</span>
              <span>{isPublic ? "公開" : "非公開"}</span>
              <span>
                {items.length}/{MAX_ITEMS}件
              </span>
            </p>
          </div>
          <ListMenu
            listId={list.id}
            title={list.title}
            showChecked={showChecked}
            checkedCount={checkedCount}
            onToggleChecked={() => setShowChecked((shown) => !shown)}
            onChecksReset={handleChecksReset}
          />
        </header>

        {/* SC-07-3：説明文があるときだけ。途中の改行はそのまま見せる */}
        {list.description && (
          <p className="whitespace-pre-wrap">{list.description}</p>
        )}

        {/* SC-07-11：持ち物0件と、全部チェック済みで隠しているときを分ける。
            グループの見出し（SC-07-6）は手順書第15章で足す */}
        {items.length === 0 ? (
          <p>持ち物はまだありません。</p>
        ) : visibleItems.length === 0 ? (
          <p>
            すべてチェック済みです。右上の「…」の『チェック済みを表示』から確認できます。
          </p>
        ) : (
          <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            accessibility={{
              announcements: itemSortAnnouncements(visibleItems),
              screenReaderInstructions,
            }}
            onDragEnd={(event) => void handleDragEnd(event)}
          >
            <SortableContext
              items={visibleItems}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col">
                {visibleItems.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    onChanged={handleChanged}
                    onDeleted={handleDeleted}
                    sortDisabled={reordering}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        <DeletedItems deletedItems={deletedItems} onRestored={handleRestored} />
      </div>

      {/* SC-07-13：持ち物の追加欄は画面下に固定する（D-73） */}
      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-300 bg-background">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-2 px-4 py-3">
          {notice && (
            <p role="status" className="text-sm">
              {notice}
            </p>
          )}
          {reorderError && (
            <p role="alert" className="text-sm text-red-700">
              {reorderError}
            </p>
          )}
          <AddItemForm
            listId={list.id}
            isFull={items.length >= MAX_ITEMS}
            onAdded={handleAdded}
          />
        </div>
      </div>
    </>
  );
}

// V-10：並べ替えの送信が正しくないのは、ほかの画面で持ち物が増減したときなので、読み直しを案内する
function reorderErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === "validation_error") {
    return "並べ替える持ち物の情報が正しくありません。リストを読み直してください。";
  }

  return NETWORK_ERROR_MESSAGE;
}
