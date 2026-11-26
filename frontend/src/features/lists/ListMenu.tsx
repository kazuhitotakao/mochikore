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
import type { InviteLink, ItemDeleteResult } from "@/types/api";
import { CollaborationDialog } from "./CollaborationDialog";
import { bulkDeleteErrorMessage } from "./itemErrors";
import { ShareLinkDialog } from "./ShareLinkDialog";
import { listPagePath } from "@/features/combined-views/returnPath";
import type { VisibilityToggle } from "./useVisibilityToggle";
import { PublishConfirmDialog } from "./VisibilitySwitch";

type Props = {
  listId: number;
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
  // SC-07-21・D-118：「選んでコピー・移動」で同じ選ぶ表示にする。持ち物がなければ押せない
  canSelectToTransfer: boolean;
  onSelectToTransfer: () => void;
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
  // D-118：運営が非公開にしたリストの持ち物はコピー・移動できない
  transferDisabled: boolean;
  onModerated: () => void;
  // SC-07-4・F-34：共同編集（D-119）。リストそのものの操作（編集・公開・リンクで共有・招待）は所有者だけ
  isOwner: boolean;
  // 所有者を除く共同編集のメンバーの数
  memberCount: number;
  onMemberCountChange: (count: number) => void;
  // 招待リンク（所有者だけ。なければ null）
  invite: InviteLink | null;
  onInviteChange: (invite: InviteLink | null) => void;
  // D-124：まとめ表示（SC-20）から開いたときの、そのまとめ表示のID（なければ null）
  combinedViewId: number | null;
};

type Confirming = "grouping" | "reset-checks" | "delete-checked" | null;

// 確認で「キャンセル」を押した後に、カーソルを戻す「…」の項目
type MenuItemKey = "public" | "reset-checks" | "delete-checked";

