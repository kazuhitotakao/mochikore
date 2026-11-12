import { arrayMove } from "@dnd-kit/sortable";
import type { PackingListGroup, PackingListItem } from "@/types/api";

// 表示中のものが占める位置だけを入れ替え、隠れているものの位置は動かさずに全体を返す
function reorderWithinVisible<T extends { id: number }>(
  all: T[],
  visible: T[],
  activeId: number,
  overId: number,
): T[] {
  const movedVisible = arrayMove(
    visible,
    visible.findIndex((entry) => entry.id === activeId),
    visible.findIndex((entry) => entry.id === overId),
  );
  const visibleIds = new Set(visible.map((entry) => entry.id));

  let next = 0;
  return all.map((entry) =>
    visibleIds.has(entry.id) ? movedVisible[next++] : entry,
  );
}

/**
 * D-95：表示中の持ち物だけを並べ替え、全体の順番を返す。
 * 表示中の持ち物が占める位置だけを入れ替え、隠れている持ち物（チェック済み）の位置は動かさない。
 * API-19 は全有効IDが必要なので、隠れている持ち物も含めた全体を返す（番号は1から振り直す）。
 *
 * 例：全体が A（未チェック）・B（チェック済み）・C（未チェック）で B を隠しているとき、
 * C を A より上へ動かすと、全体は C・B・A になる。
 */
export function reorderVisibleItems(
  all: PackingListItem[],
  visible: PackingListItem[],
  activeId: number,
  overId: number,
): PackingListItem[] {
  return reorderWithinVisible(all, visible, activeId, overId).map(
    (item, index) => ({ ...item, sort_order: index + 1 }),
  );
}

/**
 * D-101：表示中のグループだけを並べ替え、全グループの順番を返す。
 * 全部チェック済みで隠したグループの位置は動かさない。API-36 は全グループのIDが必要なので全体を返す。
 */
export function reorderVisibleGroups(
  all: PackingListGroup[],
  visible: PackingListGroup[],
  activeId: number,
  overId: number,
): PackingListGroup[] {
  return reorderWithinVisible(all, visible, activeId, overId);
}

/**
 * D-98：持ち物を別のグループ（または未分類）へ動かしたときの全体の順番と所属を返す。
 * 動かした持ち物を外して、目印の持ち物の前（before が true）か後ろに入れる。
 * 目印がないとき（中身が見えていないグループの見出しで離したとき）は、そのグループの最後の持ち物の後ろへ、
 * そのグループに持ち物がなければ元の位置のまま所属だけを変える。
 * 隠れているチェック済みの位置はそのまま（D-95）。API-19 は全有効IDが必要なので全体を返す（番号は1から）。
 */
export function moveItemToGroup(
  all: PackingListItem[],
  activeId: number,
  groupId: number | null,
  anchor: { id: number; before: boolean } | null,
): PackingListItem[] {
  const activeIndex = all.findIndex((item) => item.id === activeId);
  if (activeIndex < 0) return all;

  const moved = { ...all[activeIndex], group_id: groupId };
  const rest = all.filter((item) => item.id !== activeId);
  const anchorIndex = anchor
    ? rest.findIndex((item) => item.id === anchor.id)
    : -1;
  const lastInGroup = rest.map((item) => item.group_id).lastIndexOf(groupId);

  let index = activeIndex;
  if (anchor && anchorIndex >= 0) {
    index = anchor.before ? anchorIndex : anchorIndex + 1;
  } else if (lastInGroup >= 0) {
    index = lastInGroup + 1;
  }

  rest.splice(index, 0, moved);
  return rest.map((item, order) => ({ ...item, sort_order: order + 1 }));
}
