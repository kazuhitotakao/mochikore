"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import { useBackdropDismiss } from "@/components/useBackdropDismiss";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type { PackingListGroup, PackingListItem } from "@/types/api";
import { CheckModeField } from "./CheckModeField";

type Props = {
  listId: number;
  group: Pick<PackingListGroup, "id" | "name" | "check_mode">;
  // D-122：このグループのチェック済みの持ち物。繰り返し利用のグループで、まとめて外すのに使う
  checkedItemIds: number[];
  onSaved: (group: PackingListGroup) => void;
  // 「チェックを外す」が保存できたとき。変えた後の持ち物（API-37 の応答）を渡す
  onUnchecked: (items: PackingListItem[]) => void;
  // 「キャンセル」・Esc・外枠を押したとき。送信中は閉じない
  onCancel: () => void;
};

/**
 * SC-07-25・D-122：グループの見出しのボタンから開く「チェックの動き」。
 * 「通常」「繰り返し利用」を選び、「保存」を押すとすぐ保存する（API-44）。
 * 繰り返し利用のグループのチェックは自動では外れないので、チェック済みがあれば
 * 「チェック済み n件」と「チェックを外す」も出し、押すとグループのチェックをすぐ外す（API-37。前回の日付は残る）。
 * 開くたびに作り直すので、親は開いている間だけ表示する。
 */
export function CheckModeDialog({
  listId,
  group,
  checkedItemIds,
  onSaved,
  onUnchecked,
  onCancel,
}: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const fieldName = useId();
  const uncheckStatusId = useId();
  const uncheckNoteId = useId();
  const [checkMode, setCheckMode] = useState(group.check_mode);
  // 送信中の操作。保存とチェックを外す操作は、どちらか1つだけを送る
  const [sending, setSending] = useState<"save" | "uncheck" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  // 開いている間に共同編集のメンバーが設定を変えたときも、保存した設定で出し分ける
  const canUncheck = group.check_mode === "repeat" && checkedItemIds.length > 0;

  function cancelIfIdle() {
    if (!inFlight.current) onCancel();
  }
  const backdrop = useBackdropDismiss(cancelIfIdle);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  // 404・401などで画面を移動・読み直ししたら true
  function handleMovingError(failure: unknown): boolean {
    if (redirectIfAuthError(failure)) return true;
    // ほかの画面でグループ・持ち物が消えていたら、最新の内容を読み直す
    if (failure instanceof ApiError && failure.status === 404) {
      router.refresh();
      return true;
    }
    return false;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    // 変えていなければ、送らずに閉じる
    if (checkMode === group.check_mode) {
      onCancel();
      return;
    }

    inFlight.current = true;
    setSending("save");
    setError(null);
    try {
      const saved = await clientApi<PackingListGroup>(`/groups/${group.id}`, {
        method: "PATCH",
        body: { check_mode: checkMode },
      });
      onSaved(saved);
    } catch (failure) {
      if (handleMovingError(failure)) return;
      // 共通10：失敗しても選んだ内容は残す。入力エラーは V-29 の文を出す
      setError(
        failure instanceof ApiError && failure.code === "validation_error"
          ? (failure.errors.check_mode?.[0] ?? failure.message)
          : NETWORK_ERROR_MESSAGE,
      );
    } finally {
      inFlight.current = false;
      setSending(null);
    }
  }

  // D-122（利用者の指示）：グループのチェックをまとめて外す。付けてからの時間に関係なく、前回の日付は残る
  async function handleUncheck() {
    if (inFlight.current || !canUncheck) return;

    inFlight.current = true;
    setSending("uncheck");
    setError(null);
    try {
      const saved = await clientApi<PackingListItem[]>(
        `/lists/${listId}/items/checks`,
        {
          method: "PATCH",
          body: { item_ids: checkedItemIds, is_checked: false },
        },
      );
      onUnchecked(saved);
    } catch (failure) {
      if (handleMovingError(failure)) return;
      // V-19：その間にほかのメンバーが持ち物を消したときなど。読み直しを案内する
      setError(
        failure instanceof ApiError && failure.code === "validation_error"
          ? (failure.errors.item_ids?.[0] ?? failure.message)
          : NETWORK_ERROR_MESSAGE,
      );
    } finally {
      inFlight.current = false;
      setSending(null);
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
        {canUncheck && (
          // 利用者の指示：今の状態（チェック済みの件数）と外すボタンを1行に並べ、何が外れるかを一目で分かるようにする。
          // 押すとすぐ外す操作なので、下の「チェックの動き」の選択・保存とは線で分ける
          <div className="flex flex-col gap-1 border-b border-line-soft pb-4">
            <div className="flex items-center justify-between gap-3">
              <p id={uncheckStatusId} className="font-bold">
                チェック済み {checkedItemIds.length}件
              </p>
              <button
                type="button"
                onClick={() => void handleUncheck()}
                disabled={sending !== null}
                aria-describedby={`${uncheckStatusId} ${uncheckNoteId}`}
                className="btn-outline btn-sm tap-target shrink-0 gap-1.5"
              >
                <Icon name="reset" className="size-4" />
                {sending === "uncheck" ? "外しています…" : "チェックを外す"}
              </button>
            </div>
            <p id={uncheckNoteId} className="text-sm text-muted">
              前回チェックした日は残ります。
            </p>
          </div>
        )}
        <CheckModeField
          name={fieldName}
          value={checkMode}
          disabled={sending !== null}
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
            disabled={sending !== null}
            className="btn-outline"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={sending !== null}
            className="btn-primary"
          >
            {sending === "save" ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
