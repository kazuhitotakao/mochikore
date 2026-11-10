type AllowedRoute = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  // Laravel の /api より後ろのパス（例：/^\/lists\/\d+$/）
  path: RegExp;
};

// テスト40：共通の窓口（/api/[...path]）から Laravel へ通してよいAPIだけを並べる。
// Laravel側でAPIを作るたびに、ここへ追加する。
// 会員登録・ログイン・ログアウト・本人情報はトークンを扱うので、専用の Route Handler にある
export const ALLOWED_ROUTES: readonly AllowedRoute[] = [];

export function isAllowedRoute(method: string, path: string): boolean {
  return ALLOWED_ROUTES.some(
    (route) => route.method === method && route.path.test(path),
  );
}
