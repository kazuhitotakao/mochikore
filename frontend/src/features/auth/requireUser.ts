import "server-only";
import { redirect } from "next/navigation";
import { getAuthToken } from "@/lib/api/authCookie";
import { ApiError } from "@/lib/api/errors";
import { serverApi } from "@/lib/api/server";
import type { User } from "@/types/api";

/**
 * ログインが必要な画面で、本人の情報（API-04）を読む。
 * Cookie がなければ Laravel へ送らず SC-02 へ移動する（D-80）。
 */
export async function requireUser(currentPath: string): Promise<User> {
  const next = encodeURIComponent(currentPath);

  if (!(await getAuthToken())) redirect(`/login?next=${next}`);

  let user: User | null = null;
  try {
    user = await serverApi<User>("/me", { userActivity: true });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
  }

  // D-76：Server Component では Cookie を消せないので、確かめてから消す窓口へ移動する。
  // redirect() は例外で移動するため、try の外で呼ぶ
  if (!user) redirect(`/api/session-expired?next=${next}`);

  return user;
}
