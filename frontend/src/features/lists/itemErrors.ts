import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";

// D-97：1つのリストの安全上限に届いたとき（追加・まとめて追加・戻す・コピー）
export const ITEM_LIMIT_MESSAGE =
  "1つのリストに入れられる持ち物は2,000件までです。";

/**
 * D-97：1時間に増やせる持ち物の数を超えたときの文言。待つ時間は1時間近くになることがあるので、
 * 1分以上は分（切り上げ）で、1分未満は秒で伝える。
 */
export function itemAdditionWaitMessage(
  retryAfter: number | undefined,
): string {
  const seconds = Math.max(1, retryAfter ?? 60);
  const wait = seconds < 60 ? `${seconds}秒` : `${Math.ceil(seconds / 60)}分`;
  return `短い時間に追加できる数を超えました。あと${wait}で再度お試しいただけます。`;
}

/**
 * 持ち物を増やす操作（追加・まとめて追加・戻す）の安全上限と回数制限の文言（D-97）。どちらでもなければ null。
 */
export function itemAdditionLimitMessage(error: ApiError): string | null {
  switch (error.code) {
    case "item_limit_reached":
      return ITEM_LIMIT_MESSAGE;
    case "too_many_requests":
      return itemAdditionWaitMessage(error.retryAfter);
    default:
      return null;
  }
}

/**
 * 持ち物の操作が失敗したときの文言。画面は code で決める（D-53）。
 * 401・403 email_not_verified・404 は、呼び出し側で画面を移動・読み直しする。
 */
export function itemErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return NETWORK_ERROR_MESSAGE;

  switch (error.code) {
    case "validation_error":
      return error.errors.name?.[0] ?? error.message;
    default:
      return itemAdditionLimitMessage(error) ?? NETWORK_ERROR_MESSAGE;
  }
}

// V-20：ほかの画面で持ち物やグループが変わった場合は、どの一括削除からでも読み直しを案内する。
export function bulkDeleteErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === "validation_error") {
    return "削除する持ち物の情報が正しくありません。リストを読み直してください。";
  }

  return NETWORK_ERROR_MESSAGE;
}

/**
 * 404：ほかの画面で持ち物やリストが消えていた。読み直すと、リストがあれば最新の内容、
 * なければ「ページが見つかりません」（共通9）になる。
 */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
