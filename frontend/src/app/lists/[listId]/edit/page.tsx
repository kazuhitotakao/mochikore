import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { readAsUser } from "@/features/auth/requireUser";
import {
  editHrefFromIndex,
  isOpenedFromIndex,
} from "@/features/lists/editReturn";
import { ListForm } from "@/features/lists/ListForm";
import { isShowChecked, withShowChecked } from "@/features/lists/showChecked";
import { serverApi } from "@/lib/api/server";
import type { Category, PackingListDetail } from "@/types/api";

// SC-06 リスト作成・編集（編集）。公開の切り替えは API-14 で保存する
export default async function EditListPage(
  props: PageProps<"/lists/[listId]/edit">,
) {
  const { listId } = await props.params;

  // URLの値をそのまま Laravel のパスへ入れないよう、正の整数だけを通す
  if (!/^[1-9][0-9]*$/.test(listId)) notFound();

  const searchParams = await props.searchParams;
  // D-120：自分のリスト一覧（SC-05）の「…」から開いたときは、ログインし直した後も一覧へ戻れるよう印を残す
  const fromIndex = isOpenedFromIndex(searchParams);

  // SC-06-1：編集のときはリストの内容（API-07）とカテゴリー（API-18）を読む。
  // D-43：他人のリストと存在しないリストは、どちらも「ページが見つかりません」
  // D-73：独立している取得を同時に始め、編集画面を開くまでの待ち時間を減らす。
  const [listRead, categoryRead] = await Promise.allSettled([
    readAsUser<PackingListDetail>(
      `/lists/${listId}`,
      fromIndex ? editHrefFromIndex(Number(listId)) : `/lists/${listId}/edit`,
    ),
    serverApi<Category[]>("/categories"),
  ]);
  // D-43：同時に失敗しても、本人確認とリストのエラーを先に扱う。
  if (listRead.status === "rejected") throw listRead.reason;
  if (categoryRead.status === "rejected") throw categoryRead.reason;
  const list = listRead.value;
  const categories = categoryRead.value;
  // D-119：リスト名・説明・カテゴリーを編集できるのは所有者だけ。共同編集のメンバーには画面を出さない
  if (!list.is_owner) notFound();
  // 「←」と保存の後の戻り先（SC-06-6）。一覧から開いたときは一覧へ（D-120）。
  // D-94：SC-07 でチェック済みを表示したまま来たときは、戻ったときも表示したままにする
  const returnHref = fromIndex
    ? "/lists"
    : withShowChecked(
        `/lists/${list.id}`,
        isShowChecked(searchParams.show_checked),
      );

  return (
    <main className="flex flex-col gap-6 py-8">
      <BackLink href={returnHref} />
      <h1 className="text-2xl font-medium">リストを編集</h1>
      <ListForm
        categories={categories}
        list={list}
        returnHref={returnHref}
        // D-119：共同編集中（メンバーがいる・招待リンクがある）は公開のスイッチを押せなくする
        collaborative={list.member_count > 0 || list.invite_token !== null}
      />
    </main>
  );
}
