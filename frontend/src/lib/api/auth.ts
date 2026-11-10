import "server-only";
import type { NextRequest } from "next/server";
import type { AuthTokenResponse } from "@/types/api";
import { deleteAuthToken, getAuthToken, setAuthToken } from "./authCookie";
import {
  apiErrorResponse,
  callLaravel,
  laravelUnavailableResponse,
  rejectCrossOrigin,
  sendToLaravel,
  toBrowserResponse,
} from "./forward";

/**
 * 会員登録（API-01）とログイン（API-02）。
 * Laravel のトークンは Cookie にだけ保存し、ブラウザへは user だけ返す（D-72）。
 */
export async function issueToken(
  request: NextRequest,
  apiPath: "/register" | "/login",
): Promise<Response> {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;

  const laravel = await callLaravel("POST", apiPath, {
    body: await request.text(),
  });
  if (!laravel) return laravelUnavailableResponse();
  if (!laravel.ok) return toBrowserResponse(laravel);

  const { data } = (await laravel.json()) as AuthTokenResponse;
  await setAuthToken(data.token);

  return Response.json(
    { data: { user: data.user } },
    { status: laravel.status },
  );
}

/**
 * ログアウト（API-03）。Laravel のトークンを無効にしてから Cookie を消す。
 */
export async function revokeToken(request: NextRequest): Promise<Response> {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;

  const token = await getAuthToken();
  if (!token) return new Response(null, { status: 204 });

  const laravel = await callLaravel("POST", "/logout", { token });
  if (!laravel) return laravelUnavailableResponse();

  // 401はトークンがすでに使えない状態なので、ログアウトできたものとして扱う。
  // それ以外の失敗では Cookie を残し、トークンを確実に無効にできるまでやり直せるようにする
  if (laravel.status === 204 || laravel.status === 401) {
    await deleteAuthToken();
    return new Response(null, { status: 204 });
  }

  return toBrowserResponse(laravel);
}

/**
 * 本人情報（API-04）。
 */
export async function fetchMe(request: NextRequest): Promise<Response> {
  // D-80：Cookie がなければ Laravel へ送らず、ログイン前として扱う
  if (!(await getAuthToken())) {
    return apiErrorResponse(401, {
      message: "ログインしてください。",
      code: "unauthenticated",
    });
  }

  return sendToLaravel(request, "/me");
}
