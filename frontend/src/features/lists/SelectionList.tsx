"use client";

import type { PackingListGroup, PackingListItem } from "@/types/api";

type Props = {
  groups: PackingListGroup[];
  // 画面に出している持ち物（チェック済みを隠しているときは含まない、D-95）
  visibleItems: PackingListItem[];
  selectedItemIds: ReadonlySet<number>;
  selectedGroupIds: ReadonlySet<number>;
  disabled: boolean;
  onToggleItem: (itemId: number) => void;
  onToggleGroup: (groupId: number) => void;
};

/**
 * SC-07-18・D-100「選んで削除」の選ぶ表示。持ち物の行とグループの見出しを押して選ぶ。
 * グループを選ぶと、中の持ち物（隠れたチェック済みも含む）もまとめて選ばれる。
 * この間は、ドラッグ・チェック・名前の編集・行の「…」は使えない。
 */
export function SelectionList({
  groups,
  visibleItems,
  selectedItemIds,
  selectedGroupIds,
  disabled,
  onToggleItem,
  onToggleGroup,
}: Props) {
  function renderRows(rows: PackingListItem[], indented: boolean) {
    return (
      <ul className={`flex flex-col ${indented ? "pl-7" : ""}`}>
        {rows.map((item) => {
          // グループごと選んでいる持ち物は、1件ずつは外せない
          const byGroup =
            item.group_id !== null && selectedGroupIds.has(item.group_id);
          const selected = byGroup || selectedItemIds.has(item.id);
          return (
            <li key={item.id} className="border-b border-zinc-200">
              <button
                type="button"
                aria-pressed={selected}
                disabled={disabled || byGroup}
                onClick={() => onToggleItem(item.id)}
                className="flex w-full items-center gap-2 py-2 text-left disabled:cursor-default"
              >
                <SelectMark selected={selected} />
                <span className="min-w-0 flex-1 wrap-break-word">
                  {item.name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  if (groups.length === 0) return renderRows(visibleItems, false);

  const ungrouped = visibleItems.filter((item) => item.group_id === null);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => {
        const rows = visibleItems.filter((item) => item.group_id === group.id);
        const selected = selectedGroupIds.has(group.id);
        return (
          <section
            key={group.id}
            aria-label={group.name}
            className="flex flex-col gap-1"
          >
            <h2 className="font-medium wrap-break-word">
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`${group.name}（グループごと選ぶ）`}
                disabled={disabled}
                onClick={() => onToggleGroup(group.id)}
                className="flex w-full items-center gap-2 text-left"
              >
                <SelectMark selected={selected} />
                <span className="min-w-0 flex-1">
                  {group.name}（{rows.length}件）
                </span>
              </button>
            </h2>
            {renderRows(rows, true)}
          </section>
        );
      })}
      {/* 未分類はグループではないので、見出しは選べない。中の持ち物は1件ずつ選ぶ */}
      {ungrouped.length > 0 && (
        <section aria-label="未分類" className="flex flex-col gap-1">
          <h2 className="font-medium wrap-break-word">
            未分類（{ungrouped.length}件）
          </h2>
          {renderRows(ungrouped, true)}
        </section>
      )}
    </div>
  );
}

// 完了チェック（四角）と見分けられるよう、丸い印にする。選ぶと塗りつぶして ✓ を出す（色だけで示さない）
function SelectMark({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 text-xs ${
        selected ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-400"
      }`}
    >
      {selected ? "✓" : ""}
    </span>
  );
}
