import Image from "next/image";
import { Icon } from "./Icon";

// 画面ごとの丸の大きさ。sm はメンバーの一覧、md は自分のリスト一覧（SC-05）の右上（「←」の丸と同じ36px）、
// lg はアカウント設定（SC-12）
const SIZES = {
  sm: { className: "size-8", pixels: 32 },
  md: { className: "size-9", pixels: 36 },
  lg: { className: "size-18", pixels: 72 },
} as const;

type Props = {
  // API-58・70 の写真（data URL）。載せていなければ null で、人型を出す
  src: string | null;
  size: keyof typeof SIZES;
  // 読み上げる名前。隣の文字やリンクの名前で伝わるときは渡さず、読ませない
  label?: string;
};

/**
 * 本人・共同編集のメンバーの写真（F-38、D-128）。写真がなければ人型のアイコンを丸に入れる。
 */
export function Avatar({ src, size, label }: Props) {
  const { className, pixels } = SIZES[size];

  if (src) {
    return (
      // data URL なので、Next.js の画像の変換は通さない
      <Image
        src={src}
        alt={label ?? ""}
        width={pixels}
        height={pixels}
        unoptimized
        className={`${className} shrink-0 rounded-full border border-line-soft object-cover`}
      />
    );
  }

  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`${className} flex shrink-0 overflow-hidden rounded-full bg-brand-soft text-brand/45`}
    >
      <Icon name="person" className="size-full" />
    </span>
  );
}
