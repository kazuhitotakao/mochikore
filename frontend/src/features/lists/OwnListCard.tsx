"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useDismiss } from "@/components/useDismiss";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import { formatDate } from "@/lib/format";
import type { PackingListSummary } from "@/types/api";
import { CollaborativeBadge } from "./CollaborativeBadge";
import { DuplicateListDialog } from "./DuplicateListDialog";
import { editHrefFromIndex } from "./editReturn";
import { MENU_ITEM, MenuLabel, MenuSection } from "./ListMenu";
import { PublicBadge } from "./PublicBadge";
import { SwipeDeleteLayer } from "./SwipeDeleteLayer";
import { useSwipeToDelete } from "./useSwipeToDelete";

// 確認・複製のダイアログで「やめる」を押した後に、カーソルを戻す「…」の項目
type MenuItemKey = "duplicate" | "delete" | "leave";

// 一覧から外れた理由。gone は、ほかの画面で先に削除された・メンバーから外されていたとき
export type RemovedReason = "deleted" | "left" | "gone";

type Props = {
  list: PackingListSummary;
  // D-105：左スワイプで「削除」を出しているカードか。開けるのは1枚だけなので、親が持つ
  swipeOpen: boolean;
  onSwipeOpenChange: (open: boolean) => void;
  onRemoved: (reason: RemovedReason) => void;
  onDuplicated: () => void;
};

// カードと中のリンクの角丸（globals.css の card と同じ）。左スワイプで出す赤い「削除」の角もそろえる
const CARD_RADIUS = "rounded-[0.875rem]";

/**
 * SC-05-4・6 自分のリストのカード（D-120）。押すとリストの内容（SC-07）へ移り、右上の「…」から
 * 編集・複製・削除ができる。スマホでは左にスワイプしても削除できる（持ち物の行と同じ、D-105）。
 * リストの削除は元に戻せないので、どこから消すときも確認する（D-26）。
 * 共同編集で参加しているリスト（所有者でない）は、編集・削除の代わりに「このリストから抜ける」を出し、
 * 左スワイプは使わない（D-119）。
 */
