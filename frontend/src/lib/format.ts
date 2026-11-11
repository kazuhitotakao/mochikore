// D-89：APIの日時はUTCで届くので、表示するときに日本時間へ変換する
const DATE_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * 「2026/11/11」の形で日付だけを返す。
 */
export function formatDate(value: string): string {
  return DATE_FORMAT.format(new Date(value));
}
