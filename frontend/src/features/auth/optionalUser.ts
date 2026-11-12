import "server-only";
import { getAuthToken } from "@/lib/api/authCookie";
import { ApiError } from "@/lib/api/errors";
import { serverApi } from "@/lib/api/server";
import type { User } from "@/types/api";

export async function optionalUser(): Promise<User | null> {
  // D-80：Cookieがなければ本人情報を読まない。公開画面の401でもログイン画面へ移動しない
  if (!(await getAuthToken())) return null;

  try {
    return await serverApi<User>("/me", { userActivity: true });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
