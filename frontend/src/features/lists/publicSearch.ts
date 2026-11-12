import { trimLikeLaravel } from "@/features/auth/validation";

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
