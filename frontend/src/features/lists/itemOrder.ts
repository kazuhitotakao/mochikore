import { arrayMove } from "@dnd-kit/sortable";
import type { PackingListItem } from "@/types/api";

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
  const movedVisible = arrayMove(
    visible,
    visible.findIndex((item) => item.id === activeId),
    visible.findIndex((item) => item.id === overId),
  );
  const visibleIds = new Set(visible.map((item) => item.id));

  let next = 0;
  return all
    .map((item) => (visibleIds.has(item.id) ? movedVisible[next++] : item))
    .map((item, index) => ({ ...item, sort_order: index + 1 }));
}
