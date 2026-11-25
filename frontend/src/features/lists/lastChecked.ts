// D-122：繰り返し利用の持ち物の行に出す「前回 11/23・2日前」。日付は日本時間で数える（D-89）

const TOKYO_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

type DayParts = { year: number; month: number; day: number };

function tokyoDay(date: Date): DayParts {
  const parts = TOKYO_PARTS.formatToParts(date);
  const pick = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

/**
 * 日本時間の今日を「2026-11-25」の形で返す。日付が変わったかを比べるのに使う。
 */
export function tokyoDayKey(date: Date): string {
  const { year, month, day } = tokyoDay(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * 次に日本時間の日付が変わるまでのミリ秒。日本は夏時間がないので、UTC+9 の0時までを数える。
 */
export function msUntilNextTokyoDay(now: Date): number {
  const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;
  return DAY_MS - ((now.getTime() + TOKYO_OFFSET_MS) % DAY_MS);
}

// 行に出す前回の日付。幅の狭いスマホでは date と ago を2行に分け、広い画面では「・」でつないで1行にする
export type LastChecked = { date: string; ago: string | null };

/**
 * 「前回 今日」、または「前回 11/23」と「2日前」。今年でなければ年も出す。チェックしたことがなければ null。
 */
export function lastChecked(
  lastCheckedAt: string | null,
  // 日本時間の今日（tokyoDayKey の形）
  todayKey: string,
): LastChecked | null {
  if (lastCheckedAt === null) return null;

  const checked = tokyoDay(new Date(lastCheckedAt));
  const [year, month, day] = todayKey.split("-").map(Number);
  const days = Math.round(
    (Date.UTC(year, month - 1, day) -
      Date.UTC(checked.year, checked.month - 1, checked.day)) /
      86_400_000,
  );
  // 端末の時計がずれていて先の日付になったときも、今日として出す
  if (days <= 0) return { date: "前回 今日", ago: null };

  const date =
    checked.year === year
      ? `${checked.month}/${checked.day}`
      : `${checked.year}/${checked.month}/${checked.day}`;
  return { date: `前回 ${date}`, ago: `${days}日前` };
}
