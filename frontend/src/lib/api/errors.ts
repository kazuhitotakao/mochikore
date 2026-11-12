import type { ApiErrorBody, ApiErrorCode } from "@/types/api";

// 02_画面配置 共通10：通信失敗と500のときの共通の文言。
// Next.js の窓口が返す 502（Laravel へつながらない）と 403 origin_not_allowed も同じ文言にする（D-76）。
// 普段の操作では起きず、起きても利用者には直せないため
export const NETWORK_ERROR_MESSAGE =
  "通信に失敗しました。もう一度お試しください。";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly errors: Record<string, string[]>;
  readonly retryAfter: number | undefined;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    errors: Record<string, string[]> = {},
    retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors;
    this.retryAfter = retryAfter;
  }
}

/**
 * 成功なら data を返し、失敗なら ApiError を投げる。画面は code で判定する（D-53）。
 */
export async function parseApiResponse<T>(
  res: Response,
  { includePagination = false }: { includePagination?: boolean } = {},
): Promise<T> {
  // D-62：204は本文がないので JSON を読まない
  if (res.status === 204) return undefined as T;

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(res.status, "server_error", NETWORK_ERROR_MESSAGE);
  }

  if (!res.ok) {
    const error = body as Partial<ApiErrorBody>;
    throw new ApiError(
      res.status,
      error.code ?? "server_error",
      error.message ?? NETWORK_ERROR_MESSAGE,
      error.errors,
      error.retry_after,
    );
  }

  // D-53：ページ分割するAPI-15ではdataだけにせず、metaとlinksもそのまま読む
  return includePagination ? (body as T) : (body as { data: T }).data;
}
