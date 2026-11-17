type Props = {
  on: boolean;
};

/**
 * オン・オフのスイッチの見た目（利用者の指示、D-73）。オンは緑でつまみが右、オフは灰色でつまみが左。
 * 色だけでなく、つまみの位置でも状態を示す。押す操作と読み上げ（role="switch"・aria-checked）は、
 * 使う側のボタンに付ける。SC-06 の公開設定と SC-09 のチェック済みの表示で使う。
 */
export function SwitchIndicator({ on }: Props) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full motion-safe:transition-colors ${on ? "bg-brand" : "bg-line-strong"}`}
    >
      <span
        className={`size-6 rounded-full bg-white shadow-sm motion-safe:transition-transform ${on ? "translate-x-5.5" : "translate-x-0.5"}`}
      />
    </span>
  );
}
