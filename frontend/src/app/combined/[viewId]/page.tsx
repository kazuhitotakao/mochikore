import { notFound } from "next/navigation";
import { readAsUser } from "@/features/auth/requireUser";
import { CombinedViewDetail } from "@/features/combined-views/CombinedViewDetail";
import { ApiError } from "@/lib/api/errors";
import { serverApi } from "@/lib/api/server";
import { realtimeConfig } from "@/lib/realtime/config";
import type { Category, CombinedView, PackingListDetail } from "@/types/api";

// SC-20 まとめ表示（F-37、D-124）
export default async function CombinedViewPage(
  props: PageProps<"/combined/[viewId]">,
) {
  const { viewId } = await props.params;

  // URLの値をそのまま Laravel のパスへ入れないよう、正の整数だけを通す
  if (!/^[1-9][0-9]*$/.test(viewId)) notFound();

  // D-43：ほかの人のまとめ表示と存在しないまとめ表示は、どちらも「ページが見つかりません」。
  // 独立しているカテゴリーの取得を同時に始める（SC-07 と同じ）
  const [viewRead, categoryRead] = await Promise.allSettled([
    readAsUser<CombinedView>(
      `/combined-views/${viewId}`,
      `/combined/${viewId}`,
    ),
    serverApi<Category[]>("/categories"),
  ]);
  if (viewRead.status === "rejected") throw viewRead.reason;
  if (categoryRead.status === "rejected") throw categoryRead.reason;
  const view = viewRead.value;

  // 各リストの中身は、SC-07 と同じ API-07 で読み、リストごとの権限で確かめる（D-119）。
  // 読む間に見られなくなったリスト（404：削除された・共同編集から外れた）は出さない
  const reads = await Promise.allSettled(
    view.lists.map((list) => serverApi<PackingListDetail>(`/lists/${list.id}`)),
  );
  const lists: PackingListDetail[] = [];
  for (const read of reads) {
    if (read.status === "fulfilled") {
      lists.push(read.value);
    } else if (!(
      read.reason instanceof ApiError && read.reason.status === 404
    )) {
      throw read.reason;
    }
  }

  return (
    // D-124：画面幅が広いときは、リストを横に並べるため画面の幅を広げる（layout.tsx）
    <main data-wide-page className="flex flex-col py-8">
      <CombinedViewDetail
        view={view}
        lists={lists}
        categories={categoryRead.value}
        // F-35・D-119：共同編集のリストでは、ほかのメンバーの変更をすぐ出す
        realtime={realtimeConfig()}
      />
    </main>
  );
}
