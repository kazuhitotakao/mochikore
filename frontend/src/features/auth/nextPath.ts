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

// D-119：共同編集の招待リンクの文字（32文字の英数字）
const INVITE_TOKEN = /^[A-Za-z0-9]{32}$/;

/**
 * 共同編集への招待（SC-19）のパス。形の違う値は null（そのまま画面のパスへ入れない）。
 */
export function invitePath(token: unknown): string | null {
  return typeof token === "string" && INVITE_TOKEN.test(token)
    ? `/invite/${token}`
    : null;
}

/**
 * D-121：ログイン（SC-02）のパスから、ログイン後の行き先が招待の画面（SC-19）のときの招待リンクの文字を取り出す。
 * 招待リンク → SC-02 → 新規会員登録（SC-03）と進んだ人の招待を、登録と一緒に覚えるのに使う。
 */
export function inviteTokenFromLoginPath(
  loginPath: string | null,
): string | null {
  if (!loginPath?.startsWith("/login?")) return null;

  const next = safeNextPath(
    new URLSearchParams(loginPath.slice("/login?".length)).get("next"),
  );
  const token = next?.startsWith("/invite/")
    ? next.slice("/invite/".length)
    : null;

  return invitePath(token) ? token : null;
}
