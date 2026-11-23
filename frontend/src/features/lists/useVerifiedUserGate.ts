"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

/**
 * SC-11・SC-18 で、ログインとメール認証が要る操作（自分用にコピー・選んで取り込む）を始める前に確かめる。
 * 未ログインは SC-02 へ（ログイン後はこの画面へ戻る）、未認証は SC-04 へ移り、false を返す（D-118）。
 */
export function useVerifiedUserGate(loggedIn: boolean, emailVerified: boolean) {
  const router = useRouter();

  return useCallback((): boolean => {
    if (!loggedIn) {
      const currentPath = window.location.pathname + window.location.search;
      router.push(`/login?${new URLSearchParams({ next: currentPath })}`);
      return false;
    }
    if (!emailVerified) {
      router.push("/verify-email");
      return false;
    }
    return true;
  }, [router, loggedIn, emailVerified]);
}
