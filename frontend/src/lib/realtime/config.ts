import "server-only";
import type { RealtimeConfig } from "./types";

/**
 * 設定がそろっていなければ null を返し、画面はリアルタイムの表示なしで動く（読み直すと最新になる）。
 */
export function realtimeConfig(): RealtimeConfig | null {
  const key = process.env.REVERB_APP_KEY;
  const host = process.env.REVERB_PUBLIC_HOST;
  if (!key || !host) return null;

  const tls = process.env.REVERB_PUBLIC_SCHEME === "https";
  const port = Number(process.env.REVERB_PUBLIC_PORT) || (tls ? 443 : 80);

  return { key, host, port, tls };
}
