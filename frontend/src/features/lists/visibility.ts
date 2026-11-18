import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";

// D-42：リスト編集（SC-06）とリストの内容（SC-07）の公開のスイッチで、同じ公開範囲を確認する
export const PUBLISH_MESSAGE =
  "このリストを公開しますか？ログインしていない人を含め、誰でも見られるようになります。リスト名、説明文、カテゴリー、グループ名、持ち物が公開されます。";

// 共通4：切り替えが保存できたときの通知。SC-06 と SC-07 で同じ文言
export function visibilityChangedNotice(isPublic: boolean): string {
  return isPublic ? "リストを公開しました。" : "リストを非公開にしました。";
}

export function visibilityErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return NETWORK_ERROR_MESSAGE;

  switch (error.code) {
    case "list_has_no_items":
      return "公開するには持ち物が1件以上必要です。";
    case "list_moderated":
      return "このリストは運営により非公開になっています。";
    case "validation_error":
      return error.errors.is_public?.[0] ?? error.message;
    default:
      return NETWORK_ERROR_MESSAGE;
  }
}
