"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { FieldError } from "@/components/FieldError";
import {
  firstErrors,
  focusFirstError,
  trimLikeLaravel,
} from "@/features/auth/validation";
import type { Category } from "@/types/api";
import { publicListHref, validateKeyword } from "./publicSearch";

const FIELDS = ["keyword", "category_id"] as const;

type Props = {
  categories: Category[];
  initialKeyword: string;
  initialCategory: string;
  serverErrors: Record<string, string[]>;
  serverMessage: string | null;
};

export function PublicListSearch({
  categories,
  initialKeyword,
  initialCategory,
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
        <p role="alert" className="text-red-700">
          {serverMessage ?? otherError}
        </p>
      )}
      <div>
        <label htmlFor="keyword" className="block font-medium">
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
          className="w-full rounded border border-zinc-400 px-3 py-2"
        />
        <FieldError id="keyword-error" message={errors.keyword} />
      </div>
      <div>
        <label htmlFor="category_id" className="block font-medium">
          カテゴリー
        </label>
        <select
          id="category_id"
          value={categoryId}
          disabled={pending}
          aria-describedby="category_id-error"
          aria-invalid={Boolean(errors.category_id)}
          onChange={(event) => {
            setCategoryId(event.target.value);
            setErrors((current) => ({ ...current, category_id: undefined }));
          }}
          className="w-full rounded border border-zinc-400 px-3 py-2"
        >
          <option value="">すべて</option>
          {/* 通信失敗でも、送信前に選んでいたカテゴリーを失わないようにする（C-04） */}
          {categoryId !== "" &&
            !categories.some((entry) => String(entry.id) === categoryId) && (
              <option value={categoryId}>選択中のカテゴリー</option>
            )}
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <FieldError id="category_id-error" message={errors.category_id} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "検索中…" : "検索"}
      </button>
    </form>
  );
}
