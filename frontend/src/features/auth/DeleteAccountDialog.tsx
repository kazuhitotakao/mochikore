"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { FieldError } from "@/components/FieldError";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import { PasswordInput } from "./PasswordInput";
import { useAuthErrorRedirect } from "./useAuthErrorRedirect";
import { useFieldErrors } from "./useFieldErrors";
import { firstErrors, focusFirstError, validatePassword } from "./validation";

const FIELDS = ["password"] as const;

// SC-12-7・8：削除する内容と現在のパスワードを確認してからAPI-22を送る
export function DeleteAccountDialog() {
  const router = useRouter();
  const redirectOnAuthError = useAuthErrorRedirect();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const fields = useFieldErrors(FIELDS);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) {
      dialog.showModal();
      // Enterだけで削除へ進まないよう、開いた直後は「やめる」にフォーカスする
      cancelRef.current?.focus();
    }
    if (!open && dialog?.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!submitting) focusFirstError(fields.errors, FIELDS);
  }, [submitting, fields.errors]);

  useEffect(() => {
    if (waitSeconds <= 0) return;
    const timer = setTimeout(() => setWaitSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [waitSeconds]);

  function start() {
    fields.reset();
    setFormError(null);
    // ダイアログを閉じても待ち時間は保持し、開き直しただけでは再送できない
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || waitSeconds > 0) return;
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    setFormError(null);
    const errors = { password: validatePassword(password) };
    if (fields.hasAny(errors)) {
      fields.show(errors);
      return;
    }

    busy.current = true;
    setSubmitting(true);
    fields.reset();
    try {
      await clientApi("/me", { method: "DELETE", body: { password } });
      // SC-12-8：削除とCookie消去が確定してからトップへ移動する。自動では再送しない
      router.replace("/");
      // 古い本人データを履歴から表示しないよう、退会前の画面キャッシュも破棄する
      router.refresh();
    } catch (error) {
      if (redirectOnAuthError(error, "/account")) return;
      if (error instanceof ApiError && error.code === "invalid_password") {
        fields.show({ password: "パスワードが正しくありません。" });
      } else if (
        error instanceof ApiError &&
        error.code === "validation_error"
      ) {
        const errors = firstErrors(error.errors, FIELDS);
        if (fields.hasAny(errors)) fields.show(errors);
        else setFormError(error.message);
      } else if (
        error instanceof ApiError &&
        error.code === "too_many_requests"
      ) {
        setWaitSeconds(error.retryAfter ?? 60);
      } else {
        // C-04：通信失敗・500ではダイアログと入力を残し、本人がやり直せるようにする
        setFormError(NETWORK_ERROR_MESSAGE);
      }
      busy.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 border-t border-zinc-200 pt-6">
      <button
        type="button"
        onClick={start}
        className="text-sm text-red-700 underline"
      >
        アカウントを削除
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onCancel={(event) => {
          event.preventDefault();
          if (!busy.current) setOpen(false);
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded bg-background p-6 text-foreground backdrop:bg-black/40"
      >
        {/* 閉じるたびに入力と表示切替を作り直し、パスワードを残さない */}
        <form
          key={String(open)}
          onSubmit={submit}
          noValidate
          className="flex flex-col gap-4"
        >
          <h2 id={titleId} className="text-lg font-bold">
            アカウント削除
          </h2>
          <div id={descriptionId} className="flex flex-col gap-2 text-sm">
            <p>アカウントと、次のデータを削除します。</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>自分のリスト（コピーしたリストを含む）</li>
              <li>持ち物・チェック状態・グループ</li>
              <li>よく使う項目・よく使うグループ</li>
              <li>ログイン情報・パスワード再設定の情報</li>
            </ul>
            <p>ほかの人が自分用にコピーしたリストは残ります。</p>
            <p>削除すると元に戻せません。</p>
          </div>
          {formError && (
            <p role="alert" className="text-red-700">
              {formError}
            </p>
          )}
          <fieldset disabled={submitting} className="flex flex-col gap-2">
            <label htmlFor="password" className="font-medium">
              現在のパスワード
            </label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              describedBy="password-error"
              invalid={Boolean(fields.errors.password)}
              onChange={() => fields.clear("password")}
            />
            <FieldError id="password-error" message={fields.errors.password} />
          </fieldset>
          {waitSeconds > 0 && (
            <p role="status">あと{waitSeconds}秒で再度お試しいただけます</p>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              ref={cancelRef}
              disabled={submitting}
              onClick={() => setOpen(false)}
              className="rounded border border-zinc-400 px-4 py-2 disabled:opacity-50"
            >
              やめる
            </button>
            <button
              type="submit"
              disabled={submitting || waitSeconds > 0}
              className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50"
            >
              {submitting ? "削除中…" : "削除する"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
