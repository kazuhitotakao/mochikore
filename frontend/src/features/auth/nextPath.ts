/**
 * ログイン後の戻り先として使える、同じサイト内のパスだけを返す。
 * "//evil.example" や "/\evil.example" はブラウザが別サイトとして扱うので受け付けない。
 */
export function safeNextPath(
  value: string | string[] | null | undefined,
): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.startsWith("/api")) return null;
  if ([...value].some((char) => char === "\\" || char.charCodeAt(0) < 0x20)) {
    return null;
  }

  return value;
}
