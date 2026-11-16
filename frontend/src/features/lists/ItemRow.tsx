"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useDismiss } from "@/components/useDismiss";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { trimLikeLaravel } from "@/features/auth/validation";
import { clientApi } from "@/lib/api/client";
import type { ItemDeleteResult, PackingListItem } from "@/types/api";
import { isNotFound, itemErrorMessage } from "./itemErrors";
import { SwipeDeleteLayer } from "./SwipeDeleteLayer";
import { useSwipeToDelete } from "./useSwipeToDelete";
import { validateItemName } from "./validation";

type Props = {
  item: PackingListItem;
  onChanged: (item: PackingListItem) => void;
  onDeleted: (item: PackingListItem, result: ItemDeleteResult) => void;
  // SC-07-10・17：「よく使う項目に保存」を選んだとき
  onSaveAsFavorite: (item: PackingListItem) => void;
  // 並べ替えの保存中は、続けて動かせないようにする
  sortDisabled: boolean;
  // ドラッグ中のすき間は、実際に置けるときだけ示す。
  dropAllowed?: boolean;
  // D-105：左スワイプで「削除」を出している行か。開けるのは1行だけなので、親が持つ
  swipeOpen: boolean;
  onSwipeOpenChange: (open: boolean) => void;
};

// 行が隠れたときに、次の行のチェック欄へカーソルを移すためのID（SC-07-7）
export function itemCheckboxId(itemId: number): string {
  return `item-checkbox-${itemId}`;
}

