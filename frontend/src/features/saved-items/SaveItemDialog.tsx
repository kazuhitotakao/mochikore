"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { FieldError } from "@/components/FieldError";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { useFieldErrors } from "@/features/auth/useFieldErrors";
import { firstErrors } from "@/features/auth/validation";
import {
  validateCategory,
  validateSavedItemName,
} from "@/features/lists/validation";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type { Category, PackingListItem, SavedItem } from "@/types/api";

// 画面の上からの並び。Laravel の errors の項目名と同じにして、最初のエラーへカーソルを移す（C-04）
const FIELDS = ["name", "category_id"] as const;

type Props = {
  item: PackingListItem;
  categories: Category[];
  // SC-07-17：カテゴリーの初期値はこのリストのカテゴリー
  defaultCategoryId: number;
  onClose: () => void;
  onSaved: (savedItem: SavedItem) => void;
};

// SC-07-17「よく使う項目に保存」（API-32、F-21）。本人が選んだときだけ、名前とカテゴリー1つで保存する（D-68）。
// 開くたびに作り直すので、親は開いている間だけ表示する
export function SaveItemDialog({
  item,
  categories,
  defaultCategoryId,
  onClose,
  onSaved,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const redirectIfAuthError = useAuthErrorRedirect();
  const [name, setName] = useState(item.name);
  const [categoryId, setCategoryId] = useState<number | null>(
    defaultCategoryId,
  );
  const [submitting, setSubmitting] = useState(false);
  const fieldErrors = useFieldErrors(FIELDS);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    // C-04：送信前に全項目を確かめる。最終的な判定は Laravel が行う
    const errors = {
      name: validateSavedItemName(name),
      category_id: validateCategory(categoryId),
    };
    if (fieldErrors.hasAny(errors)) {
      fieldErrors.show(errors);
      return;
    }

    setSubmitting(true);
    fieldErrors.reset();
    try {
      // 前後空白の削除は Laravel が行うので、入力のまま送る（D-92）
      const savedItem = await clientApi<SavedItem>("/saved-items", {
        method: "POST",
        body: { name, category_id: categoryId },
      });
      // 同じカテゴリーに同じ名前があったとき（200）も、保存できたものとして扱う（V-11）
      onSaved(savedItem);
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;

      const serverErrors =
        failure instanceof ApiError && failure.code === "validation_error"
          ? firstErrors(failure.errors, FIELDS)
          : {};
      if (fieldErrors.hasAny(serverErrors)) {
        fieldErrors.show(serverErrors);
      } else {
        setFormError(saveErrorMessage(failure));
      }
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="save-item-heading"
      onCancel={(event) => {
        // Esc は「やめる」と同じ。送信中は閉じない
        event.preventDefault();
        if (!submitting) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded bg-background p-6 text-foreground backdrop:bg-black/40"
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <h2 id="save-item-heading" className="font-bold">
          よく使う項目に保存
        </h2>

        {formError && (
          <p role="alert" className="text-red-700">
            {formError}
          </p>
        )}

        <div>
          <label htmlFor="name" className="block font-medium">
            項目名
          </label>
          <input
            id="name"
            type="text"
            value={name}
            aria-describedby="name-error"
            aria-invalid={Boolean(fieldErrors.errors.name)}
            onChange={(event) => {
              setName(event.target.value);
              fieldErrors.clear("name");
            }}
            className="w-full rounded border border-zinc-400 px-3 py-2"
          />
          <FieldError id="name-error" message={fieldErrors.errors.name} />
        </div>

        <div>
          <label htmlFor="category_id" className="block font-medium">
            カテゴリー
          </label>
          <select
            id="category_id"
            value={categoryId ?? ""}
            aria-describedby="category_id-error"
            aria-invalid={Boolean(fieldErrors.errors.category_id)}
            onChange={(event) => {
              setCategoryId(
                event.target.value === "" ? null : Number(event.target.value),
              );
              fieldErrors.clear("category_id");
            }}
            className="w-full rounded border border-zinc-400 px-3 py-2"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <FieldError
            id="category_id-error"
            message={fieldErrors.errors.category_id}
          />
        </div>

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded border border-zinc-400 px-4 py-2 disabled:opacity-50"
          >
            やめる
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </form>
    </dialog>
  );
}

// 02_画面配置 SC-07-17：画面は code で文言を決める
function saveErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return NETWORK_ERROR_MESSAGE;

  switch (error.code) {
    case "saved_item_limit_reached":
      return "保存できるのは200件までです。";
    case "validation_error":
      return error.message;
    default:
      return NETWORK_ERROR_MESSAGE;
  }
}
