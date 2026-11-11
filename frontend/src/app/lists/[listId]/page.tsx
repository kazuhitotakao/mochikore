import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { readAsUser } from "@/features/auth/requireUser";
import { serverApi } from "@/lib/api/server";
import { ListDetail } from "@/features/lists/ListDetail";
import type { Category, PackingListDetail } from "@/types/api";

// SC-07 自分のリストの内容（通常画面）
export default async function ListPage(props: PageProps<"/lists/[listId]">) {
  const { listId } = await props.params;

  // URLの値をそのまま Laravel のパスへ入れないよう、正の整数だけを通す
  if (!/^[1-9][0-9]*$/.test(listId)) notFound();

  // D-43：他人のリストと存在しないリストは、どちらも「ページが見つかりません」
  const list = await readAsUser<PackingListDetail>(
    `/lists/${listId}`,
    `/lists/${listId}`,
  );
  // SC-07-17：よく使う項目に保存するときに選ぶカテゴリー（API-18、ログイン不要）
  const categories = await serverApi<Category[]>("/categories");

  return (
    <main className="flex flex-col gap-6 py-8">
      <BackLink href="/lists" />
      {/* 操作が404になって読み直したとき（ほかの画面で持ち物が消えていたなど）は、
          画面の状態を最新の内容で作り直す。持ち物の構造が変わると revision が増える（D-59） */}
      <ListDetail
        key={`${list.grouping_revision}-${list.updated_at}`}
        list={list}
        categories={categories}
      />
    </main>
  );
}
