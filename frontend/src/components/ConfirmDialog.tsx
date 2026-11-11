"use client";

import { useEffect, useId, useRef } from "react";

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
// ブラウザの dialog を使い、開いている間は後ろの画面を操作できないようにする。Esc は「やめる」と同じ
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

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // 最初にカーソルが来るのは「やめる」なので、Enter を押しただけでは実行されない
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-describedby={messageId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded bg-background p-6 text-foreground backdrop:bg-black/40"
    >
      <p id={messageId}>{message}</p>
      {error && (
        <p role="alert" className="mt-3 text-red-700">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded border border-zinc-400 px-4 py-2 disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`rounded px-4 py-2 text-white disabled:opacity-50 ${destructive ? "bg-red-700" : "bg-zinc-900"}`}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
