import { ApiError, NETWORK_ERROR_MESSAGE, parseApiResponse } from "./errors";

type ClientApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  // D-36：利用者の操作による通信だけ期限を延ばす。自動の通信では false にする
  userActivity?: boolean;
};

/**
 * Client Component から同じサイトの Route Handler（/api/...）を呼ぶ。
 */
export async function clientApi<T>(
  path: string,
  { method = "GET", body, userActivity = true }: ClientApiOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (userActivity) headers["X-User-Activity"] = "1";

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "server_error", NETWORK_ERROR_MESSAGE);
  }

  return parseApiResponse<T>(res);
}