// SC-07-4「…」メニュー
export function ListMenu({
  listId,
  showChecked,
  onChecksReset,
  checkedItemIds,
  onCheckedItemsDeleted,
  hasDeletedItems,
  saving,
  canSelectToDelete,
  onSelectToDelete,
  canSelectToTransfer,
  onSelectToTransfer,
  isPublic,
  publishDisabled,
  publishDescribedBy,
  visibility,
  shareToken,
  onShareTokenChange,
  shareDisabled,
  transferDisabled,
  onModerated,
  isOwner,
  memberCount,
  onMemberCountChange,
  invite,
  onInviteChange,
  combinedViewId,
}: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const menuId = useId();
  const collaborativeNoteId = useId();
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
  // SC-07-4・D-119：「共同編集」のダイアログを開いているか
  const [collaborating, setCollaborating] = useState(false);
  // D-119：共同編集中（メンバーがいる・招待リンクがある）は、公開・リンクで共有と両立しない
  const collaborative = memberCount > 0 || invite !== null;
  const inviteBlockedReason = shareDisabled
    ? "このリストは運営により非公開になっています。"
    : isPublic || shareToken !== null
      ? "公開中・リンクで共有中のリストは、共同編集にできません。非公開に戻し、リンクを止めてから招待してください。"
      : null;

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

  // 「リンクで共有」「共同編集」を閉じた後は、「…」のボタンへカーソルを戻す（開いた元の操作へ戻れるように）
  useEffect(() => {
    if (sharing || collaborating || !focusAfterSharing.current) return;
    focusAfterSharing.current = false;
    menuContainer.current?.querySelector("button")?.focus();
  }, [sharing, collaborating]);

  useEffect(() => {
    if (confirming !== null || sending || !focusAfterCheckedDelete.current)
      return;
    focusAfterCheckedDelete.current = false;
    // 子の確認が閉じ、送信中の無効化も外れた後で「…」へ戻す（D-73）。
    menuContainer.current?.querySelector("button")?.focus();
  }, [confirming, sending]);

  // SC-07-4（利用者の指示）：「…」から開いた確認で「キャンセル」を押したら（Esc・外枠も同じ）、
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
  // D-124：まとめ表示から開いたときは、SC-06・SC-09 から戻った後も「←」でまとめ表示へ戻れるよう、開いた元も渡す
  const groupingHref = listPagePath(`/lists/${listId}/grouping`, {
    showChecked,
    combinedViewId,
  });
  const editHref = listPagePath(`/lists/${listId}/edit`, {
    showChecked,
    combinedViewId,
  });

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

      {/* SC-07-4（利用者の指示）：操作の種類ごとに、編集・整理｜公開・共有｜チェックと持ち物の削除の
          3つに線で区切る。リストの複製・削除は自分のリスト一覧（SC-05）のカードの「…」で行う（D-120）。
          項目ごとに同じ形のアイコンを付け、削除の操作は赤で示す。押せる高さは44px（D-73）。
          画面の高さに収まらないときは、メニューの中だけを動かす。
          一覧の上の「チェック済みを表示」（前面に出している）より手前に重ねる */}
      {menuOpen && (
        <div
          id={menuId}
          className="absolute right-0 z-30 mt-1 flex max-h-[calc(100dvh-6rem)] w-72 flex-col overflow-y-auto overscroll-contain menu py-1"
        >
          {/* ① 編集・整理 */}
          <MenuSection>
            {/* D-119：リスト名・説明・カテゴリーの編集は所有者だけ */}
            {isOwner && (
              <li>
                <Link href={editHref} prefetch={false} className={MENU_ITEM}>
                  <MenuLabel icon="edit">リストを編集</MenuLabel>
                </Link>
              </li>
            )}
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
            {/* SC-07-21・D-118：選んだ持ち物を自分の別のリストへコピー・移動する。選ぶ表示は「選んで削除」と同じ */}
            <li>
              <button
                type="button"
                aria-describedby={
                  transferDisabled ? publishDescribedBy : undefined
                }
                disabled={saving || transferDisabled || !canSelectToTransfer}
                onClick={() => {
                  setMenuOpen(false);
                  onSelectToTransfer();
                }}
                className={MENU_ITEM}
              >
                <MenuLabel icon="transfer">選んでコピー・移動</MenuLabel>
              </button>
            </li>
          </MenuSection>
          {/* ② 公開・共有 */}
          <MenuSection divided>
            {/* SC-07-4（利用者の指示）：リストをシンプルに見せるため、公開の切り替えはここに置く。
                SC-06 と同じオン・オフの形と動き（D-73・D-85）。公開にするときは閉じてから確認を出す（D-42） */}
            {isOwner && (
              <>
                <li>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isPublic}
                    aria-describedby={
                      collaborative ? collaborativeNoteId : publishDescribedBy
                    }
                    disabled={publishDisabled || collaborative}
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
                      collaborative
                        ? collaborativeNoteId
                        : shareDisabled
                          ? publishDescribedBy
                          : undefined
                    }
                    disabled={shareDisabled || collaborative}
                    onClick={() => {
                      setMenuOpen(false);
                      setSharing(true);
                    }}
                    className={MENU_ITEM}
                  >
                    <MenuLabel icon="link">リンクで共有</MenuLabel>
                    {/* D-114（利用者の指示）：ダイアログを開かなくても共有中か分かるよう、行の右端に出す。
                    運営が非公開にしたリストはリンクが開けなくなるので出さない（D-48）。
                    公開のスイッチの右端は丸く、端をそろえると文字が右に出て見えるので、4px内側に置く（利用者の指示） */}
                    {shareToken !== null && !shareDisabled && (
                      <span className="mr-1 ml-auto text-sm text-brand">
                        共有中
                      </span>
                    )}
                  </button>
                </li>
              </>
            )}
            {/* SC-07-4・D-119：招待した人と同じリストを一緒に編集する。メンバーには顔ぶれだけを見せる。
                人数は所有者を入れて数え、「リンクで共有」の「共有中」と同じ位置に出す */}
            <li>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setCollaborating(true);
                }}
                className={MENU_ITEM}
              >
                <MenuLabel icon="people">共同編集</MenuLabel>
                {collaborative && (
                  <span className="mr-1 ml-auto text-sm text-brand">
                    {memberCount > 0 ? `${memberCount + 1}人` : "招待中"}
                  </span>
                )}
              </button>
            </li>
            {/* 押せない理由を、メニューの中で文字でも伝える */}
            {isOwner && collaborative && (
              <li
                id={collaborativeNoteId}
                className="px-4 pt-1 pb-2 text-sm text-muted"
              >
                共同編集中は、公開・リンクで共有を使えません。
              </li>
            )}
          </MenuSection>
          {/* ③ チェック操作・持ち物の削除 */}
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
            {/* SC-07-4（利用者の指示）：チェック済みが0件のときは出さない。項目が減り、メニューが短くなる */}
            {checkedItemIds.length > 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setCheckedDeleteIds([...checkedItemIds]);
                    openConfirm("delete-checked");
                  }}
                  disabled={saving || visibility.sending}
                  data-menu-item="delete-checked"
                  className={`${MENU_ITEM} text-danger`}
                >
                  <MenuLabel icon="trash" danger>
                    チェック済みを削除（{checkedItemIds.length}件）
                  </MenuLabel>
                </button>
              </li>
            )}
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
        </div>
      )}

      {/* SC-07-16・D-61：整理画面は別の画面なので、移ると削除した持ち物の候補は消える */}
      <ConfirmDialog
        open={confirming === "grouping"}
        message="グループを整理すると、削除した持ち物は元に戻せなくなります。"
        confirmLabel="グループを整理"
        cancelLabel="キャンセル"
        onConfirm={() => router.push(groupingHref)}
        onCancel={() => setConfirming(null)}
      />

      <ConfirmDialog
        open={confirming === "reset-checks"}
        message="このリストのチェックを全部外しますか？"
        confirmLabel="チェックを外す"
        cancelLabel="キャンセル"
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
        cancelLabel="キャンセル"
        busy={sending}
        destructive
        error={error}
        onConfirm={() => void handleDeleteChecked()}
        onCancel={() => {
          setConfirming(null);
          reopenMenu("delete-checked");
        }}
      />

      {/* SC-07-4・D-42：公開にするときだけ確認する。SC-06 と同じ文言・同じ動き。
          「キャンセル」で「…」を開き直すので、この中に置く */}
      <PublishConfirmDialog
        visibility={visibility}
        onCancel={() => reopenMenu("public")}
      />

      {collaborating && (
        <CollaborationDialog
          listId={listId}
          isOwner={isOwner}
          invite={invite}
          onInviteChange={onInviteChange}
          onMemberCountChange={onMemberCountChange}
          inviteBlockedReason={inviteBlockedReason}
          onClose={() => {
            focusAfterSharing.current = true;
            setCollaborating(false);
          }}
        />
      )}

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

// 「…」の1項目。行全体を押せるようにし、高さは44px以上（D-73）。自分のリスト一覧（SC-05）のカードの「…」も同じ形（D-120）
export const MENU_ITEM =
  "flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand disabled:opacity-50";

// 区切り線で分けたまとまり。線は薄い色で、上下の余白は4pxに詰める（利用者の指示）
export function MenuSection({
  divided = false,
  children,
}: {
  divided?: boolean;
  children: ReactNode;
}) {
  return (
    <ul
      className={`flex flex-col ${divided ? "mt-1 border-t border-line-soft pt-1" : ""}`}
    >
      {children}
    </ul>
  );
}

// アイコンは補足なので、ふだんは控えめな色にする。削除の操作は文字と同じ赤
export function MenuLabel({
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
