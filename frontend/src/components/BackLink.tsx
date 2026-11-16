import Link from "next/link";

type Props = {
  href: string;
  // 行き先を矢印の横に書くとき（SC-15「← ログインへ」。メールから直接開いた人にも行き先が分かるように）
  label?: string;
};

// 02_画面配置 共通2：前の画面へ戻る「←」。
// 直接開いたときにサイトの外へ出ないよう、履歴ではなく前の画面のURLへ移動する
export function BackLink({ href, label }: Props) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={label ? undefined : "戻る"}
      // 指で押しやすいよう、押せる範囲を44px四方以上にする（利用者の指示）
      // 矢印を本文の左端にそろえ、下の見出しに近づける（画面の絵と同じ並び）
      className="-mb-3 -ml-3 flex min-h-11 min-w-11 items-center justify-center gap-1 self-start rounded-lg px-3 text-brand hover:text-brand-deep"
    >
      <span aria-hidden="true" className="text-xl">
        ←
      </span>
      {label}
    </Link>
  );
}
