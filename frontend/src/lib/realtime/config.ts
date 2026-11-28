import "server-only";
import type { RealtimeConfig } from "./types";

// Pusher のクラスター名（ap3 など）。つなぐ先のホスト名に入れるので、英小文字・数字・ハイフンだけを受け付ける
const PUSHER_CLUSTER = /^[a-z0-9-]+$/;

/**
 * 設定がそろっていなければ null を返し、画面はリアルタイムの表示なしで動く（読み直すと最新になる）。
 * D-119：公開先は Pusher のサービス（PUSHER_APP_KEY・PUSHER_APP_CLUSTER）、開発は compose の Reverb（REVERB_）。
 * どちらも同じ方式なので、つなぐ先だけを変える。
 */
export function realtimeConfig(): RealtimeConfig | null {
  const pusherKey = process.env.PUSHER_APP_KEY;
  const cluster = process.env.PUSHER_APP_CLUSTER;
  if (pusherKey && cluster && PUSHER_CLUSTER.test(cluster)) {
    return {
      key: pusherKey,
      host: `ws-${cluster}.pusher.com`,
      port: 443,
      tls: true,
    };
  }

  const key = process.env.REVERB_APP_KEY;
  const host = process.env.REVERB_PUBLIC_HOST;
  if (!key || !host) return null;

  const tls = process.env.REVERB_PUBLIC_SCHEME === "https";
  const port = Number(process.env.REVERB_PUBLIC_PORT) || (tls ? 443 : 80);

  return { key, host, port, tls };
}