// SC-07-7〜10 持ち物の行。左からチェック、名前、「…」。行のどこをつかんでも並べ替えられる（SC-07-9）
export function ItemRow({
  item,
  onChanged,
  onDeleted,
  onSaveAsFavorite,
  sortDisabled,
  dropAllowed = false,
  swipeOpen,
  onSwipeOpenChange,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const {
    active,
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    // 名前を入力している間は並べ替えない
    disabled: sortDisabled || editing,
    // D-98：別のグループへ動かせるので、どのグループの持ち物かを相手に伝える
    data: { groupId: item.group_id },
    attributes: { role: "listitem", roleDescription: "並べ替えできる持ち物" },
  });
  // 行そのものを持ち手にする。キーボードは行にカーソルがあるときだけ持ち上げ、
  // 中のボタン・入力欄でのスペースキーは、それぞれの操作に使う
  const setRowRef = useCallback(
    (node: HTMLLIElement | null) => {
      setNodeRef(node);
      setActivatorNodeRef(node);
    },
    [setNodeRef, setActivatorNodeRef],
  );
  const redirectIfAuthError = useAuthErrorRedirect();
  const menuId = useId();
  const errorId = useId();
  const [draft, setDraft] = useState(item.name);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainer = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useDismiss(menuContainer, menuOpen, closeMenu);
  const [error, setError] = useState<string | null>(null);
  // D-105：「…」の「削除」と同じく、確認なしで削除して「削除した持ち物」へ移す（D-27）。
  // 名前の入力中・送信中・メニューを開いている間・並べ替えの保存中・ドラッグ中は横に引かない
  const swipeContainer = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToDelete({
    container: swipeContainer,
    disabled: sortDisabled || editing || busy || menuOpen || active !== null,
    open: swipeOpen,
    onOpenChange: onSwipeOpenChange,
    onDelete: () => void deleteItem(),
  });

  // 404・401などで画面を移動・読み直ししたら true
  function handleMovingError(failure: unknown): boolean {
    if (redirectIfAuthError(failure)) return true;
    if (isNotFound(failure)) {
      router.refresh();
      return true;
    }
    return false;
  }

  // SC-07-8：入力を確定したら保存する（API-11）
  async function saveName() {
    if (busy) return;

    // 変わっていなければ送らずに戻す
    if (trimLikeLaravel(draft) === item.name) {
      setEditing(false);
      setError(null);
      return;
    }

    const invalid = validateItemName(draft);
    if (invalid) {
      setError(invalid);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const saved = await clientApi<PackingListItem>(`/items/${item.id}`, {
        method: "PATCH",
        body: { name: draft },
      });
      onChanged(saved);
      setEditing(false);
    } catch (failure) {
      if (handleMovingError(failure)) return;
      // 共通10：失敗しても入力中の名前は残す
      setError(itemErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // 日本語の変換を確定する Enter では保存しない
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void saveName();
    }
    if (event.key === "Escape") {
      setDraft(item.name);
      setError(null);
      setEditing(false);
    }
  }

  // SC-07-7・F-06：チェックを押したら保存し、保存できた値で表示する。
  // 保存が終わるまで表示を変えないので、失敗したときは元の状態のまま（02_画面配置 SC-07-7）
  async function toggleChecked() {
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      const saved = await clientApi<PackingListItem>(`/items/${item.id}`, {
        method: "PATCH",
        body: { is_checked: !item.is_checked },
      });
      onChanged(saved);
    } catch (failure) {
      if (handleMovingError(failure)) return;
      setError(itemErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  // SC-07-10：確認なしで削除する（API-12、D-27）
  async function deleteItem() {
    setMenuOpen(false);
    setBusy(true);
    setError(null);
    try {
      const result = await clientApi<ItemDeleteResult>(`/items/${item.id}`, {
        method: "DELETE",
      });
      onDeleted(item, result);
    } catch (failure) {
      if (handleMovingError(failure)) return;
      setError(itemErrorMessage(failure));
      setBusy(false);
    }
  }

  return (
    // SC-07-9・D-03（利用者の指示で変更）：行のどこをつかんでも上下に動かせる。
    // チェック・名前の入力欄・「…」から始めた操作は、並べ替えにしない（components/dragSensors）
    <li
      ref={setRowRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // 横の動きは左スワイプ（D-105）に使うので、ブラウザには縦のスクロールと拡大だけを任せる
      className={`flex cursor-grab touch-pan-y touch-pinch-zoom flex-col border-b border-zinc-200 bg-background select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 ${isDragging ? (dropAllowed ? "relative" : "opacity-0") : ""}`}
    >
      {isDragging && dropAllowed && (
        // D-98：すき間の寸法と移動先の判定を変えず、収まる場所を枠の形でも示す。
        <div
          aria-hidden="true"
          data-drag-insertion
          className="pointer-events-none absolute inset-x-0 inset-y-1 z-10 rounded-lg border-2 border-dashed border-sky-400 bg-sky-50"
        />
      )}
      <div
        ref={swipeContainer}
        className={`relative ${swipe.offset < 0 ? "overflow-hidden" : ""}`}
      >
        <SwipeDeleteLayer
          visible={swipe.offset < 0}
          open={swipe.isOpen}
          label={`${item.name}を削除`}
          // 消す前に閉じる。「削除した持ち物」から戻したときに、開いたまま戻さない
          onDelete={() => {
            onSwipeOpenChange(false);
            void deleteItem();
          }}
        />
        {/* 行の中身だけを横にずらし、下の赤い「削除」を見せる。並べ替えの位置（li の transform）とは分ける */}
        <div
          {...swipe.handlers}
          style={
            swipe.offset < 0
              ? { transform: `translateX(${swipe.offset}px)` }
              : undefined
          }
          className={`relative flex flex-col gap-1 bg-background py-2 ${swipe.swiping ? "" : "transition-transform duration-200"}`}
        >
          <div
            className={`flex items-center gap-2 ${isDragging ? "opacity-0" : ""}`}
          >
            <input
              type="checkbox"
              id={itemCheckboxId(item.id)}
              checked={item.is_checked}
              disabled={busy}
              aria-label={item.name}
              aria-describedby={errorId}
              onChange={() => void toggleChecked()}
              className="size-5 shrink-0"
            />
            {editing ? (
              <input
                type="text"
                value={draft}
                autoFocus
                aria-label="持ち物名"
                aria-invalid={Boolean(error)}
                aria-describedby={errorId}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setError(null);
                }}
                onKeyDown={handleKeyDown}
                // エラーを出している間は、ほかを押しただけでは送り直さない
                onBlur={() => {
                  if (!error) void saveName();
                }}
                className="min-w-0 flex-1 rounded border border-zinc-400 px-2 py-1"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDraft(item.name);
                  setEditing(true);
                }}
                className="min-w-0 flex-1 cursor-grab text-left wrap-break-word"
              >
                {item.name}
              </button>
            )}

            <div ref={menuContainer} data-no-drag className="relative">
              <button
                type="button"
                aria-label={`${item.name}の操作`}
                aria-expanded={menuOpen}
                aria-controls={menuId}
                disabled={busy}
                onClick={() => setMenuOpen((open) => !open)}
                // 指で押しやすいよう、押せる範囲を44px四方以上にする（利用者の指示）
                className="flex min-h-11 min-w-11 items-center justify-center rounded px-2 disabled:opacity-50"
              >
                …
              </button>
              {/* SC-07-10 */}
              {menuOpen && (
                <ul
                  id={menuId}
                  className="absolute right-0 z-10 mt-1 w-48 rounded border border-zinc-300 bg-background py-1 shadow"
                >
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onSaveAsFavorite(item);
                      }}
                      className="block w-full px-4 py-2 text-left"
                    >
                      よく使う項目に保存
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => void deleteItem()}
                      className="block w-full px-4 py-2 text-left text-red-700"
                    >
                      削除
                    </button>
                  </li>
                </ul>
              )}
            </div>
          </div>

          {error && (
            <p
              id={errorId}
              role="alert"
              className={`text-sm text-red-700 ${isDragging ? "opacity-0" : ""}`}
            >
              {error}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
