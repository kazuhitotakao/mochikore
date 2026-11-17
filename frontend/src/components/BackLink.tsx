import Link from "next/link";

type Props = {
  href: string;
  // 行き先を矢印の横に書くとき（SC-15「← ログインへ」。メールから直接開いた人にも行き先が分かるように）
  label?: string;
};

// 共通2の「←」の矢印。SC-09の「←」（破棄の確認があるのでボタン）でも同じ形を使う
export function BackArrow() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      // マウスを乗せると矢印だけ少し左へ動かし、戻る向きを示す。動きを減らす設定では動かさない
      className="size-4.5 shrink-0 transition-transform motion-safe:group-hover:-translate-x-0.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

// 02_画面配置 共通2：前の画面へ戻る「←」。
// 直接開いたときにサイトの外へ出ないよう、履歴ではなく前の画面のURLへ移動する
export function BackLink({ href, label }: Props) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={label ? undefined : "戻る"}
      // 見た目は globals.css の back-button（白い丸）。押せる範囲は tap-target で44px四方にする（D-73）
      // 丸の左端を本文の左端にそろえ、下の見出しに少し近づける（画面の絵と同じ並び）
      className={`group -mb-1 self-start back-button tap-target ${
        label ? "pr-4 pl-3 text-sm font-medium" : ""
      }`}
    >
      <BackArrow />
      {label}
    </Link>
  );
}
