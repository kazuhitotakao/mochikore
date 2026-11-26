"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Icon } from "@/components/Icon";
import { useDismiss } from "@/components/useDismiss";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { MENU_ITEM, MenuLabel, MenuSection } from "@/features/lists/ListMenu";
import { SwipeDeleteLayer } from "@/features/lists/SwipeDeleteLayer";
import { useSwipeToDelete } from "@/features/lists/useSwipeToDelete";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type { CombinedView, PackingListSummary } from "@/types/api";
import { CombinedViewDialog } from "./CombinedViewDialog";
import { combinedViewPath } from "./returnPath";

// 確認・編集のダイアログで「キャンセル」を押した後に、カーソルを戻す「…」の項目
type MenuItemKey = "edit" | "delete";

// 一覧から外れた理由。gone は、ほかの画面で先に削除されていたとき
export type CombinedViewRemovedReason = "deleted" | "gone";

type Props = {
  view: CombinedView;
  // 編集で選べるリスト（自分のリスト一覧と同じ順）
  lists: PackingListSummary[];
  // D-105：左スワイプで「削除」を出しているカードか。開けるのは1枚だけなので、親が持つ
  swipeOpen: boolean;
  onSwipeOpenChange: (open: boolean) => void;
  onRemoved: (reason: CombinedViewRemovedReason) => void;
  onSaved: () => void;
};

// カードと中のリンクの角丸（globals.css の card と同じ）。左スワイプで出す赤い「削除」の角もそろえる
const CARD_RADIUS = "rounded-[0.875rem]";

/**
 * SC-05-9 まとめ表示のカード（F-37、D-124）。押すとまとめ表示（SC-20）を開き、右上の「…」から編集・削除ができる。
 * スマホでは左にスワイプしても削除できる（リストのカードと同じ、D-105・D-120）。
 * 消してもリストと持ち物は残るが、まとめ表示は戻せないので確認する。
 */
export function CombinedViewCard({
  view,
  lists,
  swipeOpen,
  onSwipeOpenChange,
  onRemoved,
  onSaved,
}: Props) {
  const redirectIfAuthError = useAuthErrorRedirect();
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainer = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useDismiss(menuContainer, menuOpen, closeMenu);
  // 削除の確認。「…」から開いたときは「キャンセル」で「…」へ戻す（D-73）
  const [confirming, setConfirming] = useState<"menu" | "swipe" | null>(null);
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focusAfterReopen = useRef<MenuItemKey | null>(null);
  const swipeContainer = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToDelete({
    container: swipeContainer,
    disabled: menuOpen || confirming !== null || editing || sending,
    // SC-05 は並べ替えがないので、押してから少し間をおいて引いても横に動かす
    dragOnHold: false,
    open: swipeOpen,
    onOpenChange: onSwipeOpenChange,
    onDelete: () => openConfirm("swipe"),
  });

  // 子の確認・編集のダイアログが閉じてから項目へカーソルを移す（リストのカードと同じ）
  useEffect(() => {
    const item = focusAfterReopen.current;
    if (!menuOpen || !item) return;
    focusAfterReopen.current = null;
    menuContainer.current
      ?.querySelector<HTMLElement>(`[data-menu-item="${item}"]`)
      ?.focus();
  }, [menuOpen]);

  function reopenMenu(item: MenuItemKey) {
    focusAfterReopen.current = item;
    setMenuOpen(true);
  }

  function openConfirm(from: "menu" | "swipe") {
    setMenuOpen(false);
    setError(null);
    setConfirming(from);
  }

  // API-69：まとめ表示だけを消す。一覧から外れるとこのカードも消えるので、送信中のまま親へ渡す（二重に送らない）
  async function handleDelete() {
    setSending(true);
    setError(null);
    try {
      await clientApi<void>(`/combined-views/${view.id}`, { method: "DELETE" });
      onRemoved("deleted");
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      // ほかの画面で先に削除されていたら、一覧から外して読み直す（D-43）
      if (failure instanceof ApiError && failure.status === 404) {
        onRemoved("gone");
        return;
      }
      setError(NETWORK_ERROR_MESSAGE);
      setSending(false);
    }
  }

  return (
    <li>
      {/* 横の動きは左スワイプ（D-105）に使うので、ブラウザには縦のスクロールと拡大だけを任せる */}
      <div
        ref={swipeContainer}
        className={`relative touch-pan-y touch-pinch-zoom ${CARD_RADIUS} ${swipe.offset < 0 ? "overflow-hidden" : ""}`}
      >
        <SwipeDeleteLayer
          visible={swipe.offset < 0}
          open={swipe.isOpen}
          label={`${view.name}を削除`}
          onDelete={() => {
            onSwipeOpenChange(false);
            openConfirm("swipe");
          }}
        />
        <div
          {...swipe.handlers}
          style={
            swipe.offset < 0
              ? { transform: `translateX(${swipe.offset}px)` }
              : undefined
          }
          className={`relative flex items-start card hover:border-line-strong ${swipe.swiping ? "" : "transition-transform duration-200"}`}
        >
          <Link
            href={combinedViewPath(view.id)}
            prefetch={false}
            data-combined-view-link
            className={`flex min-w-0 flex-1 items-start gap-3 py-3 pl-4 ${CARD_RADIUS} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
          >
            {/* 縦に並んだ2枚のカードの印で、1つのリストではないことを形でも示す */}
            <Icon
              name="combined"
              className="mt-0.5 size-5 shrink-0 text-brand"
            />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-medium wrap-break-word">{view.name}</span>
              <span className="text-sm wrap-break-word text-muted">
                {view.lists.length > 0
                  ? view.lists.map((list) => list.title).join("・")
                  : "表示できるリストがありません"}
              </span>
            </span>
          </Link>

          {/* リストのカードと同じく、右上に「…」を置く */}
          <div ref={menuContainer} className="relative shrink-0 p-0.5">
            <button
              type="button"
              aria-label={`${view.name}の操作`}
              aria-expanded={menuOpen}
              aria-controls={menuId}
              disabled={sending}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-muted hover:bg-sunken disabled:opacity-50"
            >
              …
            </button>
            {menuOpen && (
              <div
                id={menuId}
                className="absolute right-0 z-30 mt-1 flex w-64 flex-col menu py-1"
              >
                <MenuSection>
                  <li>
                    <button
                      type="button"
                      data-menu-item="edit"
                      onClick={() => {
                        setMenuOpen(false);
                        setEditing(true);
                      }}
                      className={MENU_ITEM}
                    >
                      <MenuLabel icon="edit">まとめ表示を編集</MenuLabel>
                    </button>
                  </li>
                </MenuSection>
                <MenuSection divided>
                  <li>
                    <button
                      type="button"
                      data-menu-item="delete"
                      onClick={() => openConfirm("menu")}
                      className={`${MENU_ITEM} text-danger`}
                    >
                      <MenuLabel icon="trash" danger>
                        まとめ表示を削除
                      </MenuLabel>
                    </button>
                  </li>
                </MenuSection>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirming !== null}
        message={`「${view.name}」を削除しますか？リストと持ち物は消えません。`}
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        busy={sending}
        destructive
        error={error}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          const from = confirming;
          setConfirming(null);
          if (from === "menu") reopenMenu("delete");
        }}
      />

      {editing && (
        <CombinedViewDialog
          view={view}
          initialListIds={view.lists.map((list) => list.id)}
          lists={lists}
          onCancel={() => {
            setEditing(false);
            reopenMenu("edit");
          }}
          onSaved={() => {
            setEditing(false);
            onSaved();
          }}
        />
      )}
    </li>
  );
}
