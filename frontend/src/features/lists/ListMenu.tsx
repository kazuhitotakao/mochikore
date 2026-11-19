"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Icon, type IconName } from "@/components/Icon";
import { SwitchIndicator } from "@/components/SwitchIndicator";
import { useDismiss } from "@/components/useDismiss";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type { ItemDeleteResult } from "@/types/api";
import { bulkDeleteErrorMessage } from "./itemErrors";
import { ShareLinkDialog } from "./ShareLinkDialog";
import { withShowChecked } from "./showChecked";
import type { VisibilityToggle } from "./useVisibilityToggle";
import { PublishConfirmDialog } from "./VisibilitySwitch";

type Props = {
  listId: number;
  title: string;
  // D-94：チェック済みを表示しているか。SC-06・SC-09 へ移るときに表示を引き継ぐのに使う
  showChecked: boolean;
  onChecksReset: () => void;
  // 非表示・たたんだグループの中も含む、チェック済みの持ち物（SC-07、利用者の指示）
  checkedItemIds: number[];
  onCheckedItemsDeleted: (itemIds: number[], result: ItemDeleteResult) => void;
  // SC-07-16：削除した持ち物の候補があるときは、整理画面へ移る前に案内する
  hasDeletedItems: boolean;
  // SC-07-16：並べ替えなどの自動保存が終わるまでは、整理画面へ移らない
  saving: boolean;
  // SC-07-18・D-100：「選んで削除」で、この画面のまま選ぶ表示にする。選ぶものがなければ押せない
  canSelectToDelete: boolean;
  onSelectToDelete: () => void;
  // SC-07-4・F-08：公開の切り替え。処理（確認・送信・エラー）は画面側の useVisibilityToggle が持つ
  isPublic: boolean;
  publishDisabled: boolean;
  // 運営による非公開の案内の id。押せない理由として読み上げる
  publishDescribedBy?: string;
  visibility: VisibilityToggle;
  // SC-07-4・F-29：限定公開のリンク（なければ null）。運営が非公開にしたリストでは作れない（D-114）
  shareToken: string | null;
  onShareTokenChange: (token: string | null) => void;
  shareDisabled: boolean;
  onModerated: () => void;
};

type Confirming =
  "grouping" | "reset-checks" | "delete-checked" | "delete" | null;

// 確認で「やめる」を押した後に、カーソルを戻す「…」の項目
type MenuItemKey = "public" | "reset-checks" | "delete-checked" | "delete";

