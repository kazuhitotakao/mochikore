import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { readAsUser } from "@/features/auth/requireUser";
import { ListMenu } from "@/features/lists/ListMenu";
import { MAX_ITEMS } from "@/features/lists/validation";
import type { PackingListDetail } from "@/types/api";

// SC-07 自分のリストの内容（通常画面）。今は見出し・説明文・持ち物の名前だけを表示する。
// 持ち物の追加・チェック・並べ替えなどは、手順書第13章の順番2〜6で足す
export default async function ListPage(props: PageProps<"/lists/[listId]">) {
  const { listId } = await props.params;

  // URLの値をそのまま Laravel のパスへ入れないよう、正の整数だけを通す
  if (!/^[1-9][0-9]*$/.test(listId)) notFound();

  // D-43：他人のリストと存在しないリストは、どちらも「ページが見つかりません」
  const list = await readAsUser<PackingListDetail>(
    `/lists/${listId}`,
    `/lists/${listId}`,
  );

  return (
    <main className="flex flex-col gap-6 py-8">
      <BackLink href="/lists" />

      {/* SC-07-2・4 */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-bold wrap-break-word">{list.title}</h1>
          <p className="flex flex-wrap gap-x-3 text-sm text-zinc-600">
            <span>{list.category.name}</span>
            <span>{list.is_public ? "公開" : "非公開"}</span>
            <span>
              {list.items.length}/{MAX_ITEMS}件
            </span>
          </p>
        </div>
        <ListMenu listId={list.id} title={list.title} />
      </header>

      {/* SC-07-3：説明文があるときだけ。途中の改行はそのまま見せる */}
      {list.description && (
        <p className="whitespace-pre-wrap">{list.description}</p>
      )}

      {list.items.length === 0 ? (
        <p>持ち物はまだありません。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.items.map((item) => (
            <li key={item.id}>{item.name}</li>
          ))}
        </ul>
      )}
    </main>
  );
}
