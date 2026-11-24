"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { FieldError } from "@/components/FieldError";
import { useBackdropDismiss } from "@/components/useBackdropDismiss";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { useFieldErrors } from "@/features/auth/useFieldErrors";
import { firstErrors } from "@/features/auth/validation";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type { PackingList } from "@/types/api";
import { ITEM_LIMIT_MESSAGE } from "./itemErrors";
import { RemainingCount } from "./ListForm";
import {
  copyTitle,
  TITLE_MAX_LENGTH,
  titleLength,
  validateTitle,
} from "./validation";

const FIELDS = ["title"] as const;
// 同じ画面のほかの入力欄と id が重ならないよう、エラーで移すカーソルの先に付ける
const ID_PREFIX = "duplicate-";
const MODERATED_MESSAGE = "このリストは運営により非公開になっています。";

type Props = {
  listId: number;
  title: string;
  // 「やめる」・Esc・外枠で閉じたとき。複製できたときは呼ばない
  onCancel: () => void;
  // 複製できたとき。一覧に残るので、移動せずに親へ知らせる。
  // 親がこのダイアログを外すまで送信中のままにし、二重に作らない（D-120）
  onDuplicated: () => void;
};

/**
 * SC-05-6「このリストを複製」（F-30、API-50、D-116・D-120）。自分のリスト一覧（SC-05）のカードの「…」から開き、
 * 新しいリスト名を入れて、自分のリストを丸ごと写す。
 * 開いたときだけ置き、閉じたら親が外す。送信中は閉じない（02_画面配置 共通5）。
 */
export function DuplicateListDialog({
  listId,
  title,
  onCancel,
  onDuplicated,
}: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [name, setName] = useState(() => copyTitle(title));
  const [sending, setSending] = useState(false);
  const fieldErrors = useFieldErrors(FIELDS, ID_PREFIX);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function closeIfIdle() {
    if (!sending) onCancel();
  }
  const backdrop = useBackdropDismiss(closeIfIdle);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setFormError(null);

    // C-04：送る前に確かめる。最終的な判定は Laravel が行う（V-04）
    const errors = { title: validateTitle(name) };
    if (fieldErrors.hasAny(errors)) {
      fieldErrors.show(errors);
      return;
    }

    setSending(true);
    fieldErrors.reset();
    try {
      // 前後空白の削除は Laravel が行うので、入力のまま送る（D-92）
      await clientApi<PackingList>(`/lists/${listId}/duplicate`, {
        method: "POST",
        body: { title: name },
      });
      onDuplicated();
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      if (failure instanceof ApiError && failure.code === "not_found") {
        // ほかの画面でリストが消えていた。読み直すと一覧からカードが消え、このダイアログも閉じる（D-43）
        router.refresh();
        return;
      }

      // 運営が非公開にしたリスト（list_moderated）は、一覧に案内を出さないので、ここで理由を出す（D-120）
      const serverErrors =
        failure instanceof ApiError && failure.code === "validation_error"
          ? firstErrors(failure.errors, FIELDS)
          : {};
      if (fieldErrors.hasAny(serverErrors)) {
        fieldErrors.show(serverErrors);
      } else {
        setFormError(duplicateErrorMessage(failure));
      }
      setSending(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        closeIfIdle();
      }}
      {...backdrop}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-background p-6 text-foreground backdrop:bg-overlay/50"
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <h2 id={titleId} className="text-lg font-bold">
          リストを複製
        </h2>

        {formError && (
          <p role="alert" className="text-danger">
            {formError}
          </p>
        )}

        <div>
          <label htmlFor={`${ID_PREFIX}title`} className="mb-1 block font-bold">
            新しいリストの名前
          </label>
          <input
            id={`${ID_PREFIX}title`}
            type="text"
            value={name}
            disabled={sending}
            aria-describedby={`${ID_PREFIX}title-count ${ID_PREFIX}title-error`}
            aria-invalid={Boolean(fieldErrors.errors.title)}
            onChange={(event) => {
              setName(event.target.value);
              fieldErrors.clear("title");
            }}
            className="field w-full"
          />
          <RemainingCount
            id={`${ID_PREFIX}title-count`}
            max={TITLE_MAX_LENGTH}
            length={titleLength(name)}
          />
          <FieldError
            id={`${ID_PREFIX}title-error`}
            message={fieldErrors.errors.title}
          />
        </div>

        {/* D-116：何が写り、何が写らないかを短く伝える */}
        <p className="text-sm text-muted">
          持ち物・グループを写します。チェックは外れます。
        </p>

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={closeIfIdle}
            disabled={sending}
            className="btn-outline"
          >
            やめる
          </button>
          <button type="submit" disabled={sending} className="btn-primary">
            {sending ? "複製中…" : "複製する"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// SC-05-6：複製できなかった理由。画面は code で決める（D-53）
function duplicateErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return NETWORK_ERROR_MESSAGE;

  switch (error.code) {
    case "list_limit_reached":
      return "リストは100件までです。";
    // D-97：元のリストの持ち物が安全上限を超えるとき。複製は1時間の回数には数えない
    case "item_limit_reached":
      return ITEM_LIMIT_MESSAGE;
    case "list_moderated":
      return MODERATED_MESSAGE;
    case "validation_error":
      return error.message;
    default:
      return NETWORK_ERROR_MESSAGE;
  }
}
