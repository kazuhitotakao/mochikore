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
      className="self-start rounded px-2 py-1 text-xl"
    >
      ←
    </Link>
  );
}
