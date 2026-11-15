import Link from "next/link";

type Props = {
  href: string;
};

// 02_画面配置 共通2：前の画面へ戻る「←」。
// 直接開いたときにサイトの外へ出ないよう、履歴ではなく前の画面のURLへ移動する
export function BackLink({ href }: Props) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-label="戻る"
      // 指で押しやすいよう、押せる範囲を44px四方以上にする（利用者の指示）
      className="flex min-h-11 min-w-11 items-center justify-center self-start rounded px-2 text-xl"
    >
      ←
    </Link>
  );
}
