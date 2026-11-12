"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useDismiss } from "@/components/useDismiss";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type { PackingList } from "@/types/api";
import { PUBLISH_MESSAGE, visibilityErrorMessage } from "./visibility";

type Props = {
  listId: number;
  title: string;
  isPublic: boolean;
  moderated: boolean;
  onVisibilityChanged: (isPublic: boolean) => void;
  onVisibilityError: (message: string | null) => void;
  onModerated: () => void;
  // D-94：チェック済みの表示切替。画面の中の表示だけを変え、通信しない
  showChecked: boolean;
  checkedCount: number;
  onToggleChecked: () => void;
  onChecksReset: () => void;
  // SC-07-16：削除した持ち物の候補があるときは、整理画面へ移る前に案内する
  hasDeletedItems: boolean;
  // SC-07-16：並べ替えなどの自動保存が終わるまでは、整理画面へ移らない
  saving: boolean;
  // SC-07-18・D-100：「選んで削除」で、この画面のまま選ぶ表示にする。選ぶものがなければ押せない
  canSelectToDelete: boolean;
  onSelectToDelete: () => void;
};

// チェックで最後の行が隠れたときに、カーソルを移す先（SC-07-7）
export const LIST_MENU_BUTTON_ID = "list-menu-button";

type Confirming = "grouping" | "reset-checks" | "delete" | "publish" | null;

// SC-07-4「…」メニュー
export function ListMenu({
  listId,
  title,
  isPublic,
  moderated,
  onVisibilityChanged,
  onVisibilityError,
  onModerated,
  showChecked,
  checkedCount,
  onToggleChecked,
  onChecksReset,
  hasDeletedItems,
  saving,
  canSelectToDelete,
  onSelectToDelete,
}: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainer = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useDismiss(menuContainer, menuOpen, closeMenu);
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

  // D-95（利用者の指示）：チェック済みを表示しているときだけ、整理画面でもチェック済みを分類できるようにする。
  // 表示の切替は画面の中の状態なので、開くときのURLで渡す
  const groupingHref = showChecked
    ? `/lists/${listId}/grouping?show_checked=1`
    : `/lists/${listId}/grouping`;

  // SC-07-4・F-19：押したときだけ整理画面（SC-09）を開く（D-56）
  function openGrouping() {
    setMenuOpen(false);
    if (hasDeletedItems) {
      openConfirm("grouping");
      return;
    }
    router.push(groupingHref);
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

  async function handleVisibilityChange(isPublic: boolean) {
    if (saving || sending) return;
    setMenuOpen(false);
    setSending(true);
    setError(null);
    onVisibilityError(null);

    try {
      const saved = await clientApi<Pick<PackingList, "is_public">>(
        `/lists/${listId}/visibility`,
        { method: "PATCH", body: { is_public: isPublic } },
      );
      // D-28：画面を移動せず、削除した持ち物やチェック済みの表示を保つ
      onVisibilityChanged(saved.is_public);
      setConfirming(null);
    } catch (failure) {
      if (handleMovingError(failure)) return;

      if (failure instanceof ApiError && failure.code === "list_moderated") {
        onModerated();
        setConfirming(null);
      } else if (isPublic) {
        setError(visibilityErrorMessage(failure));
      } else {
        onVisibilityError(visibilityErrorMessage(failure));
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div ref={menuContainer} className="relative">
      <button
        type="button"
        id={LIST_MENU_BUTTON_ID}
        aria-label="リストの操作"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        disabled={sending}
        onClick={() => setMenuOpen((open) => !open)}
        className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-50"
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
              disabled={saving || sending || moderated}
              aria-describedby={moderated ? "list-moderated-notice" : undefined}
              onClick={() => {
                if (isPublic) void handleVisibilityChange(false);
                else openConfirm("publish");
              }}
              className="block w-full px-4 py-2 text-left disabled:opacity-50"
            >
              {isPublic ? "非公開にする" : "公開にする"}
            </button>
          </li>
          <li>
            {/* 利用者の指示で、説明文と一覧の間からこのメニューの中へ移した。0件でも出す */}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onToggleChecked();
              }}
              className="block w-full px-4 py-2 text-left"
            >
              {showChecked ? "チェック済みを隠す" : "チェック済みを表示"}（
              {checkedCount}件）
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={openGrouping}
              disabled={saving}
              className="block w-full px-4 py-2 text-left disabled:opacity-50"
            >
              グループを整理
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onSelectToDelete();
              }}
              disabled={saving || !canSelectToDelete}
              className="block w-full px-4 py-2 text-left disabled:opacity-50"
            >
              選んで削除
            </button>
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
        open={confirming === "publish"}
        message={PUBLISH_MESSAGE}
        confirmLabel="公開する"
        cancelLabel="やめる"
        busy={sending}
        error={error}
        onConfirm={() => void handleVisibilityChange(true)}
        onCancel={() => setConfirming(null)}
      />

      {/* SC-07-16・D-61：整理画面は別の画面なので、移ると削除した持ち物の候補は消える */}
      <ConfirmDialog
        open={confirming === "grouping"}
        message="グループを整理すると、削除した持ち物は元に戻せなくなります。"
        confirmLabel="整理する"
        cancelLabel="やめる"
        onConfirm={() => router.push(groupingHref)}
        onCancel={() => setConfirming(null)}
      />

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
