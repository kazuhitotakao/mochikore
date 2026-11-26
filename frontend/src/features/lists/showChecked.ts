// D-94：自分のリストの内容（SC-07）でチェック済みを表示したまま、リスト編集（SC-06）・グループ整理（SC-09）へ
// 行って戻ったときだけ、表示を引き継ぐ（利用者の指示）。表示の切替は画面の中の状態なので、行き来のURLで渡す。
// SC-09 では、同じ印でチェック済みも分類の対象にする（D-95）。行き来のURLは features/combined-views/returnPath.ts の
// listPagePath で作る（開いた元のまとめ表示も一緒に渡す、D-124）
export const SHOW_CHECKED_PARAM = "show_checked";

export function isShowChecked(value: string | string[] | undefined): boolean {
  return value === "1";
}
