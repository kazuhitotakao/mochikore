"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { CategoryPicker } from "@/components/CategoryPicker";
import { FieldError } from "@/components/FieldError";
import {
  firstErrors,
  focusFirstError,
  trimLikeLaravel,
} from "@/features/auth/validation";
import type { Category } from "@/types/api";
import {
  publicListHref,
  validateKeyword,
  type PublicListSort,
} from "./publicSearch";

const FIELDS = ["keyword", "category_id"] as const;

type Props = {
  categories: Category[];
  initialKeyword: string;
  initialCategory: string;
  // D-117：検索し直しても、選んでいる並び順を保つ
  sort: PublicListSort | null;
  serverErrors: Record<string, string[]>;
  serverMessage: string | null;
};

export function PublicListSearch({
  categories,
  initialKeyword,
  initialCategory,
  sort,
  serverErrors,
  serverMessage,
}: Props) {
  const router = useRouter();
  const [keyword, setKeyword] = useState(initialKeyword);
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [errors, setErrors] = useState(() => firstErrors(serverErrors, FIELDS));
  const [pending, startTransition] = useTransition();
  const otherError = Object.entries(serverErrors).find(
    ([key]) => !FIELDS.some((field) => field === key),
  )?.[1][0];

  useEffect(() => {
    focusFirstError(firstErrors(serverErrors, FIELDS), FIELDS);
  }, [serverErrors]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const nextErrors = { keyword: validateKeyword(keyword) };
    setErrors(nextErrors);
    if (nextErrors.keyword) {
      focusFirstError(nextErrors, FIELDS);
      return;
    }

    // D-81：「すべて」・空の検索語・1ページ目はURLから省略し、検索するたびに1ページ目へ戻す
    const query = new URLSearchParams();
    if (trimLikeLaravel(keyword) !== "") query.set("keyword", keyword);
    if (categoryId !== "") query.set("category_id", categoryId);
    if (sort === "most_copied") query.set("sort", sort);
    const href = publicListHref(query);
    startTransition(() => {
      if (href === window.location.pathname + window.location.search)
        router.refresh();
      else router.push(href);
    });
  }

  return (
    <form onSubmit={search} noValidate className="flex flex-col gap-4">
      {(serverMessage || otherError) && (
        <p role="alert" className="text-danger">
          {serverMessage ?? otherError}
        </p>
      )}
      <div>
        <label htmlFor="keyword" className="mb-1 block font-bold">
          リスト名で探す
        </label>
        <input
          id="keyword"
          type="search"
          value={keyword}
          disabled={pending}
          aria-describedby="keyword-error"
          aria-invalid={Boolean(errors.keyword)}
          onChange={(event) => {
            setKeyword(event.target.value);
            setErrors((current) => ({ ...current, keyword: undefined }));
          }}
          className="field w-full"
        />
        <FieldError id="keyword-error" message={errors.keyword} />
      </div>
      <div>
        {/* SC-10-4：「すべて」と10種類。id は errors の項目名と同じにし、入力エラーのときにこの枠へカーソルを移す（C-04） */}
        <CategoryPicker
          id="category_id"
          label="カテゴリー"
          options={[
            { value: "", label: "すべて" },
            // 通信失敗でも、送信前に選んでいたカテゴリーを失わないようにする（C-04）
            ...(categoryId !== "" &&
            !categories.some((entry) => String(entry.id) === categoryId)
              ? [{ value: categoryId, label: "選択中のカテゴリー" }]
              : []),
            ...categories.map((category) => ({
              value: String(category.id),
              label: category.name,
            })),
          ]}
          value={categoryId}
          disabled={pending}
          describedBy="category_id-error"
          invalid={Boolean(errors.category_id)}
          onChange={(next) => {
            setCategoryId(next);
            setErrors((current) => ({ ...current, category_id: undefined }));
          }}
        />
        <FieldError id="category_id-error" message={errors.category_id} />
      </div>
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "検索中…" : "検索"}
      </button>
    </form>
  );
}
