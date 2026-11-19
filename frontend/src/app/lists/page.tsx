import Link from "next/link";
import { readAsUser } from "@/features/auth/requireUser";
import { PublicBadge } from "@/features/lists/PublicBadge";
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
        <h1 className="text-2xl font-medium">自分のリスト</h1>
        <p className="text-sm text-muted">
          {lists.length}/{MAX_LISTS}件
        </p>
      </div>

      {/* 02_画面配置 SC-04-6：確認メールのリンクで認証が済んだ後 */}
      {searchParams.verified === "1" && (
        <p role="status">メール認証が完了しました。</p>
      )}

      {lists.length === 0 ? (
        <p>リストはまだありません。</p>
      ) : (
        // D-24：更新が新しい順で届く。同じ名前のリストも1件ずつ出す
        <ul className="flex flex-col gap-3">
          {lists.map((list) => (
            <li key={list.id}>
              <Link
                href={`/lists/${list.id}`}
                prefetch={false}
                className="card flex flex-col gap-1 px-4 py-3 hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <span className="font-medium">{list.title}</span>
                {list.description && (
                  <span className="truncate text-sm text-muted">
                    {list.description}
                  </span>
                )}
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                  {/* 利用者の指示で、持ち物の件数は出さない（D-63） */}
                  <span className="tag">{list.category.name}</span>
                  {/* D-73（利用者の指示）：SC-07と同じく、公開しているリストにだけ「公開中」を付ける */}
                  {list.is_public && <PublicBadge />}
                  <span>更新 {formatDate(list.updated_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* SC-05-3（D-73）：利用者の指示で、リストの一覧の下に置く。100件のときは押せない */}
      {isFull ? (
        <div className="flex flex-col gap-1">
          <button type="button" disabled className="self-start btn-primary">
            <span aria-hidden="true" className="mr-1.5">
              ＋
            </span>
            新しいリスト
          </button>
          <p>リストは100件までです。</p>
        </div>
      ) : (
        <Link
          href="/lists/new"
          prefetch={false}
          className="self-start btn-primary"
        >
          <span aria-hidden="true" className="mr-1.5">
            ＋
          </span>
          新しいリスト
        </Link>
      )}

      <Link
        href="/public/lists"
        prefetch={false}
        className="self-start text-link tap-target"
      >
        公開リストを見る
      </Link>
      <Link
        href="/account"
        prefetch={false}
        className="self-start text-link tap-target"
      >
        アカウント設定
      </Link>
    </main>
  );
}
