"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { useBackdropDismiss } from "@/components/useBackdropDismiss";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import { formatDate } from "@/lib/format";
import type { InviteLink, ListMembers } from "@/types/api";
import { MAX_PEOPLE } from "./validation";

type Props = {
  listId: number;
  // D-119：招待リンクを作る・止める、メンバーを外すのは所有者だけ。メンバーにはメンバーの一覧だけを見せる
  isOwner: boolean;
  // 作ってある招待リンク（なければ null）。作る・止めるの結果は画面の状態として親が持つ
  invite: InviteLink | null;
  onInviteChange: (invite: InviteLink | null) => void;
  // メンバーの数（所有者を除く）が変わったとき。親の印と「…」の表示に使う
  onMemberCountChange: (count: number) => void;
  // 招待リンクを作れない理由（公開中・リンクで共有中・運営による非公開）。作れるなら null
  inviteBlockedReason: string | null;
  onClose: () => void;
};

/**
 * SC-07-23「共同編集」（F-34、D-119）。開いたときだけ置き、閉じたら親が外す。
 * メンバーの一覧（表示名だけ）と、所有者には招待リンクを作る・コピーする・止める操作を出す。
 * Esc・外枠を押すと閉じる。送信中は閉じない（02_画面配置 共通5）。
 */