// SC-07-4「…」メニュー
export function ListMenu({
  listId,
  title,
  showChecked,
  onChecksReset,
  checkedItemIds,
  onCheckedItemsDeleted,
  hasDeletedItems,
  saving,
  canSelectToDelete,
  onSelectToDelete,
  isPublic,
  publishDisabled,
  publishDescribedBy,
  visibility,
  shareToken,
  onShareTokenChange,
  shareDisabled,
  onModerated,
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
  // 確認を開いた後に別の通信が完了しても、確認した対象を勝手に増やさない（D-100、利用者の指示）。
  const [checkedDeleteIds, setCheckedDeleteIds] = useState<number[]>([]);
  // 「…」を開き直したときにカーソルを移す項目。描画に使わないので ref に置く
  const focusAfterReopen = useRef<MenuItemKey | null>(null);
  const focusAfterCheckedDelete = useRef(false);
  // SC-07-4・D-114：「リンクで共有」のダイアログを開いているか
  const [sharing, setSharing] = useState(false);
  const focusAfterSharing = useRef(false);

  // 確認（子の ConfirmDialog）が閉じてから項目へカーソルを移す。子の effect が先に動くので、
  // 確認を開いている間（後ろの画面を操作できない間）に移そうとして失敗することはない
  useEffect(() => {
    const item = focusAfterReopen.current;
    if (!menuOpen || !item) return;
    focusAfterReopen.current = null;
    menuContainer.current
      ?.querySelector<HTMLElement>(`[data-menu-item="${item}"]`)
      ?.focus();
  }, [menuOpen]);

  // 「リンクで共有」を閉じた後は、「…」のボタンへカーソルを戻す（開いた元の操作へ戻れるように）
  useEffect(() => {
    if (sharing || !focusAfterSharing.current) return;
    focusAfterSharing.current = false;
    menuContainer.current?.querySelector("button")?.focus();
  }, [sharing]);

  useEffect(() => {
    if (confirming !== null || sending || !focusAfterCheckedDelete.current)
      return;
    focusAfterCheckedDelete.current = false;
    // 子の確認が閉じ、送信中の無効化も外れた後で「…」へ戻す（D-73）。
    menuContainer.current?.querySelector("button")?.focus();
  }, [confirming, sending]);

  // SC-07-4（利用者の指示）：「…」から開いた確認で「やめる」を押したら（Esc・外枠も同じ）、
  // 「…」を開いたまま戻し、続けて別の操作を選べるようにする。押した項目へカーソルを戻す（D-73）
  function reopenMenu(item: MenuItemKey) {
    focusAfterReopen.current = item;
    setMenuOpen(true);
  }

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
  // D-94：SC-06・SC-09 から戻ったときも表示を引き継ぐ。表示の切替は画面の中の状態なので、開くときのURLで渡す
  const groupingHref = withShowChecked(
    `/lists/${listId}/grouping`,
    showChecked,
  );
  const editHref = withShowChecked(`/lists/${listId}/edit`, showChecked);

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
    if (saving) return;
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

  // チェック済みも「選んで削除」と同じAPI-38で消す。グループは消さず、戻す候補にも入れない（D-100）。
  async function handleDeleteChecked() {
    if (
      sending ||
      saving ||
      visibility.sending ||
      checkedDeleteIds.length === 0
    )
      return;
    setSending(true);
    setError(null);

    try {
      const result = await clientApi<ItemDeleteResult>(
        `/lists/${listId}/items/bulk-delete`,
        {
          method: "POST",
          body: { item_ids: checkedDeleteIds, group_ids: [] },
        },
      );
      onCheckedItemsDeleted(checkedDeleteIds, result);
      focusAfterCheckedDelete.current = true;
      setConfirming(null);
    } catch (failure) {
      if (handleMovingError(failure)) return;
      setError(bulkDeleteErrorMessage(failure));
    } finally {
      setSending(false);
    }
  }

  return (
    <div ref={menuContainer} className="relative">
      <button
        type="button"
        aria-label="リストの操作"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        disabled={sending}
        onClick={() => setMenuOpen((open) => !open)}
        // 指で押しやすいよう、押せる範囲を44px四方以上にする（利用者の指示）
        className="-mr-2 flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3 text-xl text-muted hover:bg-sunken disabled:opacity-50"
      >
        …
      </button>

      {/* SC-07-4（利用者の指示）：よく使う操作を上に置き、編集・整理・公開｜チェックと持ち物の削除｜リストの削除の
          3つに線で区切る。項目ごとに同じ形のアイコンを付け、削除の操作は赤で示す。押せる高さは44px以上（D-73）。
          一覧の上の「チェック済みを表示」（前面に出している）より手前に重ねる */}
      {menuOpen && (
        <div
          id={menuId}
          className="absolute right-0 z-30 mt-1 flex w-72 flex-col menu py-1.5"
        >
          <MenuSection>
            <li>
              <Link href={editHref} prefetch={false} className={MENU_ITEM}>
                <MenuLabel icon="edit">リストを編集</MenuLabel>
              </Link>
            </li>
            <li>
              <button
                type="button"
                onClick={openGrouping}
                disabled={saving}
                className={MENU_ITEM}
              >
                <MenuLabel icon="group">グループを整理</MenuLabel>
              </button>
            </li>
            {/* SC-07-4（利用者の指示）：リストをシンプルに見せるため、公開の切り替えはここに置く。
                SC-06 と同じオン・オフの形と動き（D-73・D-85）。公開にするときは閉じてから確認を出す（D-42） */}
            <li>
              <button
                type="button"
                role="switch"
                aria-checked={isPublic}
                aria-describedby={publishDescribedBy}
                disabled={publishDisabled}
                data-menu-item="public"
                onClick={() => {
                  setMenuOpen(false);
                  visibility.toggle();
                }}
                className={MENU_ITEM}
              >
                <MenuLabel icon="public">リストを公開</MenuLabel>
                <span className="ml-auto flex">
                  <SwitchIndicator on={isPublic} />
                </span>
              </button>
            </li>
            {/* SC-07-4・D-114：公開とは別に、リンクを知っている人だけに見せる。非公開のまま・0件でも使える */}
            <li>
              <button
                type="button"
                aria-describedby={
                  shareDisabled ? publishDescribedBy : undefined
                }
                disabled={shareDisabled}
                onClick={() => {
                  setMenuOpen(false);
                  setSharing(true);
                }}
                className={MENU_ITEM}
              >
                <MenuLabel icon="link">リンクで共有</MenuLabel>
              </button>
            </li>
          </MenuSection>
          <MenuSection divided>
            <li>
              <button
                type="button"
                onClick={() => openConfirm("reset-checks")}
                disabled={saving}
                data-menu-item="reset-checks"
                className={MENU_ITEM}
              >
                <MenuLabel icon="reset">チェックを全部外す</MenuLabel>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  setCheckedDeleteIds([...checkedItemIds]);
                  openConfirm("delete-checked");
                }}
                disabled={
                  saving || visibility.sending || checkedItemIds.length === 0
                }
                data-menu-item="delete-checked"
                className={`${MENU_ITEM} text-danger`}
              >
                <MenuLabel icon="trash" danger>
                  チェック済みを削除（{checkedItemIds.length}件）
                </MenuLabel>
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
                className={`${MENU_ITEM} text-danger`}
              >
                <MenuLabel icon="select" danger>
                  選んで削除
                </MenuLabel>
              </button>
            </li>
          </MenuSection>
          <MenuSection divided>
            <li>
              <button
                type="button"
                onClick={() => openConfirm("delete")}
                data-menu-item="delete"
                className={`${MENU_ITEM} text-danger`}
              >
                <MenuLabel icon="trash" danger>
                  このリストを削除
                </MenuLabel>
              </button>
            </li>
          </MenuSection>
        </div>
      )}

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
        onCancel={() => {
          setConfirming(null);
          reopenMenu("reset-checks");
        }}
      />

      {/* SC-07（利用者の指示）：非表示も含むチェック済みの件数と、元に戻せないことを伝える（D-95・D-100）。 */}
      <ConfirmDialog
        open={confirming === "delete-checked"}
        message={`チェック済みの持ち物（${checkedDeleteIds.length}件）を削除しますか？元に戻せません。`}
        confirmLabel="削除する"
        cancelLabel="やめる"
        busy={sending}
        destructive
        error={error}
        onConfirm={() => void handleDeleteChecked()}
        onCancel={() => {
          setConfirming(null);
          reopenMenu("delete-checked");
        }}
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
        onCancel={() => {
          setConfirming(null);
          reopenMenu("delete");
        }}
      />

      {/* SC-07-4・D-42：公開にするときだけ確認する。SC-06 と同じ文言・同じ動き。
          「やめる」で「…」を開き直すので、この中に置く */}
      <PublishConfirmDialog
        visibility={visibility}
        onCancel={() => reopenMenu("public")}
      />

      {sharing && (
        <ShareLinkDialog
          listId={listId}
          shareToken={shareToken}
          onShareTokenChange={onShareTokenChange}
          onModerated={onModerated}
          onClose={() => {
            focusAfterSharing.current = true;
            setSharing(false);
          }}
        />
      )}
    </div>
  );
}

// 「…」の1項目。行全体を押せるようにし、高さは44px以上（D-73）
const MENU_ITEM =
  "flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand disabled:opacity-50";

// 区切り線で分けたまとまり。線の上下に同じ余白をとる
function MenuSection({
  divided = false,
  children,
}: {
  divided?: boolean;
  children: ReactNode;
}) {
  return (
    <ul
      className={`flex flex-col ${divided ? "mt-1.5 border-t border-line-soft pt-1.5" : ""}`}
    >
      {children}
    </ul>
  );
}

// アイコンは補足なので、ふだんは控えめな色にする。削除の操作は文字と同じ赤
function MenuLabel({
  icon,
  danger = false,
  children,
}: {
  icon: IconName;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <Icon name={icon} className={`size-5 ${danger ? "" : "text-muted"}`} />
      <span>{children}</span>
    </>
  );
}
