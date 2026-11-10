"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { ApiError } from "@/lib/api/errors";
import { expiredLoginPath } from "./nextPath";

/**
 * 画面の操作（Client Component の通信）で、ログインし直しやメール認証が必要と分かったときの移動。
 * - 401：SC-02 へ移り、期限切れを伝える。ログイン後は元の画面へ戻る。自動では送り直さない（共通7）
 * - 403 email_not_verified：SC-04 へ移る（共通8）
 * 移動したら true を返すので、呼び出し側はそれ以外のエラーだけを画面に出す。
 * 読み込み（Server Component）の401は requireUser が /api/session-expired で扱う（D-76）。
 */
export function useAuthErrorRedirect() {
  const router = useRouter();

  // useEffect の中でも使えるよう、描画のたびに作り直さない
  return useCallback(
    (
      error: unknown,
      // 戻り先。省略すると今の画面（パスとクエリ）に戻る
      currentPath?: string,
    ): boolean => {
      if (!(error instanceof ApiError)) return false;

      if (error.status === 401) {
        router.replace(
          expiredLoginPath(
            currentPath ?? window.location.pathname + window.location.search,
          ),
        );
        return true;
      }

      if (error.code === "email_not_verified") {
        router.replace("/verify-email");
        return true;
      }

      return false;
    },
    [router],
  );
}
