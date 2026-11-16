"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FieldError } from "@/components/FieldError";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import { PasswordInput } from "./PasswordInput";
import { useAuthErrorRedirect } from "./useAuthErrorRedirect";
import { useFieldErrors } from "./useFieldErrors";
import {
  firstErrors,
  trimLikeLaravel,
  validateEmail,
  validatePassword,
} from "./validation";

const FIELDS = ["pending_email", "password"] as const;

type Props = {
  currentEmail: string;
  pendingEmail?: string;
  initialWaitSeconds?: number;
  onSent?: () => void;
};

// SC-17-4・SC-13-4：初回と再送で同じ入力条件・API-27を使う
export function EmailChangeForm({
  currentEmail,
  pendingEmail,
  initialWaitSeconds = 0,
  onSent,
}: Props) {
  const router = useRouter();
  const redirectOnAuthError = useAuthErrorRedirect();
  const fields = useFieldErrors(FIELDS);
  const busy = useRef(false);
  const [sending, setSending] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(initialWaitSeconds);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const resending = pendingEmail !== undefined;

  useEffect(() => {
    if (waitSeconds <= 0) return;
    const timer = setTimeout(
      () => setWaitSeconds((seconds) => seconds - 1),
      1000,
    );
    return () => clearTimeout(timer);
  }, [waitSeconds]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || waitSeconds > 0) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = pendingEmail ?? String(data.get("pending_email") ?? "");
    const password = String(data.get("password") ?? "");
    const normalized = trimLikeLaravel(email).replace(/[A-Z]/g, (char) =>
      char.toLowerCase(),
    );
    const emailError =
      validateEmail(email) ??
      (normalized === currentEmail
        ? "現在とは別のメールアドレスを入力してください。"
        : undefined);
    const errors = {
      pending_email: emailError,
      password: validatePassword(password),
    };
    setFormError(null);
    setNotice(null);
    if (fields.hasAny(errors)) {
      fields.show(errors);
      return;
    }

    busy.current = true;
    setSending(true);
    fields.reset();
    try {
      await clientApi("/me/email-change", {
        method: "POST",
        body: { pending_email: email, password },
      });
      form.reset();
      if (resending) {
        setWaitSeconds(60);
        setNotice("確認メールの再送を受け付けました。");
        onSent?.();
        router.refresh();
        busy.current = false;
        setSending(false);
      } else {
        // 204を受け取ってから案内へ移動し、入力したパスワードを履歴に残さない
        router.push("/account/email?sent=1");
        router.refresh();
      }
    } catch (error) {
      if (redirectOnAuthError(error)) return;
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
        setFormError(NETWORK_ERROR_MESSAGE);
      }
      busy.current = false;
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={
        resending ? "メール変更の確認メールを再送" : "メールアドレスの変更"
      }
      className="flex flex-col gap-4"
    >
      {formError && (
        <p role="alert" className="text-danger">
          {formError}
        </p>
      )}
      {!resending && (
        <div>
          <label htmlFor="pending_email" className="mb-1 block font-bold">
            新しいメールアドレス
          </label>
          <input
            id="pending_email"
            name="pending_email"
            type="email"
            autoComplete="email"
            aria-describedby="pending_email-error"
            aria-invalid={Boolean(fields.errors.pending_email)}
            onChange={() => fields.clear("pending_email")}
            className="field w-full"
          />
          <FieldError
            id="pending_email-error"
            message={fields.errors.pending_email}
          />
        </div>
      )}
      {resending && (
        <FieldError
          id="pending_email-error"
          message={fields.errors.pending_email}
        />
      )}
      <div>
        <label htmlFor="password" className="mb-1 block font-bold">
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
      </div>
      <button
        type="submit"
        disabled={sending || waitSeconds > 0}
        className="self-start btn-primary"
      >
        {sending
          ? "送信中…"
          : resending
            ? "確認メールを送り直す"
            : "確認メールを送る"}
      </button>
      {waitSeconds > 0 && (
        <p role="status">
          {resending
            ? `あと${waitSeconds}秒で送り直せます`
            : `あと${waitSeconds}秒で再度お試しいただけます`}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </form>
  );
}
