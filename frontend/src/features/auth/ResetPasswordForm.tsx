"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FieldError } from "@/components/FieldError";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import { PasswordInput } from "./PasswordInput";
import { useFieldErrors } from "./useFieldErrors";
import { firstErrors, validatePassword } from "./validation";

const FIELDS = ["password"] as const;

type Props = {
  // メールのリンクの値。画面には入力欄を出さず、そのまま送る
  token: string;
  email: string;
};

type FormError = { kind: "link_invalid" } | { kind: "message"; text: string };

// SC-15 新しいパスワードを設定する
export function ResetPasswordForm({ token, email }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const fieldErrors = useFieldErrors(FIELDS);
  const [formError, setFormError] = useState<FormError | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    setFormError(null);

    // V-02：会員登録と同じ条件。パスワードは削らず、変換もせずに送る
    const errors = { password: validatePassword(password) };
    if (fieldErrors.hasAny(errors)) {
      fieldErrors.show(errors);
      return;
    }

    setSubmitting(true);
    fieldErrors.reset();

    try {
      await clientApi("/reset-password", {
        method: "POST",
        body: { token, email, password },
      });
      // SC-15-4：完了を伝えてログイン画面へ。移動が終わるまで送信中のままにして、二重送信を防ぐ
      router.replace("/login?reset=1");
    } catch (error) {
      if (error instanceof ApiError && error.code === "link_invalid") {
        setFormError({ kind: "link_invalid" });
      } else if (
        error instanceof ApiError &&
        error.code === "validation_error"
      ) {
        const serverErrors = firstErrors(error.errors, FIELDS);
        if (fieldErrors.hasAny(serverErrors)) {
          fieldErrors.show(serverErrors);
        } else {
          // C-04：入力欄のない token・email のエラーはフォームの上に出す
          const linkError = error.errors.token?.[0] ?? error.errors.email?.[0];
          setFormError({ kind: "message", text: linkError ?? error.message });
        }
      } else {
        setFormError({ kind: "message", text: NETWORK_ERROR_MESSAGE });
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {formError?.kind === "link_invalid" && (
        // SC-15-5：422 link_invalid のときだけ、メールの送り直しを案内する
        <div role="alert" className="text-red-700">
          <p>リンクの有効期限が切れているか、すでに使われています。</p>
          <Link href="/forgot-password" className="underline">
            再設定メールを送り直す
          </Link>
        </div>
      )}
      {formError?.kind === "message" && (
        <p role="alert" className="text-red-700">
          {formError.text}
        </p>
      )}

      <div>
        <label htmlFor="password" className="block font-medium">
          新しいパスワード
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
        設定する
      </button>
    </form>
  );
}
