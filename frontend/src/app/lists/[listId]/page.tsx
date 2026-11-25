import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { readAsUser } from "@/features/auth/requireUser";
import { ListCreatedNotice } from "@/features/lists/ListCreatedNotice";
import { serverApi } from "@/lib/api/server";
import { realtimeConfig } from "@/lib/realtime/config";
import { ListDetail } from "@/features/lists/ListDetail";
import { isShowChecked } from "@/features/lists/showChecked";
import type { Category, PackingListDetail } from "@/types/api";

// SC-07 自分のリストの内容（通常画面）
export default async function ListPage(props: PageProps<"/lists/[listId]">) {
  const { listId } = await props.params;

  // URLの値をそのまま Laravel のパスへ入れないよう、正の整数だけを通す
  if (!/^[1-9][0-9]*$/.test(listId)) notFound();

  // D-43：他人のリストと存在しないリストは、どちらも「ページが見つかりません」
  // SC-07-17・D-73：独立しているカテゴリーの取得を同時に始め、画面を開くまでの待ち時間を減らす。
  const [listRead, categoryRead] = await Promise.allSettled([
    readAsUser<PackingListDetail>(`/lists/${listId}`, `/lists/${listId}`),
    serverApi<Category[]>("/categories"),
  ]);
  // D-43：同時に失敗しても、本人確認とリストのエラーを先に扱う。
  if (listRead.status === "rejected") throw listRead.reason;
  if (categoryRead.status === "rejected") throw categoryRead.reason;
  const list = listRead.value;
  const categories = categoryRead.value;
  const searchParams = await props.searchParams;
  // SC-11-6・SC-18-5 のコピーの後に開いたときだけ通知を出す
  const created = searchParams.copied === "1" ? "copied" : null;

  return (
    <main className="flex flex-col py-8">
      {/* 操作が404になって読み直したとき（ほかの画面で持ち物が消えていたなど）は、
          画面の状態を最新の内容で作り直す。持ち物の構造が変わると revision が増える（D-59） */}
      <ListDetail
        key={`${list.grouping_revision}-${list.updated_at}`}
        list={list}
        categories={categories}
        initialShowChecked={isShowChecked(searchParams.show_checked)}
        // SC-07-4・D-73：「…」を「←」と同じ行に置くので、「←」と通知も ListDetail の中に並べる
        backLink={<BackLink href="/lists" />}
        notice={created && <ListCreatedNotice key={list.id} kind={created} />}
        // F-35・D-119：共同編集のリストでは、ほかのメンバーの変更をすぐ出す。接続先は公開してよい値だけを渡す
        realtime={realtimeConfig()}
      />
    </main>
  );
}
