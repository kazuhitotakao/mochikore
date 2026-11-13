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
  // 並べ替えの保存中は動かさない
  sortDisabled: boolean;
  allChecked: boolean;
  // 中の持ち物が0件・送信中は押せない
  checkDisabled: boolean;
  onToggleCheck: () => void;
  children: ReactNode;
};

const HEADING = "font-medium wrap-break-word";

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
      className={`flex flex-col gap-1 rounded bg-background ${isDragging ? "relative z-10 shadow-md" : ""}`}
    >
      <div className="flex items-center gap-2">
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
  allChecked,
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
      className="flex flex-col gap-1 rounded"
    >
      {/* 利用者の指示で、表示する持ち物がない間は見出しを隠し、入力行だけ残す。 */}
      {count > 0 && (
        <div className="flex items-center gap-2">
          <GroupCheckbox
            title={title}
            checked={allChecked}
            disabled={checkDisabled}
            onToggle={onToggleCheck}
          />
          <h2 className={`min-w-0 flex-1 ${HEADING}`}>
            {title}（{count}件）
          </h2>
        </div>
      )}
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
