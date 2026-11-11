"use client";

import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, type ReactNode } from "react";
import { sectionId } from "./itemSorting";

// D-99：グループの持ち物が全部チェック済み・一部だけ・ひとつもない
export type GroupCheckState = "all" | "some" | "none";

type Props = {
  // null は未分類
  groupId: number | null;
  title: string;
  // SC-07-6：画面に出している持ち物の数（D-95）
  count: number;
  // 持ち物を別のグループからここへ動かしているとき（D-98）
  highlighted: boolean;
  // 並べ替えの保存中は動かさない
  sortDisabled: boolean;
  checkState: GroupCheckState;
  // 中の持ち物が0件のとき・送信中は押せない
  checkDisabled: boolean;
  onToggleCheck: () => void;
  children: ReactNode;
};

// 持ち物を別のグループから動かしてきたときは、色だけでなく枠でも示す
const HIGHLIGHT = "outline-2 outline-offset-2 outline-zinc-900";
const HEADING = "font-medium wrap-break-word";

/**
 * SC-07-6：グループの見出しと、その中の持ち物。
 * グループは見出しをつかんで動かし、中の持ち物ごと順番を変える（D-98）。未分類は最後のまま動かさない。
 * 見出しの左のチェックで、中の持ち物をまとめてチェック・解除する（D-99）。
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
  highlighted,
  sortDisabled,
  checkState,
  checkDisabled,
  onToggleCheck,
  children,
}: Props & { groupId: number }) {
  const {
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

  return (
    <section
      ref={setNodeRef}
      aria-label={title}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex flex-col gap-1 rounded bg-background ${highlighted ? HIGHLIGHT : ""} ${isDragging ? "relative z-10 shadow-md" : ""}`}
    >
      <div className="flex items-center gap-2">
        <GroupCheckbox
          title={title}
          state={checkState}
          disabled={checkDisabled}
          onToggle={onToggleCheck}
        />
        {/* 見出しそのものを持ち手にする。持ち手のマークは出さない（D-03） */}
        <h2
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-level={2}
          className={`min-w-0 flex-1 cursor-grab touch-manipulation select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 ${HEADING}`}
        >
          {title}（{count}件）
        </h2>
      </div>
      {children}
    </section>
  );
}

// 未分類は動かさないが、持ち物を動かしてきて置く場所にはなる（D-98）
function UngroupedSection({
  title,
  count,
  highlighted,
  checkState,
  checkDisabled,
  onToggleCheck,
  children,
}: Props) {
  const { setNodeRef } = useDroppable({
    id: sectionId(null),
    data: { groupId: null },
  });

  return (
    <section
      ref={setNodeRef}
      aria-label={title}
      className={`flex flex-col gap-1 rounded ${highlighted ? HIGHLIGHT : ""}`}
    >
      <div className="flex items-center gap-2">
        <GroupCheckbox
          title={title}
          state={checkState}
          disabled={checkDisabled}
          onToggle={onToggleCheck}
        />
        <h2 className={`min-w-0 flex-1 ${HEADING}`}>
          {title}（{count}件）
        </h2>
      </div>
      {children}
    </section>
  );
}

// D-99：一部だけチェック済みのときは、チェック欄の「一部」の形（横線）で示す。読み上げでも「一部」と伝わる
function GroupCheckbox({
  title,
  state,
  disabled,
  onToggle,
}: {
  title: string;
  state: GroupCheckState;
  disabled: boolean;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  // indeterminate は HTML の属性で指定できないので、要素に直接設定する
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === "all"}
      disabled={disabled}
      aria-label={`${title}の持ち物をまとめてチェック`}
      onChange={onToggle}
      className="size-5 shrink-0"
    />
  );
}
