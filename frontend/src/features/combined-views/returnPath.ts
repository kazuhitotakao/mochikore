import { SHOW_CHECKED_PARAM } from "@/features/lists/showChecked";

// D-124：まとめ表示（SC-20）のリスト名から開いた自分のリストの内容（SC-07）は、「←」でまとめ表示へ戻る。
// 開いた元は画面の中の状態なので、行き来のURLで渡す（D-94・D-120 と同じ）。
// SC-07 からリスト編集（SC-06）・グループ整理（SC-09）へ進んで戻ったときも引き継ぐ
const FROM_PARAM = "from";
const FROM_PREFIX = "combined-";
const FROM_PATTERN = /^combined-([1-9][0-9]*)$/;

export function combinedViewPath(viewId: number): string {
  return `/combined/${viewId}`;
}

/**
 * URL の from から、開いた元のまとめ表示のIDを取り出す。形が違えば null（ふつうの戻り先にする）。
 */
export function combinedViewIdFrom(
  value: string | string[] | undefined,
): number | null {
  if (typeof value !== "string") return null;
  const match = FROM_PATTERN.exec(value);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
}

export function combinedViewIdOf(
  searchParams: Record<string, string | string[] | undefined>,
): number | null {
  return combinedViewIdFrom(searchParams[FROM_PARAM]);
}

/**
 * SC-07・SC-06・SC-09 の行き来に使う URL。チェック済みの表示（D-94）と、開いた元のまとめ表示（D-124）を添える。
 */
export function listPagePath(
  path: string,
  {
    showChecked = false,
    combinedViewId = null,
  }: { showChecked?: boolean; combinedViewId?: number | null },
): string {
  const params = new URLSearchParams();
  if (showChecked) params.set(SHOW_CHECKED_PARAM, "1");
  if (combinedViewId !== null)
    params.set(FROM_PARAM, `${FROM_PREFIX}${combinedViewId}`);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
