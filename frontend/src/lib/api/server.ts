import "server-only";
import { getAuthToken } from "./authCookie";
import { ApiError, NETWORK_ERROR_MESSAGE, parseApiResponse } from "./errors";
import { callLaravel } from "./forward";

/**
 * Server Component の読み取り。D-76の例外として、Route Handler を通さず Laravel へ送る。
 * 画面を開くときは userActivity: true にする。先読み・自動の読み込みでは付けない（D-36）。
 */
export async function serverApi<T>(
  path: string,
  {
    userActivity = false,
    includePagination = false,
  }: { userActivity?: boolean; includePagination?: boolean } = {},
): Promise<T> {
  const laravel = await callLaravel("GET", path, {
    token: await getAuthToken(),
    userActivity,
  });
  if (!laravel) throw new ApiError(502, "server_error", NETWORK_ERROR_MESSAGE);

  return parseApiResponse<T>(laravel, { includePagination });
}
