import type { GroupCheckMode } from "@/types/api";
import { CHECK_MODES } from "./checkMode";

type Props = {
  // 同じ画面に2つ出ても選択が混ざらないよう、呼ぶ側で useId の値を渡す
  name: string;
  value: GroupCheckMode;
  disabled?: boolean;
  onChange: (value: GroupCheckMode) => void;
};

/**
 * D-122：「チェックの動き」を選ぶ欄。グループ整理（SC-09）の追加・名前の変更のダイアログと、
 * リストの内容（SC-07）の見出しから開くダイアログで同じものを使う。
 * 選んだだけでは保存しない（保存は、それぞれのダイアログのボタンで行う）。
 */
export function CheckModeField({ name, value, disabled, onChange }: Props) {
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-1">
      <legend className="mb-1 font-bold">チェックの動き</legend>
      {CHECK_MODES.map((mode) => (
        // 指で押しやすいよう、行全体を押せる範囲にする（44px以上、D-73）
        <label
          key={mode.value}
          className="flex min-h-11 items-center gap-3 rounded-lg px-1"
        >
          <input
            type="radio"
            name={name}
            value={mode.value}
            checked={value === mode.value}
            onChange={() => onChange(mode.value)}
            className="size-5 shrink-0"
          />
          <span className="flex min-w-0 flex-col">
            <span>{mode.label}</span>
            <span className="text-sm text-muted">{mode.description}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
