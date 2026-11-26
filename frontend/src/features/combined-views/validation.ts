// 09_バリデーション V-31・C-01・C-04（D-124）。Laravel の lang/ja/validation.php の combined_view と同じ文言にする

import { validateName } from "@/features/lists/validation";

export const COMBINED_VIEW_NAME_MAX_LENGTH = 50;
// D-124：1つのまとめ表示に2〜5リスト、1人10件まで
export const MIN_COMBINED_LISTS = 2;
export const MAX_COMBINED_LISTS = 5;
export const MAX_COMBINED_VIEWS = 10;

export const COMBINED_VIEW_LIMIT_MESSAGE = "まとめ表示は10件までです。";
export const COMBINED_LISTS_INVALID_MESSAGE =
  "選んだリストの情報が正しくありません。読み直してください。";

export function validateCombinedViewName(value: string): string | undefined {
  return validateName(value, "まとめ表示の名前", COMBINED_VIEW_NAME_MAX_LENGTH);
}

export function validateCombinedLists(
  listIds: readonly number[],
): string | undefined {
  if (listIds.length < MIN_COMBINED_LISTS)
    return "まとめて表示するリストを2件以上選んでください。";
  if (listIds.length > MAX_COMBINED_LISTS)
    return "まとめて表示できるリストは5件までです。";
  return undefined;
}

/**
 * D-124：名前の初期値。選んだリスト名を「・」でつなぎ、50文字を超えるときは末尾を削る（C-01：コードポイントで数える）。
 */
export function defaultCombinedViewName(titles: readonly string[]): string {
  return [...titles.join("・")]
    .slice(0, COMBINED_VIEW_NAME_MAX_LENGTH)
    .join("");
}
