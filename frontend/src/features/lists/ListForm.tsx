"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FieldError } from "@/components/FieldError";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { useFieldErrors } from "@/features/auth/useFieldErrors";
import { firstErrors } from "@/features/auth/validation";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type { Category, PackingList } from "@/types/api";
import {
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  descriptionLength,
  titleLength,
  validateCategory,
  validateDescription,
  validateTitle,
} from "./validation";

// 画面の上からの並び。C-04 で最初のエラーへカーソルを移すのに使う
const FIELDS = ["title", "category_id", "description"] as const;

type Props = {
  categories: Category[];
};

// SC-06 リスト作成・編集。今は新規作成（API-06）だけ
export function ListForm({ categories }: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fieldErrors = useFieldErrors(FIELDS);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    // C-04：送信前に全項目を確かめる。最終的な判定は Laravel が行う
    const errors = {
      title: validateTitle(title),
      category_id: validateCategory(categoryId),
      description: validateDescription(description),
    };
    if (fieldErrors.hasAny(errors)) {
      fieldErrors.show(errors);
      return;
    }

    setSubmitting(true);
    fieldErrors.reset();

    try {
      // 前後空白の削除・空欄→null・改行の統一は Laravel が行うので、入力のまま送る（D-92）
      const list = await clientApi<PackingList>("/lists", {
        method: "POST",
        body: { title, category_id: categoryId, description },
      });
      // SC-06-6：保存したらそのリストの内容（SC-07）へ。戻るで空の作成画面に戻らないよう置き換える。
      // 移動が終わるまで送信中のままにして、二重送信を防ぐ
      router.replace(`/lists/${list.id}`);
    } catch (error) {
      if (redirectIfAuthError(error)) return;

      const serverErrors =
        error instanceof ApiError && error.code === "validation_error"
          ? firstErrors(error.errors, FIELDS)
          : {};

      if (fieldErrors.hasAny(serverErrors)) {
        fieldErrors.show(serverErrors);
      } else {
        // C-04：項目に結びつかないエラーはフォームの上に出す
        setFormError(listErrorMessage(error));
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {formError && (
        <p role="alert" className="text-red-700">
          {formError}
        </p>
      )}

      <div>
        <label htmlFor="title" className="block font-medium">
          リスト名（必須）
        </label>
        <input
          id="title"
          name="title"
          type="text"
          value={title}
          aria-describedby="title-count title-error"
          aria-invalid={Boolean(fieldErrors.errors.title)}
          onChange={(event) => {
            setTitle(event.target.value);
            fieldErrors.clear("title");
          }}
          className="w-full rounded border border-zinc-400 px-3 py-2"
        />
        <RemainingCount
          id="title-count"
          max={TITLE_MAX_LENGTH}
          length={titleLength(title)}
        />
        <FieldError id="title-error" message={fieldErrors.errors.title} />
      </div>

      {/* SC-06-4：10種類から1つだけ選ぶ。名前の下に短い例を添える */}
      <fieldset
        id="category_id"
        tabIndex={-1}
        aria-describedby="category_id-error"
        aria-invalid={Boolean(fieldErrors.errors.category_id)}
      >
        <legend className="font-medium">カテゴリー（必須）</legend>
        <div className="mt-2 flex flex-col gap-2">
          {categories.map((category) => (
            <label
              key={category.id}
              className="flex items-start gap-3 rounded border border-zinc-300 px-3 py-2 has-[:checked]:border-zinc-900"
            >
              <input
                type="radio"
                name="category_id"
                value={category.id}
                checked={categoryId === category.id}
                onChange={() => {
                  setCategoryId(category.id);
                  fieldErrors.clear("category_id");
                }}
                className="mt-1"
              />
              <span>
                <span className="block">{category.name}</span>
                <span className="block text-sm text-zinc-600">
                  {category.example}
                </span>
              </span>
            </label>
          ))}
        </div>
        <FieldError
          id="category_id-error"
          message={fieldErrors.errors.category_id}
        />
      </fieldset>

      <div>
        <label htmlFor="description" className="block font-medium">
          説明文（任意）
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          value={description}
          aria-describedby="description-count description-error"
          aria-invalid={Boolean(fieldErrors.errors.description)}
          onChange={(event) => {
            setDescription(event.target.value);
            fieldErrors.clear("description");
          }}
          className="w-full rounded border border-zinc-400 px-3 py-2"
        />
        <RemainingCount
          id="description-count"
          max={DESCRIPTION_MAX_LENGTH}
          length={descriptionLength(description)}
        />
        <FieldError
          id="description-error"
          message={fieldErrors.errors.description}
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
      >
        保存
      </button>
    </form>
  );
}

// SC-06-3・5：残りの文字数。入力欄の maxLength は UTF-16 で数えて絵文字を多く数えるので使わない（C-01）
function RemainingCount({
  id,
  max,
  length,
}: {
  id: string;
  max: number;
  length: number;
}) {
  const remaining = max - length;

  return (
    <p id={id} className="mt-1 text-sm text-zinc-600">
      {remaining >= 0
        ? `残り${remaining}文字`
        : `${-remaining}文字多くなっています`}
    </p>
  );
}

// 02_画面配置 SC-06-6：画面は code で文言を決める
function listErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return NETWORK_ERROR_MESSAGE;

  switch (error.code) {
    case "list_limit_reached":
      return "リストは100件までです。";
    case "validation_error":
      return error.message;
    default:
      return NETWORK_ERROR_MESSAGE;
  }
}
