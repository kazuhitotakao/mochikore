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

/**
 * 02_画面配置 共通7：ログインの期限が切れたときの SC-02。ログイン後は元の画面へ戻る。
 * 元の画面が同じサイト内の安全なパスでなければ、戻り先を付けない。
 */
export function expiredLoginPath(currentPath: string): string {
  const query = new URLSearchParams({ expired: "1" });
  const next = safeNextPath(currentPath);
  if (next) query.set("next", next);

  return `/login?${query}`;
}
