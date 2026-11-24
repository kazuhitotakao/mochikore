// D-120（利用者の指示）：自分のリスト一覧（SC-05）のカードの「…」から開いたリスト編集（SC-06）は、
// 「←」・保存の後に開いた元の一覧へ戻る。開いた元は画面の中の状態なので、開くときのURLで渡す（D-94 と同じ）
const FROM_PARAM = "from";
const FROM_INDEX = "lists";

export function editHrefFromIndex(listId: number): string {
  return `/lists/${listId}/edit?${FROM_PARAM}=${FROM_INDEX}`;
}

export function isOpenedFromIndex(
  searchParams: Record<string, string | string[] | undefined>,
): boolean {
  return searchParams[FROM_PARAM] === FROM_INDEX;
}
