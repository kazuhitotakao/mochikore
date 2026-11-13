import type { PackingListItem } from "@/types/api";

export type ItemDragPreview = {
  itemId: number;
  groupId: number | null;
  itemIds: number[];
};

// ドラッグ中は並びと所属だけを仮表示し、通信で更新された名前・チェックや追加・削除を失わない。
export function applyItemDragPreview(
  items: PackingListItem[],
  preview: ItemDragPreview | null,
): PackingListItem[] {
  if (!preview) return items;

  const remaining = new Map(items.map((item) => [item.id, item]));
  const ordered: PackingListItem[] = [];
  for (const id of preview.itemIds) {
    const item = remaining.get(id);
    if (!item) continue;
    ordered.push(
      id === preview.itemId ? { ...item, group_id: preview.groupId } : item,
    );
    remaining.delete(id);
  }
  return [...ordered, ...remaining.values()];
}
