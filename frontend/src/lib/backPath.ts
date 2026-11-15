// 02_画面配置 共通2：「←」で開いた元の画面へ戻るため、元の画面のパスを from で受け渡す（利用者の指示）。
// from は画面ごとに決めた元の画面だけを受け付け、別サイトや想定外の画面へは戻さない。

/** 移動先のURLに、元の画面のパスを from で付ける */
export function withFrom(href: string, from: string): string {
  const [path, query] = href.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("from", from);
  return `${path}?${params}`;
}

/**
 * from が、その画面へのリンクを置いた画面（allowed）のパスなら、クエリを含めてそのまま返す。
 * 一覧にないときは null を返し、呼び出し側で画面ごとの既定の戻り先にする。
 */
export function fromPath(
  value: string | string[] | undefined,
  allowed: readonly string[],
): string | null {
  if (typeof value !== "string") return null;

  return allowed.some((path) => value === path || value.startsWith(`${path}?`))
    ? value
    : null;
}

/** 戻り先を持ったまま、同じ画面を開き直すためのパス（ログインし直した後・次の画面からの戻り先） */
export function pathWithFrom(path: string, from: string | null): string {
  return from ? withFrom(path, from) : path;
}
