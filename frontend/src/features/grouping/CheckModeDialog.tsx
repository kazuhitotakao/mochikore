"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useBackdropDismiss } from "@/components/useBackdropDismiss";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type { PackingListGroup } from "@/types/api";
import { CheckModeField } from "./CheckModeField";

type Props = {
  group: Pick<PackingListGroup, "id" | "name" | "check_mode">;
  onSaved: (group: PackingListGroup) => void;
  // 「キャンセル」・Esc・外枠を押したとき。送信中は閉じない
  onCancel: () => void;
};

/**
 * SC-07-25・D-122：グループの見出しのボタンから開く「チェックの動き」。
 * 「通常」「繰り返し利用」を選び、「保存」を押すとすぐ保存する（API-44）。
 * 開くたびに作り直すので、親は開いている間だけ表示する。
 */
export function CheckModeDialog({ group, onSaved, onCancel }: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const fieldName = useId();
  const [checkMode, setCheckMode] = useState(group.check_mode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  function cancelIfIdle() {
    if (!inFlight.current) onCancel();
  }
  const backdrop = useBackdropDismiss(cancelIfIdle);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    // 変えていなければ、送らずに閉じる
    if (checkMode === group.check_mode) {
      onCancel();
      return;
    }

    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const saved = await clientApi<PackingListGroup>(`/groups/${group.id}`, {
        method: "PATCH",
        body: { check_mode: checkMode },
      });
      onSaved(saved);
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      // ほかの画面でグループが消えていたら、最新の内容を読み直す
      if (failure instanceof ApiError && failure.status === 404) {
        router.refresh();
        return;
      }
      // 共通10：失敗しても選んだ内容は残す。入力エラーは V-29 の文を出す
      setError(
        failure instanceof ApiError && failure.code === "validation_error"
          ? (failure.errors.check_mode?.[0] ?? failure.message)
          : NETWORK_ERROR_MESSAGE,
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        cancelIfIdle();
      }}
      {...backdrop}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl bg-background p-6 text-foreground backdrop:bg-overlay/50"
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {/* どのグループの設定かが分かるよう、グループ名を見出しにする */}
        <h2 id={titleId} className="text-lg font-bold wrap-break-word">
          {group.name}
        </h2>
        <CheckModeField
          name={fieldName}
          value={checkMode}
          disabled={saving}
          onChange={(value) => {
            setCheckMode(value);
            setError(null);
          }}
        />
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="btn-outline"
          >
            キャンセル
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
