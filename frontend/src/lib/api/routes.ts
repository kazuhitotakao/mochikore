type AllowedRoute = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  // Laravel の /api より後ろのパス（例：/^\/lists\/\d+$/）
  path: RegExp;
};

// テスト40：共通の窓口（/api/[...path]）から Laravel へ通してよいAPIだけを並べる。
// Laravel側でAPIを作るたびに、ここへ追加する。
// 会員登録・ログイン・ログアウト・本人情報・パスワードの保存（API-21）はトークンを扱うので、
// 専用の Route Handler にある
export const ALLOWED_ROUTES: readonly AllowedRoute[] = [
  // API-15。画面を開くときはServer Componentから読み取る
  { method: "GET", path: /^\/public\/lists$/ },
  // API-20：登録の有無にかかわらず、正しい入力なら204
  { method: "POST", path: /^\/forgot-password$/ },
  // API-23：リンクの値の正しさ（署名・期限・本人）は Laravel が確かめ、不正なら422 link_invalid を返す
  { method: "GET", path: /^\/email\/verify\/[^/]+\/[^/]+$/ },
  // API-24
  { method: "POST", path: /^\/email\/verification-notification$/ },
  // API-06。一覧（API-05）・内容（API-07）・カテゴリー（API-18）の読み取りは Server Component から送る
  { method: "POST", path: /^\/lists$/ },
  // API-08・09
  { method: "PATCH", path: /^\/lists\/\d+$/ },
  { method: "DELETE", path: /^\/lists\/\d+$/ },
  // API-14
  { method: "PATCH", path: /^\/lists\/\d+\/visibility$/ },
  // API-13
  { method: "POST", path: /^\/lists\/\d+\/reset-checks$/ },
  // API-10・11・12
  { method: "POST", path: /^\/lists\/\d+\/items$/ },
  // API-29・34
  { method: "GET", path: /^\/lists\/\d+\/grouping$/ },
  // API-30
  { method: "PUT", path: /^\/lists\/\d+\/grouping$/ },
  { method: "POST", path: /^\/lists\/\d+\/items\/bulk$/ },
  // API-19
  { method: "PATCH", path: /^\/lists\/\d+\/items\/order$/ },
  // API-36
  { method: "PATCH", path: /^\/lists\/\d+\/groups\/order$/ },
  // API-37
  { method: "PATCH", path: /^\/lists\/\d+\/items\/checks$/ },
  // API-38
  { method: "POST", path: /^\/lists\/\d+\/items\/bulk-delete$/ },
  { method: "PATCH", path: /^\/items\/\d+$/ },
  { method: "DELETE", path: /^\/items\/\d+$/ },
  // API-31・32・33。API-31 の category_id はクエリで送る（Laravel が確かめる）
  { method: "GET", path: /^\/saved-items$/ },
  { method: "POST", path: /^\/saved-items$/ },
  { method: "DELETE", path: /^\/saved-items\/\d+$/ },
  // API-39・40・41。API-39 の category_id はクエリで送る（Laravel が確かめる）
  { method: "GET", path: /^\/saved-groups$/ },
  { method: "POST", path: /^\/saved-groups$/ },
  { method: "DELETE", path: /^\/saved-groups\/\d+$/ },
  // API-25
  { method: "POST", path: /^\/items\/\d+\/restore$/ },
];

export function isAllowedRoute(method: string, path: string): boolean {
  return ALLOWED_ROUTES.some(
    (route) => route.method === method && route.path.test(path),
  );
}
