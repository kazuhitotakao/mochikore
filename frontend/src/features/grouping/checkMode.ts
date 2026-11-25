import type { GroupCheckMode } from "@/types/api";

// D-122：グループごとのチェックの動き。選ぶ欄（SC-07-25・SC-09-3・5）と印で同じ言葉を使う
export const CHECK_MODES: readonly {
  value: GroupCheckMode;
  label: string;
  description: string;
}[] = [
  { value: "normal", label: "通常", description: "チェックしたら隠す" },
  {
    value: "repeat",
    label: "繰り返し利用",
    description: "隠さず、前回チェックした日を出す",
  },
];

export const REPEAT_LABEL = "繰り返し利用";
