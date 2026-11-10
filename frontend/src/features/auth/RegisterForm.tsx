"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FieldError } from "@/components/FieldError";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import { PasswordInput } from "./PasswordInput";
import { useFieldErrors } from "./useFieldErrors";
import { firstErrors, validateEmail, validatePassword } from "./validation";

// 画面の上からの並び。C-04 で最初のエラーへカーソルを移すのに使う
const FIELDS = ["email", "password"] as const;

// SC-03 新規会員登録
export function RegisterForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const fieldErrors = useFieldErrors(FIELDS);
  const [formError, setFormError] = useState<Error | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setFormError(null);

    // C-01・C-04：送信前に画面でも全項目を確かめる。最終的な判定は Laravel が行う
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
      await clientApi("/register", {
        method: "POST",
        body: { email, password },
      });
      // 移動が終わるまで送信中のままにして、二重送信を防ぐ
      router.replace("/verify-email");
    } catch (error) {
      const serverErrors =
        error instanceof ApiError && error.code === "validation_error"
          ? firstErrors(error.errors, FIELDS)
          : {};

      if (fieldErrors.hasAny(serverErrors)) {
        fieldErrors.show(serverErrors);
      } else {
        // C-04：項目に結びつかないエラーはフォームの上に出す
        setFormError(error instanceof Error ? error : new Error());
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {formError && <RegisterError error={formError} />}

      <div>
        <label htmlFor="email" className="block font-medium">
          メールアドレス
        </label>
        {/* SC-03-2：入力した文字を見直しやすい大きさで表示する */}
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          aria-describedby="email-error"
          aria-invalid={Boolean(fieldErrors.errors.email)}
          onChange={() => fieldErrors.clear("email")}
          className="w-full rounded border border-zinc-400 px-3 py-2 text-lg"
        />
        <FieldError id="email-error" message={fieldErrors.errors.email} />
      </div>

      <div>
        <label htmlFor="password" className="block font-medium">
          パスワード
        </label>
        <p id="password-hint" className="text-sm text-zinc-600">
          空白を含めず、半角の英字・数字・記号で8〜72文字
        </p>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          describedBy="password-hint password-error"
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
        登録する
      </button>
    </form>
  );
}

// 02_画面配置 SC-03-4：画面は code で文言を決める
function RegisterError({ error }: { error: Error }) {
  const code = error instanceof ApiError ? error.code : null;

  if (code === "email_already_registered") {
    return (
      <div role="alert" className="text-red-700">
        <p>
          このメールアドレスはすでに登録されています。ログインするか、パスワードを再設定してください。
        </p>
        <div className="flex gap-4">
          <Link href="/login" className="underline">
            ログイン
          </Link>
          <Link href="/forgot-password" className="underline">
            パスワードを再設定
          </Link>
        </div>
      </div>
    );
  }

  return (
    <p role="alert" className="text-red-700">
      {code === "too_many_requests"
        ? "しばらくしてから再度お試しください。"
        : code === "validation_error"
          ? error.message
          : NETWORK_ERROR_MESSAGE}
    </p>
  );
}
