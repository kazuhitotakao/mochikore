"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useBackdropDismiss } from "@/components/useBackdropDismiss";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";

const MODERATED_MESSAGE = "このリストは運営により非公開になっています。";

type Props = {
  listId: number;
  // 作ってあるリンク（なければ null）。作る・止めるの結果は画面の状態として親が持つ
  shareToken: string | null;
  onShareTokenChange: (token: string | null) => void;
  // 開いている間に運営が非公開にしていたとき。親が案内を出し、「リンクで共有」を押せなくする
  onModerated: () => void;
  onClose: () => void;
};

/**
 * SC-07-4「リンクで共有」（F-29、D-114）。開いたときだけ置き、閉じたら親が外す。
 * リンクがなければ作る前の確認、あればリンクと「コピー」「リンクを止める」を出す。
 * Esc・外枠を押すと閉じる。送信中は閉じない（02_画面配置 共通5）。
 */
export function ShareLinkDialog({
  listId,
  shareToken,
  onShareTokenChange,
  onModerated,
  onClose,
}: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const ref = useRef<HTMLDialogElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const urlId = useId();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // 作る・止めるでボタンが入れ替わった後に、カーソルを次に使うボタンへ移す
  const moveFocus = useRef(false);

  function closeIfIdle() {
    if (!sending) onClose();
  }
  const backdrop = useBackdropDismiss(closeIfIdle);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    (shareToken ? copyButtonRef : createButtonRef).current?.focus();
  }, [shareToken]);

  // D-114：リンクの形は /shared/{token}。開いている画面と同じサイトのURLにする
  const url = shareToken
    ? `${window.location.origin}/shared/${shareToken}`
    : null;

  async function send(method: "POST" | "DELETE") {
    setSending(true);
    setError(null);
    setCopied(null);
    try {
      if (method === "POST") {
        // API-46：すでにあれば同じリンクが返る
        const result = await clientApi<{ share_token: string }>(
          `/lists/${listId}/share-link`,
          { method: "POST" },
        );
        moveFocus.current = true;
        onShareTokenChange(result.share_token);
      } else {
        // API-47：止めたリンクは「ページが見つかりません」になる。止めるときは確認しない（D-42と同じ）
        await clientApi<void>(`/lists/${listId}/share-link`, {
          method: "DELETE",
        });
        moveFocus.current = true;
        onShareTokenChange(null);
      }
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      if (failure instanceof ApiError && failure.code === "not_found") {
        // ほかの画面でリストが消えていた。読み直すと「ページが見つかりません」になる
        router.refresh();
        return;
      }
      if (failure instanceof ApiError && failure.code === "list_moderated") {
        onModerated();
        setError(MODERATED_MESSAGE);
        return;
      }
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setSending(false);
    }
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
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-background p-6 text-foreground backdrop:bg-overlay/50"
    >
      <div className="flex flex-col gap-4">
        <h2 id={titleId} className="text-lg font-bold">
          リンクで共有
        </h2>
        {url === null ? (
          // 作る前の確認（D-114）。最初のカーソルは「やめる」に置き、Enter だけでは作らない
          <p>
            リンクを知っている人は、ログインしていなくてもこのリストを見られます。送った相手から転送されることもあります。
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <label htmlFor={urlId} className="text-sm text-muted">
              リンクを知っている人は、ログインしていなくても見られます。
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
          </div>
        )}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        {url === null ? (
          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={closeIfIdle}
              disabled={sending}
              className="btn-outline"
            >
              やめる
            </button>
            <button
              ref={createButtonRef}
              type="button"
              onClick={() => void send("POST")}
              disabled={sending}
              className="btn-primary"
            >
              リンクを作る
            </button>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => void send("DELETE")}
              disabled={sending}
              // 送ったリンクが開けなくなる操作なので、よく使う項目の「削除」と同じ赤い文字のボタンにする
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
                ref={copyButtonRef}
                type="button"
                onClick={() => void copy()}
                disabled={sending}
                className="btn-primary"
              >
                コピー
              </button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
