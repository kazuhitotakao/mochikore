"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setFormError(null);

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
        <p role="alert" className="text-red-700">
          {formError}
        </p>
      )}

      <div>
        <label htmlFor="email" className="block font-medium">
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
          className="w-full rounded border border-zinc-400 px-3 py-2"
        />
        <FieldError id="email-error" message={fieldErrors.errors.email} />
      </div>

      <div>
        <label htmlFor="password" className="block font-medium">
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

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
      >
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
    case "too_many_requests":
      return `あと${error.retryAfter ?? 60}秒で再度お試しいただけます`;
    case "validation_error":
      return error.message;
    default:
      return NETWORK_ERROR_MESSAGE;
  }
}
