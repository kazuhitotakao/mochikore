import Link from "next/link";
import { readAsUser } from "@/features/auth/requireUser";
import { MAX_LISTS } from "@/features/lists/validation";
import { formatDate } from "@/lib/format";
import type { PackingListSummary } from "@/types/api";

// SC-05 自分のリスト一覧
export default async function ListsPage(props: PageProps<"/lists">) {
  // D-19：メール未認証なら Laravel が403を返し、SC-04へ移動する
  const lists = await readAsUser<PackingListSummary[]>("/lists", "/lists");
  const searchParams = await props.searchParams;
  const isFull = lists.length >= MAX_LISTS;

  return (
    <main className="flex flex-col gap-6 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">自分のリスト</h1>
        <p>
          {lists.length}/{MAX_LISTS}件
        </p>
      </div>

      {/* 02_画面配置 SC-04-6：確認メールのリンクで認証が済んだ後 */}
      {searchParams.verified === "1" && (
        <p role="status">メール認証が完了しました。</p>
      )}

      {/* SC-05-3：100件のときは押せない */}
      {isFull ? (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            disabled
            className="self-start rounded bg-zinc-900 px-4 py-2 text-white opacity-50"
          >
            新しいリスト
          </button>
          <p>リストは100件までです。</p>
        </div>
      ) : (
        <Link
          href="/lists/new"
          prefetch={false}
          className="self-start rounded bg-zinc-900 px-4 py-2 text-white"
        >
          新しいリスト
        </Link>
      )}

      {lists.length === 0 ? (
        <p>リストはまだありません。</p>
      ) : (
        // D-24：更新が新しい順で届く。同じ名前のリストも1件ずつ出す
        <ul className="flex flex-col gap-2">
          {lists.map((list) => (
            <li key={list.id}>
              <Link
                href={`/lists/${list.id}`}
                prefetch={false}
                className="flex flex-col gap-1 rounded border border-zinc-300 px-4 py-3"
              >
                <span className="font-medium">{list.title}</span>
                {list.description && (
                  <span className="truncate text-sm text-zinc-600">
                    {list.description}
                  </span>
                )}
                <span className="flex flex-wrap gap-x-3 text-sm text-zinc-600">
                  <span>{list.category.name}</span>
                  <span>{list.items_count}件</span>
                  <span>{list.is_public ? "公開" : "非公開"}</span>
                  <span>更新 {formatDate(list.updated_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link href="/account" prefetch={false} className="underline">
        アカウント設定
      </Link>
    </main>
  );
}
