// 09_バリデーション V-04〜V-06・C-01・C-04（D-92）。Laravel の lang/ja/validation.php と同じ文言にする

import { trimLikeLaravel } from "@/features/auth/validation";

export const TITLE_MAX_LENGTH = 50;
export const DESCRIPTION_MAX_LENGTH = 500;
// D-50：1人100件まで
export const MAX_LISTS = 100;
// D-34：1リスト200件まで
export const MAX_ITEMS = 200;

// V-04：途中の改行・タブ。Laravel（NormalizesListText）と同じ文字
const LINE_BREAK_OR_TAB = /[\t\n\x0b\x0c\r\x85\u2028\u2029]/u;

/**
 * C-01：Laravel 標準の前後空白削除の後の文字数を、コードポイントで数える。
 */
export function titleLength(value: string): number {
  return [...trimLikeLaravel(value)].length;
}

/**
 * V-06：Laravel が保存する形。前後の空白を削り、途中の CRLF・CR を LF にそろえる。
 */
export function normalizeDescription(value: string): string {
  return trimLikeLaravel(value).replace(/\r\n?/g, "\n");
}

export function descriptionLength(value: string): number {
  return [...normalizeDescription(value)].length;
}

/**
 * V-04：必須→長さ→形式の順に、最初の違反だけを返す（C-04）。
 */
export function validateTitle(value: string): string | undefined {
  const title = trimLikeLaravel(value);

  if (title === "") return "リスト名を入力してください。";
  if ([...title].length > TITLE_MAX_LENGTH) {
    return "リスト名は50文字以内で入力してください。";
  }
  if (LINE_BREAK_OR_TAB.test(title)) {
    return "リスト名は改行せずに入力してください。";
  }

  return undefined;
}

/**
 * V-05：10種類から1つ選ぶ。
 */
export function validateCategory(value: number | null): string | undefined {
  return value === null ? "カテゴリーを選択してください。" : undefined;
}

/**
 * V-06：任意。空欄は Laravel が null にする。
 */
export function validateDescription(value: string): string | undefined {
  if (descriptionLength(value) > DESCRIPTION_MAX_LENGTH) {
    return "説明文は500文字以内で入力してください。";
  }

  return undefined;
}
