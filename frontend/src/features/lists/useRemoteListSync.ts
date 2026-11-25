"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import {
  clientApi,
  mutationSnapshot,
  onMutationsSettled,
} from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { RealtimeConfig } from "@/lib/realtime/types";
import { useListChannel } from "@/lib/realtime/useListChannel";
import type { PackingListDetail } from "@/types/api";

// 通信に失敗したときに、もう一度読むまでの時間
const RETRY_DELAY_MS = 5000;

type Options = {
  listId: number;
  // 配信の接続先。設定がなければ null（リアルタイムの表示なしで動く）
  realtime: RealtimeConfig | null;
  // 共同編集のリスト（メンバーがいる・招待リンクがある・自分がメンバー）のときだけ動かす
  enabled: boolean;
  // ドラッグ中・並べ替えの保存中など、画面が途中の状態。終わるまで反映を待つ
  busy: boolean;
  onSynced: (list: PackingListDetail) => void;
};

/**
 * F-35・D-119：共同編集のリストの内容（SC-07）を、開いたまま最新にする。
 * ほかのメンバーの変更の合図・つなぎ直し・画面に戻ったときに API-07 を読み直し、onSynced へ渡す。
 * 自分の操作の送信中や、読んでいる間に自分の操作が挟まったときは、古い内容で上書きしないよう読み直す。
 */
export function useRemoteListSync({
  listId,
  realtime,
  enabled,
  busy,
  onSynced,
}: Options): void {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const needsSync = useRef(false);
  const syncing = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(busy);
  const onSyncedRef = useRef(onSynced);
  useEffect(() => {
    busyRef.current = busy;
    onSyncedRef.current = onSynced;
  });

  // 通信に失敗した後の読み直しを、少し待ってから始めるための印
  const [retryTick, setRetryTick] = useState(0);

  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      // 自分の操作の途中（busy・送信中）では読まない。終わったときにもう一度呼ばれる
      while (
        needsSync.current &&
        !busyRef.current &&
        mutationSnapshot().pending === 0
      ) {
        needsSync.current = false;
        const before = mutationSnapshot().finished;
        let latest: PackingListDetail;
        try {
          // 自動の通信なので、ログインの期限は延ばさない（D-36）
          latest = await clientApi<PackingListDetail>(`/lists/${listId}`, {
            userActivity: false,
          });
        } catch (failure) {
          if (redirectIfAuthError(failure)) return;
          if (failure instanceof ApiError && failure.status === 404) {
            // メンバーから外された・リストが削除された。読み直すと「ページが見つかりません」になる（D-43）
            router.refresh();
            return;
          }
          // 通信の失敗：画面はそのままにして、少し待ってから読み直す
          needsSync.current = true;
          if (retryTimer.current === null) {
            retryTimer.current = setTimeout(() => {
              retryTimer.current = null;
              setRetryTick((tick) => tick + 1);
            }, RETRY_DELAY_MS);
          }
          return;
        }

        const after = mutationSnapshot();
        if (busyRef.current || after.pending > 0 || after.finished !== before) {
          // 読んでいる間に自分の操作が挟まった。この内容は古いかもしれないので、捨てて読み直す
          needsSync.current = true;
        } else {
          onSyncedRef.current(latest);
        }
      }
    } finally {
      syncing.current = false;
    }
  }, [listId, router, redirectIfAuthError]);

  const requestSync = useCallback(() => {
    needsSync.current = true;
    void sync();
  }, [sync]);

  useListChannel(realtime, listId, enabled, requestSync);

  // 途中の状態（busy）が終わったら・失敗の後に少し待ったら、待たせていた読み直しを行う
  useEffect(() => {
    if (!busy) void sync();
  }, [busy, retryTick, sync]);

  useEffect(() => {
    if (!enabled) return;

    // 自分の操作の送信が終わったら、待たせていた読み直しを行う
    const stopListening = onMutationsSettled(() => void sync());
    // スマホで別のアプリから戻ったとき・電波が戻ったとき：配信を取りこぼしているかもしれないので読み直す
    const onVisible = () => {
      if (document.visibilityState === "visible") requestSync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", requestSync);

    return () => {
      stopListening();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", requestSync);
      if (retryTimer.current !== null) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };
  }, [enabled, requestSync, sync]);
}
