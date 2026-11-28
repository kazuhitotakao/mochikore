"use client";

import { useEffect, useRef } from "react";
import type Pusher from "pusher-js";
import type { Channel } from "pusher-js";
import { clientApi, setRealtimeSocketId } from "@/lib/api/client";
import type { RealtimeAuth } from "@/types/api";
import type { RealtimeConfig } from "./types";

// Laravel の ListChangeNotifier と同じ名前
const CHANGED_EVENT = "changed";

type ListChannel = {
  channel: Channel;
  handlers: Set<() => void>;
};

// 画面に1本だけ持つ接続（D-124）。まとめ表示（SC-20）で複数のリストを聞いても接続は増やさず、
// 自分の操作に添える接続の番号（X-Socket-ID）も1つにそろえる。リストごとに接続を作ると、
// 番号が上書きされて自分の操作の合図が自分に届き、余計な読み直しが起きるため
type SharedConnection = {
  key: string;
  pusher: Pusher;
  channels: Map<number, ListChannel>;
};

let shared: SharedConnection | null = null;
// 接続を作っている途中（pusher-js の読み込み中）に、続けて頼まれたときも1本にする
let connecting: { key: string; promise: Promise<SharedConnection> } | null =
  null;
// 聞こうとしている画面の部品の数。読み込み中のものも数え、0になったときだけ接続を閉じる
// （開発時に部品が一度外れてすぐ戻るときも、作りかけの接続を閉じないため）
let users = 0;

function closeIfUnused(): void {
  if (users > 0 || !shared) return;
  const connection = shared;
  shared = null;
  setRealtimeSocketId(null);
  connection.pusher.disconnect();
}

function configKey(config: RealtimeConfig): string {
  return `${config.key}|${config.host}|${config.port}|${config.tls}`;
}

async function connect(config: RealtimeConfig): Promise<SharedConnection> {
  const key = configKey(config);
  if (shared?.key === key) return shared;
  if (connecting?.key === key) return connecting.promise;

  const promise = import("pusher-js").then(({ default: PusherClass }) => {
    const pusher = new PusherClass(config.key, {
      // つなぐ先は config.ts が決めたホストにする（開発は Reverb、公開先は Pusher のサービス、D-119）
      cluster: "",
      wsHost: config.host,
      wsPort: config.port,
      wssPort: config.port,
      forceTLS: config.tls === true,
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

    const connection: SharedConnection = { key, pusher, channels: new Map() };
    shared = connection;
    return connection;
  });
  connecting = { key, promise };
  try {
    return await promise;
  } finally {
    if (connecting?.promise === promise) connecting = null;
  }
}

function subscribe(
  connection: SharedConnection,
  listId: number,
  handler: () => void,
): void {
  const existing = connection.channels.get(listId);
  if (existing) {
    existing.handlers.add(handler);
    // すでに聞いているチャンネルでも、聞き始めたときと同じく一度読み直す
    if (existing.channel.subscribed) handler();
    return;
  }

  const handlers = new Set([handler]);
  const notifyAll = () => {
    for (const notify of handlers) notify();
  };
  const channel = connection.pusher.subscribe(`private-lists.${listId}`);
  channel.bind(CHANGED_EVENT, notifyAll);
  // 開いたとき・つなぎ直したとき：読み込みからつながるまでの間の変更を読む
  channel.bind("pusher:subscription_succeeded", notifyAll);
  // 認可に失敗した（メンバーから外された・リストが消えたなど）ときも読み直し、画面側で扱う
  channel.bind("pusher:subscription_error", notifyAll);
  connection.channels.set(listId, { channel, handlers });
}

function unsubscribe(
  connection: SharedConnection,
  listId: number,
  handler: () => void,
): void {
  const listChannel = connection.channels.get(listId);
  if (!listChannel) return;
  listChannel.handlers.delete(handler);
  if (listChannel.handlers.size > 0) return;

  listChannel.channel.unbind_all();
  connection.pusher.unsubscribe(`private-lists.${listId}`);
  connection.channels.delete(listId);
}

/**
 * F-35・D-119：共同編集のリストのチャンネルを聞き、「変わった」という合図が届いたら onSignal を呼ぶ。
 * 届くのは合図だけで、中身は呼び出し側が今までのAPIで読み直す。
 * つながったとき・つなぎ直したときも呼ぶ（切れていた間の変更を取りこぼさないため）。
 * config が null（設定なし）か enabled が false のときは、何もしない。
 * 接続は画面に1本で、同じ画面の複数のリスト（まとめ表示、D-124）はチャンネルを分けて聞く。
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
    let subscribed: SharedConnection | null = null;
    const notify = () => handler.current();
    users += 1;

    void connect({ key, host, port, tls: tls === true }).then((connection) => {
      // 読み込みの間に画面を離れた。ほかに聞く部品がなければ、作った接続を閉じる
      if (disposed) {
        closeIfUnused();
        return;
      }
      subscribe(connection, listId, notify);
      subscribed = connection;
    });

    return () => {
      disposed = true;
      users -= 1;
      if (subscribed) unsubscribe(subscribed, listId, notify);
      closeIfUnused();
    };
  }, [key, host, port, tls, listId, enabled]);
}
