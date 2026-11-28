"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FieldError } from "@/components/FieldError";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type { User } from "@/types/api";
import { PasswordInput } from "./PasswordInput";
import { useFieldErrors } from "./useFieldErrors";
import { firstErrors, validateEmail, validatePassword } from "./validation";

// 画面の上からの並び。C-04 で最初のエラーへカーソルを移すのに使う
const FIELDS = ["email", "password"] as const;

type Props = {
  next: string | null;
};

// SC-02 ログイン
export function LoginForm({ next }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const fieldErrors = useFieldErrors(FIELDS);
  const [formError, setFormError] = useState<string | null>(null);
  // SC-02-4・D-131：回数制限（429）の残り秒数。1秒ごとに減らし、0になったら案内を消す
  const [waitSeconds, setWaitSeconds] = useState(0);
  // 残り秒数は待ち終わる時刻から数え直す。画面を離れてタイマーが止まっても、戻ったときに正しい秒数を出すため
  const waitUntil = useRef(0);
  const waiting = waitSeconds > 0;

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      setWaitSeconds(
        Math.max(0, Math.ceil((waitUntil.current - Date.now()) / 1000)),
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setFormError(null);
    setWaitSeconds(0);

    // V-03：会員登録と同じ条件で、送信前に画面でも全項目を確かめる。最終的な判定は Laravel が行う
    const errors = {
      email: validateEmail(email),
      password: validatePassword(password),
    };
    if (fieldErrors.hasAny(errors)) {
      fieldErrors.show(errors);
      return;
    }

    setSubmitting(true);
    fieldErrors.reset();

    try {
      // 空白の削除と小文字化は Laravel が行うので、入力のまま送る
      const { user } = await clientApi<{ user: User }>("/login", {
        method: "POST",
        body: { email, password },
      });
      // 移動が終わるまで送信中のままにして、二重送信を防ぐ
      router.replace(
        next ?? (user.email_verified_at ? "/lists" : "/verify-email"),
      );
    } catch (error) {
      const serverErrors =
        error instanceof ApiError && error.code === "validation_error"
          ? firstErrors(error.errors, FIELDS)
          : {};

      if (fieldErrors.hasAny(serverErrors)) {
        fieldErrors.show(serverErrors);
      } else if (
        error instanceof ApiError &&
        error.code === "too_many_requests"
      ) {
        // D-131：ボタンは押せるままにする（回数はメールアドレスとIPの組で数えるので、別のアドレスなら待たずに試せる）
        const seconds = Math.max(1, error.retryAfter ?? 60);
        waitUntil.current = Date.now() + seconds * 1000;
        setWaitSeconds(seconds);
      } else {
        // C-04：項目に結びつかないエラーはフォームの上に出す
        setFormError(loginErrorMessage(error));
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {formError && (
        <p role="alert" className="text-danger">
          {formError}
        </p>
      )}
      {waiting && (
        <p role="alert" className="text-danger">
          あと{waitSeconds}秒で再度お試しいただけます
        </p>
      )}

      <div>
        <label htmlFor="email" className="mb-1 block font-bold">
          メールアドレス
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          aria-describedby="email-error"
          aria-invalid={Boolean(fieldErrors.errors.email)}
          onChange={() => fieldErrors.clear("email")}
          className="field w-full"
        />
        <FieldError id="email-error" message={fieldErrors.errors.email} />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block font-bold">
          パスワード
        </label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          describedBy="password-error"
          invalid={Boolean(fieldErrors.errors.password)}
          onChange={() => fieldErrors.clear("password")}
        />
        <FieldError id="password-error" message={fieldErrors.errors.password} />
      </div>

      <button type="submit" disabled={submitting} className="btn-primary">
        ログイン
      </button>
    </form>
  );
}

// 02_画面配置 SC-02-4：画面は code で文言を決める
function loginErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return NETWORK_ERROR_MESSAGE;

  switch (error.code) {
    case "invalid_credentials":
      return "メールアドレスまたはパスワードが正しくありません。";
    case "validation_error":
      return error.message;
    default:
      return NETWORK_ERROR_MESSAGE;
  }
}
