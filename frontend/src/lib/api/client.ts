import { ApiError, NETWORK_ERROR_MESSAGE, parseApiResponse } from "./errors";

type ClientApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  // D-36：利用者の操作による通信だけ期限を延ばす。自動の通信では false にする
  userActivity?: boolean;
  // データを変える通信か。省略すると GET 以外は変える通信として数える。
  // データを変えない POST（共同編集のチャンネルの認可、API-63）だけ false にする
  mutates?: boolean;
};

// D-119・F-35：共同編集では、ほかのメンバーの変更が届くたびにリストを読み直す。
// 送信中の自分の操作の結果を、その前に読んだ古い内容で上書きしないよう、データを変える通信の数を数えておく
let pendingMutations = 0;
let finishedMutations = 0;
const settledListeners = new Set<() => void>();
// pusher-js の接続の番号。データを変える通信に添えると、Laravel が自分の画面を配信先から外す
let realtimeSocketId: string | null = null;

export function setRealtimeSocketId(socketId: string | null): void {
  realtimeSocketId = socketId;
}

/**
 * 送信中の数と、終わった数。読み直しの前後で比べ、間に自分の操作が挟まっていないかを確かめるのに使う。
 */
export function mutationSnapshot(): { pending: number; finished: number } {
  return { pending: pendingMutations, finished: finishedMutations };
}

/**
 * データを変える通信がすべて終わったときに呼ぶ。戻り値を呼ぶと登録を外す。
 */
export function onMutationsSettled(listener: () => void): () => void {
  settledListeners.add(listener);
  return () => {
    settledListeners.delete(listener);
  };
}

/**
 * Client Component から同じサイトの Route Handler（/api/...）を呼ぶ。
 */
export async function clientApi<T>(
  path: string,
  {
    method = "GET",
    body,
    userActivity = true,
    mutates = method !== "GET",
  }: ClientApiOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (userActivity) headers["X-User-Activity"] = "1";
  if (mutates && realtimeSocketId) headers["X-Socket-ID"] = realtimeSocketId;

  if (mutates) pendingMutations += 1;
  try {
    let res: Response;
    try {
      res = await fetch(`/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
    } catch {
      throw new ApiError(0, "server_error", NETWORK_ERROR_MESSAGE);
    }

    return await parseApiResponse<T>(res);
  } finally {
    if (mutates) {
      pendingMutations -= 1;
      finishedMutations += 1;
      if (pendingMutations === 0) {
        // 呼び出し元が応答を画面へ反映した後に知らせる（先に知らせると、反映の前の内容で読み直しを始めてしまう）
        setTimeout(() => {
          if (pendingMutations === 0) {
            settledListeners.forEach((listener) => listener());
          }
        }, 0);
      }
    }
  }
}
