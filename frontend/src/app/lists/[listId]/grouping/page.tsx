import { notFound } from "next/navigation";
import { readAsUser } from "@/features/auth/requireUser";
import { GroupingEditor } from "@/features/grouping/GroupingEditor";
import type { GroupingState } from "@/types/api";

// SC-09 グループ整理（任意）。自分のリストの内容（SC-07）の「グループを整理」を押したときだけ開く（D-56）
export default async function GroupingPage(
  props: PageProps<"/lists/[listId]/grouping">,
) {
  const { listId } = await props.params;
  const searchParams = await props.searchParams;

  // URLの値をそのまま Laravel のパスへ入れないよう、正の整数だけを通す
  if (!/^[1-9][0-9]*$/.test(listId)) notFound();

  // D-95：SC-07 でチェック済みを表示中に開いたときだけ、チェック済みも分類の対象にする
  const includeChecked = searchParams.show_checked === "1";

  // SC-09-1：最新の分類を読む（API-29）。読めなければ編集を始めない（エラーの画面になる）。
  // D-43：他人のリストと存在しないリストは、どちらも「ページが見つかりません」
  const state = await readAsUser<GroupingState>(
    `/lists/${listId}/grouping`,
    `/lists/${listId}/grouping`,
  );

  return (
    <main className="flex flex-col py-8">
      <GroupingEditor
        listId={Number(listId)}
        initialState={state}
        includeChecked={includeChecked}
      />
    </main>
  );
}
