// D-73：操作の意味が文字を読む前に伝わるよう、メニューやボタンに添える線のアイコン（利用者の指示）。
// 太さ・角の丸め・大きさをここでそろえ、色は文字と同じ（currentColor）にする。
// 読み上げは隣の文字で伝えるので、アイコン自体は読ませない。
const PATHS = {
  // 鉛筆：リストを編集
  edit: (
    <>
      <path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3Z" />
      <path d="M13.5 6.5l3 3" />
    </>
  ),
  // フォルダ：グループを整理
  group: (
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z" />
  ),
  // 地球：リストを公開（ほかの人も見られるようにする）
  public: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.4 2.6 3.6 5.6 3.6 9s-1.2 6.4-3.6 9c-2.4-2.6-3.6-5.6-3.6-9S9.6 5.6 12 3Z" />
    </>
  ),
  // 左回りの矢印：チェックを全部外して最初の状態に戻す
  reset: (
    <>
      <path d="M4.5 12A7.5 7.5 0 1 0 7 6.4" />
      <path d="M4.5 3.5v4h4" />
    </>
  ),
  // 丸の中のチェック：「選んで削除」の選ぶ印（SC-07-18 の丸い印）と同じ形
  select: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.4 2.4 4.6-5" />
    </>
  ),
  // ごみ箱：リスト・持ち物・グループを削除
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  // しおり：よく使う項目・グループとして保存
  save: <path d="M7 3.5h10a1 1 0 0 1 1 1v16l-6-4-6 4v-16a1 1 0 0 1 1-1Z" />,
  // しおりに＋：よく使う項目（保存したもの）から追加
  "saved-add": (
    <>
      <path d="M7 3.5h10a1 1 0 0 1 1 1v16l-6-4-6 4v-16a1 1 0 0 1 1-1Z" />
      <path d="M12 7.5v5M9.5 10h5" />
    </>
  ),
  // 下向きの矢印：グループをたたむ・開く（たたんだときは右へ回して使う、D-110）
  chevron: <path d="M6 9.5l6 6 6-6" />,
} as const;

export type IconName = keyof typeof PATHS;

type Props = {
  name: IconName;
  className?: string;
};

export function Icon({ name, className = "size-5" }: Props) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