export function CollaborationDialog({
  listId,
  isOwner,
  invite,
  onInviteChange,
  onMemberCountChange,
  inviteBlockedReason,
  onClose,
}: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const ref = useRef<HTMLDialogElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const urlId = useId();
  const [members, setMembers] = useState<ListMembers | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // 外す前に確かめているメンバー（API-58 の id）
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  function closeIfIdle() {
    if (!sending) onClose();
  }
  const backdrop = useBackdropDismiss(closeIfIdle);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // 開くたびに最新のメンバーを読む（ほかの人が参加・抜けた後でも、今の顔ぶれを見せる）
  useEffect(() => {
    let cancelled = false;
    clientApi<ListMembers>(`/lists/${listId}/members`)
      .then((result) => {
        if (cancelled) return;
        setMembers(result);
        onMemberCountChange(result.members.length);
      })
      .catch((failure: unknown) => {
        if (cancelled || redirectIfAuthError(failure)) return;
        if (failure instanceof ApiError && failure.code === "not_found") {
          // リストが消えた・メンバーから外された。読み直すと「ページが見つかりません」になる（D-43）
          router.refresh();
          return;
        }
        setLoadFailed(true);
      });

    return () => {
      cancelled = true;
    };
    // 開いたときに1回だけ読む。親の関数は描画のたびに作り直されるので、依存に入れない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId]);

  // D-119：リンクの形は /invite/{token}。開いている画面と同じサイトのURLにする
  const url = invite
    ? `${window.location.origin}/invite/${invite.invite_token}`
    : null;
  const peopleCount = members === null ? null : members.members.length + 1;

  function handleFailure(failure: unknown) {
    if (redirectIfAuthError(failure)) return;
    if (failure instanceof ApiError && failure.code === "not_found") {
      router.refresh();
      return;
    }
    // 開いた後に別の画面で公開・リンクで共有した・運営が非公開にしたときは、Laravel の理由をそのまま出す
    setError(
      failure instanceof ApiError &&
        (failure.code === "list_not_private" ||
          failure.code === "list_moderated")
        ? failure.message
        : NETWORK_ERROR_MESSAGE,
    );
  }

  async function createLink() {
    if (sending) return;
    setError(null);
    setCopied(null);

    setSending(true);
    try {
      // API-56：有効なリンクがあれば同じリンクが返る。本文は送らない（表示名は会員登録で入れてある、D-127）
      const result = await clientApi<InviteLink>(
        `/lists/${listId}/invite-link`,
        { method: "POST" },
      );
      onInviteChange(result);
    } catch (failure) {
      handleFailure(failure);
    } finally {
      setSending(false);
    }
  }

  async function stopLink() {
    if (sending) return;
    setSending(true);
    setError(null);
    setCopied(null);
    try {
      // API-57：止めたリンクは「ページが見つかりません」になる。参加済みのメンバーは残る
      await clientApi<void>(`/lists/${listId}/invite-link`, {
        method: "DELETE",
      });
      onInviteChange(null);
    } catch (failure) {
      handleFailure(failure);
    } finally {
      setSending(false);
    }
  }

  async function removeMember(memberId: number) {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      // API-59：外した人は、このリストを開けなくなる。足した持ち物は残る
      await clientApi<void>(`/lists/${listId}/members/${memberId}`, {
        method: "DELETE",
      });
    } catch (failure) {
      // すでに自分で抜けていたら（404）、外せたときと同じく一覧から消す
      if (!(failure instanceof ApiError && failure.code === "not_found")) {
        handleFailure(failure);
        setSending(false);
        return;
      }
    }
    const rest = (members?.members ?? []).filter(
      (member) => member.id !== memberId,
    );
    setMembers((current) => current && { ...current, members: rest });
    onMemberCountChange(rest.length);
    setConfirmingId(null);
    setSending(false);
  }

  async function copy() {
    if (!url) return;
    setError(null);
    try {
      await navigator.clipboard.writeText(url);
      setCopied("コピーしました");
    } catch {
      // http で開いているときなど、クリップボードを使えない端末では、リンクを選んで自分でコピーしてもらう
      urlRef.current?.focus();
      urlRef.current?.select();
      setCopied("リンクを選びました。コピーして送ってください。");
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        closeIfIdle();
      }}
      {...backdrop}
      // メンバーが多いときは、ダイアログの中だけを動かす
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl bg-background p-6 text-foreground backdrop:bg-overlay/50"
    >
      <div className="flex flex-col gap-4">
        <h2 id={titleId} className="text-lg font-bold">
          共同編集
        </h2>
        <p className="text-sm text-muted">
          {isOwner
            ? "招待した人と、このリストの持ち物を一緒に追加・チェックできます。リストの名前の変更・削除ができるのは、あなただけです。"
            : "このリストの持ち物を、メンバーと一緒に追加・チェックできます。"}
        </p>

        <section className="flex flex-col gap-2">
          <h3 className="font-bold">
            メンバー{peopleCount !== null && `（${peopleCount}人）`}
          </h3>
          {loadFailed && (
            <p role="alert" className="text-danger">
              {NETWORK_ERROR_MESSAGE}
            </p>
          )}
          {members === null && !loadFailed && (
            <p className="text-sm text-muted">読み込み中…</p>
          )}
          {members !== null && (
            <ul className="flex flex-col divide-y divide-line-soft">
              <li className="flex min-h-11 items-center gap-2 py-1">
                {/* D-128：写真（なければ人型）。名前を隣に出すので読ませない */}
                <Avatar src={members.owner.avatar} size="sm" />
                <span className="min-w-0 flex-1 wrap-break-word">
                  {members.owner.display_name}
                  {members.owner.is_me && "（あなた）"}
                </span>
                <span className="tag shrink-0">所有者</span>
              </li>
              {members.members.map((member) => (
                <li
                  key={member.id}
                  className="flex min-h-11 flex-wrap items-center gap-2 py-1"
                >
                  <Avatar src={member.avatar} size="sm" />
                  <span
                    // 確かめている間は、名前と確認が1行に並びきらなければ、名前を細く折り返さずに確認を次の行へ送る
                    className={`min-w-0 wrap-break-word ${confirmingId === member.id ? "flex-auto" : "flex-1"}`}
                  >
                    {member.display_name}
                    {member.is_me && "（あなた）"}
                  </span>
                  {isOwner &&
                    (confirmingId === member.id ? (
                      // 外した人は開けなくなるので、押し間違えないよう、その場で確かめる
                      <span className="ml-auto flex items-center gap-2">
                        <span className="text-sm">外しますか？</span>
                        <button
                          type="button"
                          disabled={sending}
                          onClick={() => setConfirmingId(null)}
                          className="tap-target text-link"
                        >
                          キャンセル
                        </button>
                        <button
                          type="button"
                          disabled={sending}
                          onClick={() => void removeMember(member.id)}
                          className="tap-target text-danger underline underline-offset-4 disabled:opacity-50"
                        >
                          外す
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={sending}
                        aria-label={`${member.display_name}を外す`}
                        onClick={() => {
                          setError(null);
                          setConfirmingId(member.id);
                        }}
                        className="tap-target text-danger underline underline-offset-4 disabled:opacity-50"
                      >
                        外す
                      </button>
                    ))}
                </li>
              ))}
            </ul>
          )}
          {!isOwner && (
            <p className="text-sm text-muted">
              抜けるときは、自分のリスト一覧でこのリストの「…」から「このリストから抜ける」を選びます。
            </p>
          )}
        </section>

        {isOwner && (
          <section className="flex flex-col gap-2">
            <h3 className="font-bold">招待リンク</h3>
            {url !== null && invite !== null ? (
              <>
                <label htmlFor={urlId} className="text-sm text-muted">
                  このリンクを送った相手は、ログインするとメンバーになれます。
                  {formatDate(invite.invite_expires_at)}
                  まで使えます。
                </label>
                <input
                  ref={urlRef}
                  id={urlId}
                  type="text"
                  readOnly
                  value={url}
                  onFocus={(event) => event.currentTarget.select()}
                  className="field w-full text-sm"
                />
                {copied && (
                  <p role="status" className="text-sm text-brand-deep">
                    {copied}
                  </p>
                )}
              </>
            ) : inviteBlockedReason !== null ? (
              <p className="text-sm">{inviteBlockedReason}</p>
            ) : (
              <p className="text-sm text-muted">
                リンクを送った相手は、ログインするとメンバーになれます。リンクは7日で切れ、いつでも止められます。
                {peopleCount !== null &&
                  peopleCount >= MAX_PEOPLE &&
                  `メンバーは${MAX_PEOPLE}人までです。`}
              </p>
            )}
          </section>
        )}

        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}

        {isOwner && url !== null ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => void stopLink()}
              disabled={sending}
              // 送ったリンクが使えなくなる操作なので、「リンクで共有」と同じ赤い文字のボタンにする
              className="tap-target text-danger underline underline-offset-4 disabled:opacity-50"
            >
              リンクを止める
            </button>
            {/* スマホ幅で折り返したときも、ほかのダイアログと同じく右にそろえる */}
            <div className="ml-auto flex gap-3">
              <button
                type="button"
                onClick={closeIfIdle}
                disabled={sending}
                className="btn-outline"
              >
                閉じる
              </button>
              <button
                type="button"
                onClick={() => void copy()}
                disabled={sending}
                className="btn-primary"
              >
                コピー
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={closeIfIdle}
              disabled={sending}
              className="btn-outline"
            >
              閉じる
            </button>
            {isOwner && inviteBlockedReason === null && (
              <button
                type="button"
                onClick={() => void createLink()}
                disabled={sending}
                className="btn-primary"
              >
                招待リンクを作る
              </button>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}
