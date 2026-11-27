import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { readAsUser } from "@/features/auth/requireUser";
import { OwnListIndex } from "@/features/lists/OwnListIndex";
import { MAX_LISTS } from "@/features/lists/validation";
import type { CombinedView, MyAvatar, PackingListSummary } from "@/types/api";

// SC-05 自分のリスト一覧
export default async function ListsPage(props: PageProps<"/lists">) {
  // D-19：メール未認証なら Laravel が403を返し、SC-04へ移動する。
  // D-124：本人のまとめ表示（API-65）も同時に読み、1件以上あるときだけ一覧の上に出す。
  // D-128：右上のアカウント設定の入口に出す写真（API-70）も同時に読む
  const [lists, combinedViews, { avatar }] = await Promise.all([
    readAsUser<PackingListSummary[]>("/lists", "/lists"),
    readAsUser<CombinedView[]>("/combined-views", "/lists"),
    readAsUser<MyAvatar>("/me/avatar", "/lists"),
  ]);
  const searchParams = await props.searchParams;
  // D-119：参加しているリストも並ぶが、100件の上限（D-50）は自分のリストだけで数える
  const ownCount = lists.filter((list) => list.is_owner).length;
  const isFull = ownCount >= MAX_LISTS;

  return (
    <main className="flex flex-col gap-6 py-8">
      {/* SC-05-2・D-128：件数は出さず、右上に写真（なければ人型）を置いて、アカウント設定（SC-12）への入口にする */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-medium">自分のリスト</h1>
        <Link
          href="/account"
          prefetch={false}
          aria-label="アカウント設定"
          className="tap-target shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Avatar src={avatar} size="md" />
        </Link>
      </div>

      {/* 02_画面配置 SC-04-6：確認メールのリンクで認証が済んだ後 */}
      {searchParams.verified === "1" && (
        <p role="status">メール認証が完了しました。</p>
      )}

      {/* SC-05-4〜7：カードの「…」・左スワイプでの編集・複製・削除（D-120）。
          共同編集で参加しているリストも一緒に並べ、「…」から抜けられる（D-119） */}
      <OwnListIndex lists={lists} combinedViews={combinedViews}>
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
      </OwnListIndex>
    </main>
  );
}
