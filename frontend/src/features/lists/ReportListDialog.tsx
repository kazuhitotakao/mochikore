"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { FieldError } from "@/components/FieldError";
import { useFieldErrors } from "@/features/auth/useFieldErrors";
import { firstErrors, focusFirstError } from "@/features/auth/validation";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";

const REASONS = [
  { value: "harassment", label: "誹謗中傷・嫌がらせ" },
  { value: "personal_info", label: "個人情報の掲載" },
  { value: "spam", label: "宣伝・迷惑行為" },
  { value: "other", label: "その他" },
] as const;
const FIELDS = ["reason"] as const;

export function ReportListDialog({ listId }: { listId: number }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fields = useFieldErrors(FIELDS);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);

  useEffect(() => {
    // C-04：サーバーの入力エラーでも、送信中の無効化を解除してから理由欄へ戻す
    if (!submitting) focusFirstError(fields.errors, FIELDS);
  }, [submitting, fields.errors]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  function start() {
    setReason("");
    fields.reset();
    setFormError(null);
    setNotice(null);
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    setFormError(null);

    if (!REASONS.some((entry) => entry.value === reason)) {
      fields.show({ reason: "通報理由を選択してください。" });
      return;
    }

    busy.current = true;
    setSubmitting(true);
    fields.reset();
    try {
      await clientApi(`/public/lists/${listId}/reports`, {
        method: "POST",
        body: { reason },
      });
      setOpen(false);
      setNotice("通報を受け付けました");
    } catch (error) {
      if (error instanceof ApiError && error.code === "validation_error") {
        const errors = firstErrors(error.errors, FIELDS);
        if (fields.hasAny(errors)) fields.show(errors);
        else setFormError(error.message);
      } else if (
        error instanceof ApiError &&
        error.code === "too_many_requests"
      ) {
        setFormError("しばらくしてから再度お試しください。");
      } else if (error instanceof ApiError && error.code === "not_found") {
        // 開いている間に非公開・削除になった場合は、古い公開内容を表示し続けない
        router.refresh();
      } else {
        setFormError(NETWORK_ERROR_MESSAGE);
        // D-80：公開画面では移動せず、期限切れCookieを消した後のヘッダーも読み直す
        if (error instanceof ApiError && error.code === "unauthenticated")
          router.refresh();
      }
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={start} className="self-start underline">
        通報する
      </button>
      {/* 結果の表示場所を確保し、ほかの操作に重ならないようにする */}
      <p role="status" className="min-h-6 text-sm">
        {notice}
      </p>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          if (!busy.current) setOpen(false);
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded bg-background p-6 text-foreground backdrop:bg-black/40"
      >
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <h2 id={titleId} className="text-lg font-bold">
            通報
          </h2>
          {formError && (
            <p role="alert" className="text-red-700">
              {formError}
            </p>
          )}
          <fieldset disabled={submitting} className="flex flex-col gap-3">
            <legend className="mb-3 font-medium">通報理由</legend>
            {REASONS.map((entry, index) => (
              <label key={entry.value} className="flex items-start gap-2">
                <input
                  id={index === 0 ? "reason" : `reason-${entry.value}`}
                  type="radio"
                  name="reason"
                  value={entry.value}
                  checked={reason === entry.value}
                  aria-describedby="reason-error"
                  onChange={(event) => {
                    setReason(event.target.value);
                    fields.clear("reason");
                  }}
                  className="mt-1 size-4 shrink-0"
                />
                {entry.label}
              </label>
            ))}
            <FieldError id="reason-error" message={fields.errors.reason} />
          </fieldset>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              autoFocus
              disabled={submitting}
              onClick={() => setOpen(false)}
              className="rounded border border-zinc-400 px-4 py-2 disabled:opacity-50"
            >
              やめる
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
            >
              {submitting ? "送信中…" : "送信"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
