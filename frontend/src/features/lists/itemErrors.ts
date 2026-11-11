import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";

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
      return NETWORK_ERROR_MESSAGE;
  }
}

/**
 * 404：ほかの画面で持ち物やリストが消えていた。読み直すと、リストがあれば最新の内容、
 * なければ「ページが見つかりません」（共通9）になる。
 */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
