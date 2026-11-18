type Props = {
  on: boolean;
  // sm：14pxの文字に並べる小さめのスイッチ（SC-07 のチェック済みの表示、利用者の指示）
  size?: "md" | "sm";
};

/**
 * オン・オフのスイッチの見た目（利用者の指示、D-73）。オンは緑でつまみが右、オフは灰色でつまみが左。
 * 色だけでなく、つまみの位置でも状態を示す。押す操作と読み上げ（role="switch"・aria-checked）は、
 * 使う側のボタンに付ける。SC-06・SC-07 の公開設定（VisibilitySwitch・「…」の「リストを公開」）と、SC-07・SC-09 のチェック済みの表示（ShowCheckedSwitch）で使う。
 */
export function SwitchIndicator({ on, size = "md" }: Props) {
  const small = size === "sm";
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center rounded-full motion-safe:transition-colors ${small ? "h-5 w-9" : "h-7 w-12"} ${on ? "bg-brand" : "bg-line-strong"}`}
    >
      <span
        className={`rounded-full bg-white shadow-sm motion-safe:transition-transform ${small ? "size-4" : "size-6"} ${on ? (small ? "translate-x-4.5" : "translate-x-5.5") : "translate-x-0.5"}`}
      />
    </span>
  );
}
