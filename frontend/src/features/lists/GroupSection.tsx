"use client";

import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import { sectionId } from "./itemSorting";

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
  children: ReactNode;
};

// 持ち物を別のグループから動かしてきたときは、色だけでなく枠でも示す
const HIGHLIGHT = "outline-2 outline-offset-2 outline-zinc-900";

/**
 * SC-07-6：グループの見出しと、その中の持ち物。
 * グループは見出しをつかんで動かし、中の持ち物ごと順番を変える（D-98）。未分類は最後のまま動かさない。
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
      {/* 見出しそのものを持ち手にする。持ち手のマークは出さない（D-03） */}
      <h2
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-level={2}
        className="cursor-grab touch-manipulation font-medium wrap-break-word select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
      >
        {title}（{count}件）
      </h2>
      {children}
    </section>
  );
}

// 未分類は動かさないが、持ち物を動かしてきて置く場所にはなる（D-98）
function UngroupedSection({ title, count, highlighted, children }: Props) {
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
      <h2 className="font-medium wrap-break-word">
        {title}（{count}件）
      </h2>
      {children}
    </section>
  );
}
