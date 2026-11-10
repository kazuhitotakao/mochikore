import "server-only";

/**
 * D-41：回数制限に使う利用者のIP。Laravel は合言葉付きで渡されたときだけこの値を使う。
 * Vercel では、Vercel が計算して付ける x-real-ip を使う（Vercel は利用者が付けた
 * X-Forwarded-For を上書きする）。ローカルでは、Next.js が接続元を入れる x-forwarded-for を使う。
 * ローカルは自分しか使わないので、利用者が付けた値で回数制限を避けられる心配はない。
 */
export function clientIpFrom(headers: Headers): string | undefined {
  if (process.env.VERCEL === "1") {
    return headers.get("x-real-ip")?.trim() || undefined;
  }

  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
}
