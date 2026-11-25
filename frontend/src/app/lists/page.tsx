import Link from "next/link";
import { readAsUser } from "@/features/auth/requireUser";
import { OwnListIndex } from "@/features/lists/OwnListIndex";
import { MAX_LISTS } from "@/features/lists/validation";
import type { PackingListSummary } from "@/types/api";

// SC-05 自分のリスト一覧
export default async function ListsPage(props: PageProps<"/lists">) {
  // D-19：メール未認証なら Laravel が403を返し、SC-04へ移動する
  const lists = await readAsUser<PackingListSummary[]>("/lists", "/lists");
  const searchParams = await props.searchParams;
  // D-119：参加しているリストも並ぶが、100件の上限（D-50）は自分のリストだけで数える
  const ownCount = lists.filter((list) => list.is_owner).length;
  const isFull = ownCount >= MAX_LISTS;

  return (
    <main className="flex flex-col gap-6 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-medium">自分のリスト</h1>
        <p className="text-sm text-muted">
          {ownCount}/{MAX_LISTS}件
        </p>
      </div>

      {/* 02_画面配置 SC-04-6：確認メールのリンクで認証が済んだ後 */}
      {searchParams.verified === "1" && (
        <p role="status">メール認証が完了しました。</p>
      )}

      {/* SC-05-4〜7：カードの「…」・左スワイプでの編集・複製・削除（D-120）。
          共同編集で参加しているリストも一緒に並べ、「…」から抜けられる（D-119） */}
      <OwnListIndex lists={lists}>
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
      </OwnListIndex>
    </main>
  );
}
