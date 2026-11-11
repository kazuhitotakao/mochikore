import "server-only";
import { notFound, redirect } from "next/navigation";
import { getAuthToken } from "@/lib/api/authCookie";
import { ApiError } from "@/lib/api/errors";
import { serverApi } from "@/lib/api/server";
import type { User } from "@/types/api";

/**
 * ログインが必要な画面で、本人の情報（API-04）を読む。
 * Cookie がなければ Laravel へ送らず SC-02 へ移動する（D-80）。
 */
export async function requireUser(currentPath: string): Promise<User> {
  return readAsUser<User>("/me", currentPath);
}

/**
 * ログインが必要な画面の読み込み。画面を開く操作なので期限を延ばす（D-36）。
 * - Cookie がない：Laravel へ送らず SC-02 へ（D-80）
 * - 401：Server Component では Cookie を消せないので、確かめてから消す窓口へ（D-76）
 * - 403 email_not_verified：SC-04 へ（02_画面配置 共通8）
 * - 404：「ページが見つかりません」（共通9、D-43）
 * それ以外のエラーは error.tsx の共通の表示にする（共通10）。
 */
export async function readAsUser<T>(
  apiPath: string,
  currentPath: string,
): Promise<T> {
  const next = encodeURIComponent(currentPath);

  if (!(await getAuthToken())) redirect(`/login?next=${next}`);

  let failure: ApiError;
  try {
    return await serverApi<T>(apiPath, { userActivity: true });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    failure = error;
  }

  // redirect()・notFound() は例外で移動するため、try の外で呼ぶ
  if (failure.status === 401) redirect(`/api/session-expired?next=${next}`);
  if (failure.code === "email_not_verified") redirect("/verify-email");
  if (failure.status === 404) notFound();

  throw failure;
}
