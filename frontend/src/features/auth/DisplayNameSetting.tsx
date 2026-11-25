"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { DisplayNameField } from "@/features/lists/DisplayNameField";
import { validateDisplayName } from "@/features/lists/validation";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type { User } from "@/types/api";
import { SETTING_ACTION, SettingRow } from "./SettingRow";
import { useAuthErrorRedirect } from "./useAuthErrorRedirect";

type Props = {
  // 今の表示名。まだ入れていなければ null
  displayName: string | null;
};

/**
 * SC-12-10 表示名（F-34、D-119）。共同編集のメンバーに見せる名前を入れる・変える（API-55）。
 * ふだんは今の名前と「変更」だけを出し、押したときに同じ行の中で入力欄を開く。
 */
export function DisplayNameSetting({ displayName }: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const fieldId = useId();
  const titleId = useId();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(displayName ?? "");
  const [nameError, setNameError] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setError(null);
    // C-04：送る前に確かめる。最終的な判定は Laravel が行う（V-27）
    const invalid = validateDisplayName(name);
    setNameError(invalid);
    if (invalid) return;

    setSending(true);
    try {
      // 前後空白の削除は Laravel が行うので、入力のまま送る（D-92）
      const user = await clientApi<User>("/me", {
        method: "PATCH",
        body: { display_name: name },
      });
      setName(user.display_name ?? "");
      setEditing(false);
      setSaved(true);
      // 保存できた名前で画面を読み直す
      router.refresh();
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      const message =
        failure instanceof ApiError && failure.code === "validation_error"
          ? failure.errors.display_name?.[0]
          : undefined;
      if (message) setNameError(message);
      else setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setSending(false);
    }
  }

  if (!editing) {
    return (
      <SettingRow
        title="表示名"
        titleId={titleId}
        value={
          displayName === null ? (
            <p className="text-muted">まだ入れていません</p>
          ) : (
            <p className="wrap-break-word">{displayName}</p>
          )
        }
        action={
          <button
            type="button"
            // 行の見出しと合わせて、何を変えるボタンかを読み上げで伝える
            aria-label={
              displayName === null ? "表示名を入れる" : "表示名を変更"
            }
            onClick={() => {
              setName(displayName ?? "");
              setNameError(undefined);
              setError(null);
              setSaved(false);
              setEditing(true);
            }}
            className={SETTING_ACTION}
          >
            {displayName === null ? "入れる" : "変更"}
          </button>
        }
      >
        <p className="text-sm text-muted">
          共同編集のメンバーに見える名前です。公開リストには出ません。
        </p>
        {saved && (
          <p role="status" className="text-sm">
            表示名を保存しました。
          </p>
        )}
      </SettingRow>
    );
  }

  return (
    <SettingRow title="表示名" titleId={titleId}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
        {/* 行の見出し「表示名」を入力欄の名前にして、同じ言葉を2つ並べない */}
        <DisplayNameField
          id={fieldId}
          value={name}
          error={nameError}
          disabled={sending}
          hint="共同編集のメンバーに見える名前です。公開リストには出ません。"
          labelledBy={titleId}
          autoFocus
          onChange={(value) => {
            setName(value);
            setNameError(undefined);
          }}
        />
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <button type="submit" disabled={sending} className="btn-primary">
            {sending ? "保存中…" : "保存"}
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => setEditing(false)}
            className="btn-outline"
          >
            やめる
          </button>
        </div>
      </form>
    </SettingRow>
  );
}
