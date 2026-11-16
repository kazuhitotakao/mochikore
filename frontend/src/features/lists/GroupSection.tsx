"use client";

import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRef, type ReactNode } from "react";
import { sectionId } from "./itemSorting";
import { SwipeDeleteLayer } from "./SwipeDeleteLayer";
import { useSwipeToDelete } from "./useSwipeToDelete";

type Props = {
  // null は未分類
  groupId: number | null;
  title: string;
  // SC-07-6：画面に出している持ち物の数（D-95）
  count: number;
  // 並べ替えの保存中は動かさない
  sortDisabled: boolean;
  allChecked: boolean;
  // D-106：空のグループも押せる。送信中は押せない
  checkDisabled: boolean;
  onToggleCheck: () => void;
  // D-105：名前付きグループの見出しを左スワイプで削除する。開けるのは1行だけなので、開閉は親が持つ。
  // 削除は確認してから、中の持ち物ごと消す（親が確認を出す）
  swipeOpen?: boolean;
  onSwipeOpenChange?: (open: boolean) => void;
  swipeDisabled?: boolean;
  onSwipeDelete?: () => void;
  children: ReactNode;
};

const HEADING = "font-bold wrap-break-word";

/**
 * SC-07-6：グループの見出しと、その中の持ち物。
 * グループは見出しをつかんで動かし、中の持ち物ごと順番を変える（D-98）。未分類は最後のまま動かさない。
 * 利用者の指示で、一部チェックの横線は出さず、全件チェック直後の猶予中だけ元に戻せる（D-99を変更）。
 */
export function GroupSection(props: Props) {
  return props.groupId === null ? (
    <UngroupedSection {...props} />
  ) : (
    <SortableGroupSection {...props} groupId={props.groupId} />
  );
}

function SortableGroupSection({
  groupId,
  title,
  count,
  sortDisabled,
  allChecked,
  checkDisabled,
  onToggleCheck,
  swipeOpen = false,
  onSwipeOpenChange = () => {},
  swipeDisabled = false,
  onSwipeDelete = () => {},
  children,
}: Props & { groupId: number }) {
  const {
    active,
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sectionId(groupId),
    data: { groupId },
    disabled: sortDisabled,
    attributes: { role: "heading", roleDescription: "並べ替えできるグループ" },
  });
  // ドラッグ中・並べ替えの保存中・送信中は横に引かない
  const swipeContainer = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToDelete({
    container: swipeContainer,
    disabled: swipeDisabled || sortDisabled || active !== null,
    open: swipeOpen,
    onOpenChange: onSwipeOpenChange,
    onDelete: onSwipeDelete,
  });

  return (
    <section
      ref={setNodeRef}
      id={sectionId(groupId)}
      aria-label={title}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex flex-col gap-1 rounded bg-background ${isDragging ? "relative z-10 shadow-md" : ""}`}
    >
      {/* 横の動きは左スワイプ（D-105）に使うので、ブラウザには縦のスクロールと拡大だけを任せる。
          赤い「削除」を見出しの薄い背景と同じ幅・角丸にそろえる */}
      <div
        ref={swipeContainer}
        className={`relative -mx-2 touch-pan-y touch-pinch-zoom rounded-lg ${swipe.offset < 0 ? "overflow-hidden" : ""}`}
      >
        <SwipeDeleteLayer
          visible={swipe.offset < 0}
          open={swipe.isOpen}
          label={`${title}と中の持ち物を削除`}
          // 確認を出す前に閉じる。確認で「やめる」を押したときに、開いたまま残さない
          onDelete={() => {
            onSwipeOpenChange(false);
            onSwipeDelete();
          }}
        />
        {/* 見出しだけを薄く塗り、持ち物の行と見分けられるようにする（利用者の指示）。
            持ち物の行と同じ高さ（60px）にし、赤い「削除」の縦幅もそろえる（D-105） */}
        <div
          {...swipe.handlers}
          style={
            swipe.offset < 0
              ? { transform: `translateX(${swipe.offset}px)` }
              : undefined
          }
          className={`relative flex min-h-15 items-center gap-2 rounded-lg bg-brand-soft px-2 py-2 ${swipe.swiping ? "" : "transition-transform duration-200"}`}
        >
          <GroupCheckbox
            title={title}
            checked={allChecked}
            disabled={checkDisabled}
            onToggle={onToggleCheck}
          />
          {/* 見出しそのものを持ち手にする。持ち手のマークは出さない（D-03） */}
          <h2
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-level={2}
            className={`min-w-0 flex-1 cursor-grab touch-pan-y touch-pinch-zoom select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${HEADING}`}
          >
            {title}
            <span className="text-sm font-normal whitespace-nowrap text-muted">
              （{count}件）
            </span>
          </h2>
        </div>
      </div>
      {children}
    </section>
  );
}

// 見出しは置かず、先頭直前の余白も移動先に含める。負の余白と内側の余白で表示位置は保つ。
function UngroupedSection({ children }: Pick<Props, "children">) {
  const { setNodeRef } = useDroppable({
    id: sectionId(null),
    data: { groupId: null },
  });

  return (
    <section
      ref={setNodeRef}
      aria-label="グループに入っていない持ち物"
      className="-mt-6 flex flex-col gap-1 rounded pt-6"
    >
      {children}
    </section>
  );
}

function GroupCheckbox({
  title,
  checked,
  disabled,
  onToggle,
}: {
  title: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={`${title}の持ち物をまとめてチェック`}
      onChange={onToggle}
      className="size-5 shrink-0"
    />
  );
}
