import { trimLikeLaravel } from "@/features/auth/validation";
import { safeNextPath } from "@/features/auth/nextPath";

export const PUBLIC_LISTS_PATH = "/public/lists";
export const KEYWORD_MAX_LENGTH = 50;

export type PublicListSearchParams = Record<
  string,
  string | string[] | undefined
>;

export function publicListQuery(
  params: PublicListSearchParams,
): URLSearchParams {
  const query = new URLSearchParams();
  // D-81：配列のキーや空の値も加工せずに渡し、Laravelで422の判定をする
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value))
      value.forEach((entry) => query.append(key, entry));
    else if (value !== undefined) query.append(key, value);
  }
  return query;
}

export function publicListHref(query: URLSearchParams, page = 1): string {
  const next = new URLSearchParams(query);
  next.delete("page");
  if (next.getAll("keyword").every((value) => trimLikeLaravel(value) === "")) {
    next.delete("keyword");
  }
  if (page > 1) next.set("page", String(page));
  const search = next.toString();
  return PUBLIC_LISTS_PATH + (search ? `?${search}` : "");
}

export function validateKeyword(value: string): string | undefined {
  return [...trimLikeLaravel(value)].length > KEYWORD_MAX_LENGTH
    ? "キーワードは50文字以内で入力してください。"
    : undefined;
}

export function publicListDetailHref(
  id: number,
  query: URLSearchParams,
): string {
  // D-81：詳細から戻るときも、検索条件・ページを変えずに一覧へ戻す
  const from = PUBLIC_LISTS_PATH + (query.size ? `?${query}` : "");
  return `${PUBLIC_LISTS_PATH}/${id}?${new URLSearchParams({ from })}`;
}

export function publicListBackHref(
  from: string | string[] | undefined,
): string {
  const path = safeNextPath(from);
  return path === PUBLIC_LISTS_PATH || path?.startsWith(`${PUBLIC_LISTS_PATH}?`)
    ? path
    : PUBLIC_LISTS_PATH;
}

// D-117：公開リスト一覧の並び順。新しい順（D-23）は省略の値なので、URLに付けない（D-81）
export const PUBLIC_LIST_SORTS = {
  newest: "新しい順",
  most_copied: "よくコピーされている順",
} as const;

export type PublicListSort = keyof typeof PUBLIC_LIST_SORTS;

/**
 * URLの sort から今の並び順を読む。Laravel が422にする値（配列・定義外）は null にし、どちらも選ばない。
 */
export function currentPublicListSort(
  value: string | string[] | undefined,
): PublicListSort | null {
  if (value === undefined) return "newest";
  if (Array.isArray(value)) return null;
  const sort = trimLikeLaravel(value);
  return sort === "newest" || sort === "most_copied" ? sort : null;
}

/**
 * 検索した条件はそのままで並び順だけを変え、1ページ目に戻す（D-117）。
 */
export function publicListSortHref(
  query: URLSearchParams,
  sort: PublicListSort,
): string {
  const next = new URLSearchParams(query);
  next.delete("sort");
  if (sort !== "newest") next.set("sort", sort);
  return publicListHref(next);
}
