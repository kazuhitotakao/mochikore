"use client";

import { useEffect, useRef } from "react";
import { clientApi, setRealtimeSocketId } from "@/lib/api/client";
import type { RealtimeAuth } from "@/types/api";
import type { RealtimeConfig } from "./types";

// Laravel の ListChangeNotifier と同じ名前
const CHANGED_EVENT = "changed";

/**
 * F-35・D-119：共同編集のリストのチャンネルを聞き、「変わった」という合図が届いたら onSignal を呼ぶ。
 * 届くのは合図だけで、中身は呼び出し側が今までのAPIで読み直す。
 * つながったとき・つなぎ直したときも呼ぶ（切れていた間の変更を取りこぼさないため）。
 * config が null（設定なし）か enabled が false のときは、何もしない。
 */
export function useListChannel(
  config: RealtimeConfig | null,
  listId: number,
  enabled: boolean,
  onSignal: () => void,
): void {
  // 描画のたびに作り直される関数でも、つなぎ直さずに最新のものを呼ぶ
  const handler = useRef(onSignal);
  useEffect(() => {
    handler.current = onSignal;
  });

  // 画面を読み直すたびに config の入れ物は新しくなるので、中の値で比べて、つなぎ直しを避ける
  const key = config?.key;
  const host = config?.host;
  const port = config?.port;
  const tls = config?.tls;

  useEffect(() => {
    if (!key || !host || !port || !enabled) return;

    let disposed = false;
    let disconnect: (() => void) | null = null;

    // 共同編集のリストを開いたときだけ読み込み、ほかの画面の読み込みを重くしない
    void import("pusher-js").then(({ default: Pusher }) => {
      if (disposed) return;

      const pusher = new Pusher(key, {
        // Pusher のサービスではなく、自分たちの配信サーバーへつなぐ
        cluster: "",
        wsHost: host,
        wsPort: port,
        wssPort: port,
        forceTLS: tls === true,
        enabledTransports: ["ws", "wss"],
        enableStats: false,
        channelAuthorization: {
          transport: "ajax",
          endpoint: "/api/realtime/auth",
          // D-76：トークンをブラウザに渡さないので、認可は Next.js の窓口（API-63）を通す。
          // 自動の通信なのでログインの期限は延ばさない（D-36）
          customHandler: ({ socketId, channelName }, callback) => {
            clientApi<RealtimeAuth>("/realtime/auth", {
              method: "POST",
              body: { socket_id: socketId, channel_name: channelName },
              userActivity: false,
              mutates: false,
            }).then(
              (data) => callback(null, { auth: data.auth }),
              (error: unknown) =>
                callback(
                  error instanceof Error ? error : new Error("auth failed"),
                  null,
                ),
            );
          },
        },
      });

      pusher.connection.bind("connected", () => {
        setRealtimeSocketId(pusher.connection.socket_id);
      });
      pusher.connection.bind("disconnected", () => setRealtimeSocketId(null));

      const channel = pusher.subscribe(`private-lists.${listId}`);
      channel.bind(CHANGED_EVENT, () => handler.current());
      // 開いたとき・つなぎ直したとき：読み込みからつながるまでの間の変更を読む
      channel.bind("pusher:subscription_succeeded", () => handler.current());
      // 認可に失敗した（メンバーから外された・リストが消えたなど）ときも読み直し、画面側で扱う
      channel.bind("pusher:subscription_error", () => handler.current());

      disconnect = () => {
        setRealtimeSocketId(null);
        pusher.disconnect();
      };
    });

    return () => {
      disposed = true;
      disconnect?.();
    };
  }, [key, host, port, tls, listId, enabled]);
}
