import "server-only";
import { cookies } from "next/headers";

export const AUTH_COOKIE = "mochikore_token";

// D-78：トークンを更新しない（D-74）ので、180日にすると使い続けている人のCookieが先に切れる。
// ログインから1年（トークンの最長期限）に合わせる
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export async function getAuthToken(): Promise<string | undefined> {
  return (await cookies()).get(AUTH_COOKIE)?.value;
}

export async function setAuthToken(token: string): Promise<void> {
  (await cookies()).set(AUTH_COOKIE, token, {
    // 画面のJavaScriptからトークンを読めないようにする
    httpOnly: true,
    // ローカルの開発はHTTPなので、本番（HTTPS）だけ有効にする
    secure: process.env.NODE_ENV === "production",
    // Strictだとメールのリンクから開いたときにCookieが送られず、確認リンク（API-23）で困る。
    // 別サイトからの更新系の送信は、Lax と Origin 確認で防ぐ
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  });
}

export async function deleteAuthToken(): Promise<void> {
  (await cookies()).delete(AUTH_COOKIE);
}
