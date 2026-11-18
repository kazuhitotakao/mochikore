import { SwitchIndicator } from "@/components/SwitchIndicator";

type Props = {
  id?: string;
  on: boolean;
  // チェック済みの持ち物の件数
  count: number;
  disabled?: boolean;
  // sm：SC-07 の一覧の上で、「よく使う項目から追加」と同じ14pxの文字と小さめのスイッチにする（利用者の指示）
  size?: "md" | "sm";
  // end：右端にそろえる（SC-07、利用者の指示）。既定は左端
  align?: "start" | "end";
  // その画面だけの余白の調整
  className?: string;
  onToggle: () => void;
};

/**
 * 「チェック済みを表示（n件）」のオン・オフのスイッチ（D-94・D-95）。
 * 自分のリストの内容（SC-07）の一覧の上と、グループ整理（SC-09）の見出しの下で同じ動きにする。
 * 画面の表示だけを変え、通信はしない。読み上げは文字とオン・オフ（role="switch"・aria-checked）で伝える。
 */
export function ShowCheckedSwitch({
  id,
  on,
  count,
  disabled = false,
  size = "md",
  align = "start",
  className = "",
  onToggle,
}: Props) {
  const small = size === "sm";
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      disabled={disabled}
      // 押せる範囲は44px以上（D-73）。横に広げず、文字とスイッチの幅だけにする
      className={`flex min-h-11 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50 ${align === "end" ? "self-end" : "self-start"} ${small ? "gap-2 text-sm" : "gap-3"} ${className}`}
    >
      <span>チェック済みを表示（{count}件）</span>
      <SwitchIndicator on={on} size={size} />
    </button>
  );
}