export function OwnListCard({
  list,
  swipeOpen,
  onSwipeOpenChange,
  onRemoved,
  onDuplicated,
}: Props) {
  const redirectIfAuthError = useAuthErrorRedirect();
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainer = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useDismiss(menuContainer, menuOpen, closeMenu);
  // 削除の確認。「…」から開いたときは「やめる」で「…」へ戻す（SC-07-4 の確認と同じ、D-73）
  const [confirming, setConfirming] = useState<"menu" | "swipe" | null>(null);
  // D-119：参加しているリストから抜ける確認
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 「…」を開き直したときにカーソルを移す項目。描画に使わないので ref に置く
  const focusAfterReopen = useRef<MenuItemKey | null>(null);
  const focusAfterDuplicate = useRef(false);
  // 「…」を開いている間・確認や複製のダイアログを出している間は横に引かない
  const swipeContainer = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToDelete({
    container: swipeContainer,
    disabled:
      !list.is_owner ||
      menuOpen ||
      confirming !== null ||
      duplicating ||
      sending,
    // SC-05 は並べ替えがないので、押してから少し間をおいて引いても横に動かす
    dragOnHold: false,
    open: swipeOpen,
    onOpenChange: onSwipeOpenChange,
    // 長く引いて離したときも、消す前に確認する（グループの見出しと同じ、D-105）
    onDelete: () => openConfirm("swipe"),
  });

  // 子の確認・複製のダイアログが閉じてから項目へカーソルを移す（ListMenu と同じ）
  useEffect(() => {
    const item = focusAfterReopen.current;
    if (!menuOpen || !item) return;
    focusAfterReopen.current = null;
    menuContainer.current
      ?.querySelector<HTMLElement>(`[data-menu-item="${item}"]`)
      ?.focus();
  }, [menuOpen]);

  // 複製できてダイアログを閉じた後は、「…」のボタンへカーソルを戻す（開いた元の操作へ戻れるように）。
  // ダイアログを開いている間は後ろの画面を操作できないので、閉じてから移す
  useEffect(() => {
    if (duplicating || !focusAfterDuplicate.current) return;
    focusAfterDuplicate.current = false;
    menuContainer.current?.querySelector("button")?.focus();
  }, [duplicating]);

  function reopenMenu(item: MenuItemKey) {
    focusAfterReopen.current = item;
    setMenuOpen(true);
  }

  function openConfirm(from: "menu" | "swipe") {
    setMenuOpen(false);
    setError(null);
    setConfirming(from);
  }

  // SC-05-6：API-09 で削除する。一覧から外れるとこのカードと確認も消えるので、送信中のまま親へ渡す（二重に送らない）
  async function handleDelete() {
    setSending(true);
    setError(null);
    try {
      await clientApi<void>(`/lists/${list.id}`, { method: "DELETE" });
      onRemoved("deleted");
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      // 共通9：ほかの画面で先に削除されていたら、一覧から外して読み直す（D-43）
      if (failure instanceof ApiError && failure.status === 404) {
        onRemoved("gone");
        return;
      }
      setError(NETWORK_ERROR_MESSAGE);
      setSending(false);
    }
  }

  // D-119：API-60 でメンバーから抜ける。足した持ち物はリストに残る
  async function handleLeave() {
    setSending(true);
    setError(null);
    try {
      await clientApi<void>(`/lists/${list.id}/membership`, {
        method: "DELETE",
      });
      onRemoved("left");
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      // すでに外されていた・リストが削除されていたら、一覧から外して読み直す（D-43）
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
          label={`${list.title}を削除`}
          // 確認を出す前に閉じる。確認で「やめる」を押したときに、開いたまま残さない
          onDelete={() => {
            onSwipeOpenChange(false);
            openConfirm("swipe");
          }}
        />
        {/* カードだけを横にずらし、下の赤い「削除」を見せる */}
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
            href={`/lists/${list.id}`}
            prefetch={false}
            data-list-link
            className={`flex min-w-0 flex-1 flex-col gap-1 py-3 pl-4 ${CARD_RADIUS} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
          >
            <span className="font-medium wrap-break-word">{list.title}</span>
            {list.description && (
              <span className="truncate text-sm text-muted">
                {list.description}
              </span>
            )}
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              {/* 利用者の指示で、持ち物の件数は出さない（D-63） */}
              <span className="tag">{list.category.name}</span>
              {/* D-73（利用者の指示）：SC-07と同じく、公開しているリストにだけ「公開中」を付ける */}
              {list.is_public && <PublicBadge />}
              {/* D-119：参加しているリストと、メンバーがいる自分のリストに付ける */}
              {(!list.is_owner || list.member_count > 0) && (
                <CollaborativeBadge />
              )}
              <span>更新 {formatDate(list.updated_at)}</span>
            </span>
          </Link>

          {/* SC-05-6（D-120）：持ち物の行と同じく、カードの右上に「…」を置く */}
          <div ref={menuContainer} className="relative shrink-0 p-0.5">
            <button
              type="button"
              aria-label={`${list.title}の操作`}
              aria-expanded={menuOpen}
              aria-controls={menuId}
              disabled={sending}
              onClick={() => setMenuOpen((open) => !open)}
              // 指で押しやすいよう、押せる範囲を44px四方以上にする（D-73）
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-muted hover:bg-sunken disabled:opacity-50"
            >
              …
            </button>
            {menuOpen && (
              // 下のカードより手前に重ねる
              <div
                id={menuId}
                className="absolute right-0 z-30 mt-1 flex w-64 flex-col menu py-1"
              >
                {/* SC-07-4 と同じ形。編集・複製｜削除の2つに分け、削除は赤で示す。
                    リストを増やす・消す操作は、リストの中（SC-07）ではなくここで行う（D-120） */}
                <MenuSection>
                  {/* D-119：リストそのものの編集は所有者だけ */}
                  {list.is_owner && (
                    <li>
                      <Link
                        href={editHrefFromIndex(list.id)}
                        prefetch={false}
                        className={MENU_ITEM}
                      >
                        <MenuLabel icon="edit">リストを編集</MenuLabel>
                      </Link>
                    </li>
                  )}
                  <li>
                    <button
                      type="button"
                      data-menu-item="duplicate"
                      onClick={() => {
                        setMenuOpen(false);
                        setDuplicating(true);
                      }}
                      className={MENU_ITEM}
                    >
                      <MenuLabel icon="copy">このリストを複製</MenuLabel>
                    </button>
                  </li>
                </MenuSection>
                <MenuSection divided>
                  {list.is_owner ? (
                    <li>
                      <button
                        type="button"
                        data-menu-item="delete"
                        onClick={() => openConfirm("menu")}
                        className={`${MENU_ITEM} text-danger`}
                      >
                        <MenuLabel icon="trash" danger>
                          このリストを削除
                        </MenuLabel>
                      </button>
                    </li>
                  ) : (
                    // D-119：メンバーはリストを消せないので、自分が抜ける操作を同じ場所に置く
                    <li>
                      <button
                        type="button"
                        data-menu-item="leave"
                        onClick={() => {
                          setMenuOpen(false);
                          setError(null);
                          setConfirmingLeave(true);
                        }}
                        className={`${MENU_ITEM} text-danger`}
                      >
                        <MenuLabel icon="leave" danger>
                          このリストから抜ける
                        </MenuLabel>
                      </button>
                    </li>
                  )}
                </MenuSection>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SC-05-7・D-26：実際のリスト名と、中の持ち物も消えることを伝える */}
      <ConfirmDialog
        open={confirming !== null}
        // D-119：共同編集のメンバーがいるときは、メンバーも使えなくなることを伝える
        message={`「${list.title}」を削除しますか？中の持ち物も削除されます。${list.member_count > 0 ? "共同編集のメンバーも使えなくなります。" : ""}`}
        confirmLabel="削除する"
        cancelLabel="やめる"
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

      {/* D-119：抜けた後に戻るには新しい招待が要るので、確認してから抜ける */}
      <ConfirmDialog
        open={confirmingLeave}
        message={`「${list.title}」から抜けますか？あなたが足した持ち物はリストに残ります。もう一度参加するには、招待リンクが必要です。`}
        confirmLabel="抜ける"
        cancelLabel="やめる"
        busy={sending}
        destructive
        error={error}
        onConfirm={() => void handleLeave()}
        onCancel={() => {
          setConfirmingLeave(false);
          reopenMenu("leave");
        }}
      />

      {/* SC-05-6：複製した後は一覧に残る（D-120）。
          運営が非公開にしたリストは、送ったときにダイアログの中で理由を出す（D-116） */}
      {duplicating && (
        <DuplicateListDialog
          listId={list.id}
          title={list.title}
          onCancel={() => {
            setDuplicating(false);
            reopenMenu("duplicate");
          }}
          onDuplicated={() => {
            focusAfterDuplicate.current = true;
            setDuplicating(false);
            onDuplicated();
          }}
        />
      )}
    </li>
  );
}
