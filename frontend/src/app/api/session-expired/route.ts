import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeNextPath } from "@/features/auth/nextPath";
import { deleteAuthToken, getAuthToken } from "@/lib/api/authCookie";
import { callLaravel } from "@/lib/api/forward";

/**
 * D-76：Server Component の読み取りで401になったときの移動先。
 * Server Component では Cookie を消せないので、ここで消してから SC-02 へ移動する。
 * 移動先はサイト内のパスで返す。request.url は開発サーバーの待ち受けアドレス（0.0.0.0:3000）になり、
 * ブラウザが開いているアドレスと違うため
 */
export async function GET(request: NextRequest) {
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const token = await getAuthToken();

  if (token) {
    const laravel = await callLaravel("GET", "/me", { token });

    // 別サイトのリンクから開かれても強制的にログアウトさせないよう、
    // Laravel でトークンが使えないと確かめたときだけ消す
    if (laravel?.ok) redirect(next ?? "/");
    if (laravel?.status === 401) await deleteAuthToken();
  }

  const query = new URLSearchParams({ expired: "1" });
  if (next) query.set("next", next);

  redirect(`/login?${query}`);
}
