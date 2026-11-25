"use client";

import { useEffect, useId, useRef } from "react";
import { useBackdropDismiss } from "./useBackdropDismiss";

type Props = {
  open: boolean;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  // 送信中は、どちらのボタンも押せないようにする
  busy?: boolean;
  // 削除など元に戻せない操作のときは、実行のボタンを赤にする
  destructive?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

// 02_画面配置 共通5：確認文と2つのボタン。
// ブラウザの dialog を使い、開いている間は後ろの画面を操作できないようにする。
// Esc・外枠を押したときは「キャンセル」と同じ（外枠は利用者の指示）。送信中は閉じない
export function ConfirmDialog({
  open,
  message,
  confirmLabel,
  cancelLabel,
  busy = false,
  destructive = false,
  error,
  onConfirm,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const messageId = useId();

  function cancelIfIdle() {
    if (!busy) onCancel();
  }
  const backdrop = useBackdropDismiss(cancelIfIdle);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // 最初にカーソルが来るのは「キャンセル」なので、Enter を押しただけでは実行されない
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-describedby={messageId}
      onCancel={(event) => {
        event.preventDefault();
        cancelIfIdle();
      }}
      {...backdrop}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-background p-6 text-foreground backdrop:bg-overlay/50"
    >
      <p id={messageId}>{message}</p>
      {error && (
        <p role="alert" className="mt-3 text-danger">
          {error}
        </p>
      )}
      {/* 「リストから抜ける」など長い文言が狭い幅で並びきらないときは、文字を途中で折らずにボタンごと次の行へ送る */}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="btn-outline"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`rounded px-4 py-2 text-white disabled:opacity-50 ${destructive ? "bg-danger" : "bg-brand"}`}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
