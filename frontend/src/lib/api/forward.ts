import "server-only";
import type { NextRequest } from "next/server";
import type { ApiErrorBody } from "@/types/api";
import { deleteAuthToken, getAuthToken } from "./authCookie";
import { clientIpFrom } from "./clientIp";
import { isAllowedRoute } from "./routes";

const LARAVEL_TIMEOUT_MS = 10_000;
const UNSAFE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
const USER_ACTIVITY_HEADER = "X-User-Activity";
// D-41：Laravel の UseClientIpFromNextJs と同じヘッダー名
const CLIENT_IP_HEADER = "X-Mochikore-Client-Ip";
const PROXY_KEY_HEADER = "X-Mochikore-Proxy-Key";

type CallOptions = {
  token?: string;
  body?: string;
  search?: string;
  userActivity?: boolean;
  clientIp?: string;
};

/**
 * 共通の窓口（/api/[...path]）。D-76・開発規約3-5の1〜6を順に行う。
 */
export async function forwardToLaravel(
  request: NextRequest,
  path: string[],
): Promise<Response> {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;

  const apiPath = "/" + path.map(encodeURIComponent).join("/");
  if (!isAllowedRoute(request.method, apiPath)) {
    // テスト40：許可していないAPIは Laravel へ送らない
    return apiErrorResponse(404, {
      message: "ページが見つかりません。",
      code: "not_found",
    });
  }

  return sendToLaravel(request, apiPath);
}

/**
 * 1. Origin確認。更新系だけを見る。
 * Next.js の Server Actions と同じく、送信元の Origin とこのサイトの Host を比べる。
 */
export function rejectCrossOrigin(request: NextRequest): Response | null {
  if (!UNSAFE_METHODS.includes(request.method)) return null;

  const origin = request.headers.get("origin");
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  // ブラウザは更新系の送信に必ず Origin を付けるので、ないものも別サイトと同じに扱う
  if (origin && host && safeHost(origin) === host) return null;

  return apiErrorResponse(403, {
    message: "このサイト以外からの送信は受け付けていません。",
    code: "origin_not_allowed",
  });
}

/**
 * 3〜6。Cookie のトークンを付けて Laravel へ送り、応答をそのまま返す。
 */
export async function sendToLaravel(
  request: NextRequest,
  apiPath: string,
): Promise<Response> {
  const laravel = await callLaravel(request.method, apiPath, {
    token: await getAuthToken(),
    body: UNSAFE_METHODS.includes(request.method)
      ? await request.text()
      : undefined,
    search: request.nextUrl.search,
    userActivity: request.headers.get(USER_ACTIVITY_HEADER) === "1",
    clientIp: clientIpFrom(request.headers),
  });

  if (!laravel) return laravelUnavailableResponse();

  return toBrowserResponse(laravel);
}

/**
 * 5. 転送。ブラウザのヘッダーはそのまま渡さず、必要なものだけを付け直す。
 * Laravel につながらない・時間切れのときは null を返す。
 */
export async function callLaravel(
  method: string,
  apiPath: string,
  {
    token,
    body,
    search = "",
    userActivity = false,
    clientIp,
  }: CallOptions = {},
): Promise<Response | null> {
  const baseUrl = process.env.LARAVEL_API_BASE_URL;
  if (!baseUrl) {
    console.error("LARAVEL_API_BASE_URL が設定されていません");
    return null;
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  // 3. HttpOnly Cookie のトークンを、Laravel 用の Bearer へ移す
  if (token) headers.Authorization = `Bearer ${token}`;
  // 4. D-36：利用者の操作のときだけ印を付け、Laravel は印があるときだけ期限を延ばす
  if (userActivity) headers[USER_ACTIVITY_HEADER] = "1";
  if (body) headers["Content-Type"] = "application/json";
  // D-41：Laravel から見えるのは Next.js のIPなので、利用者のIPを合言葉付きで渡す
  const proxyKey = process.env.NEXTJS_PROXY_KEY;
  if (clientIp && proxyKey) {
    headers[CLIENT_IP_HEADER] = clientIp;
    headers[PROXY_KEY_HEADER] = proxyKey;
  }

  try {
    return await fetch(`${baseUrl}/api${apiPath}${search}`, {
      method,
      headers,
      body: body || undefined,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(LARAVEL_TIMEOUT_MS),
    });
  } catch (error) {
    // トークンや入力内容は残さず、どこへの通信が失敗したかだけを残す
    console.error(
      `Laravel へ接続できませんでした: ${method} ${apiPath}`,
      error instanceof Error ? error.name : error,
    );
    return null;
  }
}

/**
 * 6. 応答。401ならCookieを削除する。形は変えず、204は本文なしで返す（D-62）。
 */
export async function toBrowserResponse(laravel: Response): Promise<Response> {
  if (laravel.status === 401) await deleteAuthToken();

  if (laravel.status === 204) return new Response(null, { status: 204 });

  const headers = new Headers({
    "Content-Type": laravel.headers.get("content-type") ?? "application/json",
  });
  const retryAfter = laravel.headers.get("retry-after");
  if (retryAfter) headers.set("Retry-After", retryAfter);

  return new Response(await laravel.text(), {
    status: laravel.status,
    headers,
  });
}

export function apiErrorResponse(status: number, body: ApiErrorBody): Response {
  return Response.json(body, { status });
}

// D-76：Laravel につながらないときは、500と同じ共通の表示にする（02_画面配置 共通10）
export function laravelUnavailableResponse(): Response {
  return apiErrorResponse(502, {
    message: "通信に失敗しました。もう一度お試しください。",
    code: "server_error",
  });
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
