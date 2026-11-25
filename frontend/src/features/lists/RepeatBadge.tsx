import { Icon } from "@/components/Icon";
import { REPEAT_LABEL } from "@/features/grouping/checkMode";

/**
 * D-122：繰り返し利用のグループに付ける印。グループ整理（SC-09）の丸と、
 * 公開リスト詳細（SC-11）・限定公開のリスト（SC-18）のグループ名の横に出す。通常のグループには出さない。
 * 見出しの薄い緑の上でも見えるよう、白い地にする。
 */
export function RepeatBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-background px-2 py-0.5 text-[0.8125rem] leading-5 font-normal whitespace-nowrap text-brand-deep ring-1 ring-line-soft">
      <Icon name="repeat" className="size-3.5" />
      {REPEAT_LABEL}
    </span>
  );
}
