import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { readAsUser } from "@/features/auth/requireUser";
import { ListForm } from "@/features/lists/ListForm";
import { serverApi } from "@/lib/api/server";
import type { Category, PackingListDetail } from "@/types/api";

// SC-06 リスト作成・編集（編集）。公開の切り替えは API-14 で保存する
export default async function EditListPage(
  props: PageProps<"/lists/[listId]/edit">,
) {
  const { listId } = await props.params;

  // URLの値をそのまま Laravel のパスへ入れないよう、正の整数だけを通す
  if (!/^[1-9][0-9]*$/.test(listId)) notFound();

  // SC-06-1：編集のときはリストの内容（API-07）とカテゴリー（API-18）を読む。
  // D-43：他人のリストと存在しないリストは、どちらも「ページが見つかりません」
  const list = await readAsUser<PackingListDetail>(
    `/lists/${listId}`,
    `/lists/${listId}/edit`,
  );
  const categories = await serverApi<Category[]>("/categories");

  return (
    <main className="flex flex-col gap-6 py-8">
      <BackLink href={`/lists/${list.id}`} />
      <h1 className="text-2xl font-bold">リストを編集</h1>
      <ListForm categories={categories} list={list} />
    </main>
  );
}
