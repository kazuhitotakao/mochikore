"use client";

import { useEffect, useState, type FormEvent } from "react";
import { FieldError } from "@/components/FieldError";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import { useFieldErrors } from "./useFieldErrors";
import { firstErrors, validateEmail } from "./validation";

const FIELDS = ["email"] as const;

// SC-14：同じアドレスへの再送は1分あける。Laravel は再送待ちかどうかを返さない（D-93）ので、
// 登録の有無にかかわらず、送信のたびに画面で60秒数える
const RESEND_INTERVAL_SECONDS = 60;

// SC-14 再設定メールを送る
export function ForgotPasswordForm() {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const fieldErrors = useFieldErrors(FIELDS);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (waitSeconds <= 0) return;
    const timer = setTimeout(() => setWaitSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [waitSeconds]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    setFormError(null);

    // V-16・V-01：会員登録と同じ条件で確かめる。最終的な判定は Laravel が行う
    const errors = { email: validateEmail(email) };
    if (fieldErrors.hasAny(errors)) {
      fieldErrors.show(errors);
      return;
    }

    setSubmitting(true);
    fieldErrors.reset();

    try {
      // 空白の削除と小文字化は Laravel が行うので、入力のまま送る
      await clientApi("/forgot-password", { method: "POST", body: { email } });
      setSent(true);
      setWaitSeconds(RESEND_INTERVAL_SECONDS);
    } catch (error) {
      const serverErrors =
        error instanceof ApiError && error.code === "validation_error"
          ? firstErrors(error.errors, FIELDS)
          : {};

      if (fieldErrors.hasAny(serverErrors)) {
        fieldErrors.show(serverErrors);
      } else {
        setFormError(forgotPasswordErrorMessage(error));
      }
    } finally {
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

      <button
        type="submit"
        disabled={submitting || waitSeconds > 0}
        className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
      >
        再設定メールを送る
      </button>
      {waitSeconds > 0 && (
        <p role="status">あと{waitSeconds}秒で送り直せます</p>
      )}

      {/* SC-14-4・D-40：登録の有無で表示を変えない */}
      {sent && (
        <div role="status" className="flex flex-col gap-1">
          <p>
            入力されたメールアドレスが登録されている場合、再設定用のメールを送信します。
          </p>
          <p>メールのリンクは60分間有効です。</p>
        </div>
      )}
    </form>
  );
}

// 02_画面配置 SC-14-3：画面は code で文言を決める
function forgotPasswordErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return NETWORK_ERROR_MESSAGE;

  switch (error.code) {
    // D-41：残り秒数は出さず、登録の有無が分からない同じ文言にする
    case "too_many_requests":
      return "しばらくしてから再度お試しください。";
    case "validation_error":
      return error.message;
    default:
      return NETWORK_ERROR_MESSAGE;
  }
}
