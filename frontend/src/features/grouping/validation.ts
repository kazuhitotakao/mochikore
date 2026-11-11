// 09_バリデーション V-14・D-57。Laravel の lang/ja/validation.php（groups.*.name）と同じ文言にする

import { trimLikeLaravel } from "@/features/auth/validation";
import { validateName } from "@/features/lists/validation";

// D-57：1リスト0〜20グループ
export const MAX_GROUPS = 20;
export const GROUP_NAME_MAX_LENGTH = 50;
// D-57：グループ名に使えない予約名
export const RESERVED_GROUP_NAME = "未分類";

/**
 * V-14：前後の空白を削った後で1〜50文字、途中の改行・タブはだめ。予約名と、同じリストの中の同名もだめ。
 * 同名は空白を削った後の完全一致で比べる。大文字・小文字や表記の違いはまとめない（D-57）。
 */
export function validateGroupName(
  value: string,
  otherNames: readonly string[],
): string | undefined {
  const basic = validateName(value, "グループ名", GROUP_NAME_MAX_LENGTH);
  if (basic) return basic;

  const name = trimLikeLaravel(value);
  if (name === RESERVED_GROUP_NAME) return "このグループ名は使用できません。";
  if (otherNames.includes(name)) return "同じ名前のグループがあります。";

  return undefined;
}
