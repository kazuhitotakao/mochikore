"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FieldError } from "@/components/FieldError";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { useFieldErrors } from "@/features/auth/useFieldErrors";
import {
  firstErrors,
  focusFirstError,
  trimLikeLaravel,
} from "@/features/auth/validation";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type { Category, PackingList } from "@/types/api";
import {
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  descriptionLength,
  normalizeDescription,
  titleLength,
  validateCategory,
  validateDescription,
  validateTitle,
} from "./validation";
import { PUBLISH_MESSAGE, visibilityErrorMessage } from "./visibility";

// 画面の上からの並び。C-04 で最初のエラーへカーソルを移すのに使う
const FIELDS = ["title", "category_id", "description"] as const;

// C-04：空のPATCHのとき。Laravel の errors._form と同じ文言
const NO_CHANGES_MESSAGE = "変更する項目を入力してください。";

type EditableList = Pick<
  PackingList,
  "id" | "title" | "description" | "category" | "is_public" | "moderated_at"
>;

type Props = {
  categories: Category[];
  // 編集のときだけ渡す。ないときは新規作成
  list?: EditableList;
};

// SC-06 リスト作成・編集。新規は API-06、編集は API-08
export function ListForm({ categories, list }: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  // D-85：入力の保存後に公開できなかった場合も、次の送信は保存済みの内容と比較する
  const [savedList, setSavedList] = useState(list);
  const [moderated, setModerated] = useState(Boolean(list?.moderated_at));
  const [confirmPublic, setConfirmPublic] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [title, setTitle] = useState(list?.title ?? "");
  const [categoryId, setCategoryId] = useState<number | null>(
    list?.category.id ?? null,
  );
  const [description, setDescription] = useState(list?.description ?? "");
  const [submitting, setSubmitting] = useState(false);
  const fieldErrors = useFieldErrors(FIELDS);
  const focusRequested = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    // C-04：確認が閉じ、送信中の無効化が解けてから、入力欄へフォーカスする
    if (!submitting && !confirmPublic && focusRequested.current) {
      focusRequested.current = false;
      focusFirstError(fieldErrors.errors, FIELDS);
    }
  }, [submitting, confirmPublic, fieldErrors.errors]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function validateInputs(): boolean {
    // C-04：送信前に全項目を確かめる。最終的な判定は Laravel が行う
    const errors = {
      title: validateTitle(title),
      category_id: validateCategory(categoryId),
      description: validateDescription(description),
    };
    if (fieldErrors.hasAny(errors)) {
      focusRequested.current = true;
      fieldErrors.show(errors);
      return false;
    }
    return true;
  }

  function showError(error: unknown, prefix = "") {
    if (redirectIfAuthError(error)) return;

    // D-43：編集中に削除されていたら、読み直して「ページが見つかりません」にする
    if (error instanceof ApiError && error.status === 404) {
      router.refresh();
      return;
    }

    if (error instanceof ApiError && error.code === "list_moderated") {
      setModerated(true);
    }

    const serverErrors =
      error instanceof ApiError && error.code === "validation_error"
        ? firstErrors(error.errors, FIELDS)
        : {};

    if (fieldErrors.hasAny(serverErrors)) {
      focusRequested.current = true;
      fieldErrors.show(serverErrors);
    } else {
      setFormError(prefix + listErrorMessage(error));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    setNotice(null);
    if (!validateInputs()) return;

    // API-08：変更する項目だけ送る（C-03）。Laravel が保存する形にそろえてから比べる
    const changes = savedList
      ? changedFields(savedList, { title, categoryId, description })
      : null;
    if (changes && Object.keys(changes).length === 0) {
      setFormError(NO_CHANGES_MESSAGE);
      return;
    }

    setSubmitting(true);
    fieldErrors.reset();

    try {
      // 前後空白の削除・空欄→null・改行の統一は Laravel が行うので、入力のまま送る（D-92）
      const saved = savedList
        ? await clientApi<PackingList>(`/lists/${savedList.id}`, {
            method: "PATCH",
            body: changes,
          })
        : await clientApi<PackingList>("/lists", {
            method: "POST",
            body: { title, category_id: categoryId, description },
          });
      // SC-06-6：保存したらそのリストの内容（SC-07）へ。戻るでこの画面に戻らないよう置き換える。
      // 移動が終わるまで送信中のままにして、二重送信を防ぐ
      router.replace(`/lists/${saved.id}`);
    } catch (error) {
      showError(error);
      setSubmitting(false);
    }
  }

  async function changeVisibility(isPublic: boolean) {
    if (!savedList || submitting) return;
    setConfirmPublic(false);
    setFormError(null);
    setNotice(null);

    // D-85：非公開への切り替えは、編集中の入力が不正でもすぐに行う
    if (isPublic && !validateInputs()) return;

    setSubmitting(true);
    let contentSaved = false;
    try {
      if (isPublic) {
        const changes = changedFields(savedList, {
          title,
          categoryId,
          description,
        });
        if (Object.keys(changes).length > 0) {
          const saved = await clientApi<PackingList>(`/lists/${savedList.id}`, {
            method: "PATCH",
            body: changes,
          });
          setSavedList(saved);
          contentSaved = true;
        }
      }

      const result = await clientApi<Pick<PackingList, "is_public">>(
        `/lists/${savedList.id}/visibility`,
        { method: "PATCH", body: { is_public: isPublic } },
      );
      setSavedList(
        (current) => current && { ...current, is_public: result.is_public },
      );
      setNotice(
        result.is_public
          ? "リストを公開しました。"
          : "リストを非公開にしました。",
      );
    } catch (error) {
      // D-85：公開だけ失敗した場合も、先に保存できた変更を利用者に伝える
      showError(error, contentSaved ? "変更内容は保存しました。" : "");
    } finally {
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
          disabled={submitting}
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
        disabled={submitting}
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
          disabled={submitting}
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

      {savedList && (
        <section aria-label="公開設定" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span>公開設定：{savedList.is_public ? "公開" : "非公開"}</span>
            <button
              type="button"
              role="switch"
              aria-label="リストを公開する"
              aria-checked={savedList.is_public}
              aria-describedby={moderated ? "moderated-notice" : undefined}
              disabled={submitting || moderated}
              onClick={() => {
                if (savedList.is_public) void changeVisibility(false);
                else setConfirmPublic(true);
              }}
              className="rounded border border-zinc-400 px-4 py-2 disabled:opacity-50"
            >
              {savedList.is_public ? "非公開にする" : "公開にする"}
            </button>
          </div>
          {moderated && (
            <p id="moderated-notice" className="text-sm text-zinc-700">
              このリストは運営により非公開になっています。 お問い合わせ：
              <a href="mailto:simasyam@gmail.com" className="underline">
                simasyam@gmail.com
              </a>
            </p>
          )}
          {/* 利用者の指示：保存ボタンに重ならないよう、公開設定の下に通知の場所を確保する */}
          <p role="status" className="min-h-6 text-sm">
            {notice}
          </p>
        </section>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
      >
        保存
      </button>
      <ConfirmDialog
        open={confirmPublic}
        message={PUBLISH_MESSAGE}
        confirmLabel="公開する"
        cancelLabel="やめる"
        busy={submitting}
        onConfirm={() => void changeVisibility(true)}
        onCancel={() => setConfirmPublic(false)}
      />
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

/**
 * 編集で、最初の内容から変わった項目だけを、入力のままの値で返す。
 */
function changedFields(
  list: EditableList,
  current: { title: string; categoryId: number | null; description: string },
): Record<string, string | number | null> {
  const changes: Record<string, string | number | null> = {};

  if (trimLikeLaravel(current.title) !== list.title) {
    changes.title = current.title;
  }
  if (current.categoryId !== list.category.id) {
    changes.category_id = current.categoryId;
  }
  // 空欄は Laravel が null にするので、null と空文字を同じに扱う
  if (normalizeDescription(current.description) !== (list.description ?? "")) {
    changes.description = current.description;
  }

  return changes;
}

// 02_画面配置 SC-06-6：画面は code で文言を決める
function listErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return NETWORK_ERROR_MESSAGE;

  switch (error.code) {
    case "list_limit_reached":
      return "リストは100件までです。";
    case "list_has_no_items":
    case "list_moderated":
      return visibilityErrorMessage(error);
    case "validation_error":
      // C-04：入力欄に結びつかないエラー（errors._form）はフォームの上に出す
      return (
        error.errors._form?.[0] ?? error.errors.is_public?.[0] ?? error.message
      );
    default:
      return NETWORK_ERROR_MESSAGE;
  }
}
