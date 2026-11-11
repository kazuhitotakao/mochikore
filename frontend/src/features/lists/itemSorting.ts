"use client";

import type {
  Announcements,
  Modifier,
  ScreenReaderInstructions,
  UniqueIdentifier,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useDragSensors } from "@/components/dragSensors";
import type { PackingListGroup, PackingListItem } from "@/types/api";

/**
 * D-03：行のどこをつかんでも並べ替えられる。キーボードは行にカーソルを合わせ、
 * スペースで持ち上げて上下の矢印キーで動かす。
 */
export function useItemSortSensors() {
  return useDragSensors(sortableKeyboardCoordinates);
}

// D-98：グループの区切りもドラッグの相手になるので、持ち物のID（数）と分けた文字のIDにする
const SECTION_PREFIX = "section-";
const UNGROUPED = "ungrouped";

export function sectionId(groupId: number | null): string {
  return `${SECTION_PREFIX}${groupId ?? UNGROUPED}`;
}

export function isSectionId(id: UniqueIdentifier): id is string {
  return typeof id === "string" && id.startsWith(SECTION_PREFIX);
}

// 区切りのIDから、グループのID（未分類は null）を取り出す
export function groupIdOfSection(id: string): number | null {
  const rest = id.slice(SECTION_PREFIX.length);
  return rest === UNGROUPED ? null : Number(rest);
}

// 上下だけに動かし、横にはずれないようにする
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

// 画面読み上げで伝える文。dnd-kit の既定は英語なので、日本語にする
export const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "並べ替えるときは、持ち物の行（またはグループの見出し）でスペースキーを押して持ち上げ、上下の矢印キーで動かし、スペースキーで置きます。Escキーでやめます。",
};

export function itemSortAnnouncements(
  items: PackingListItem[],
  groups: PackingListGroup[],
): Announcements {
  const groupName = (id: string) => {
    const groupId = groupIdOfSection(id);
    return groupId === null
      ? "未分類"
      : (groups.find((group) => group.id === groupId)?.name ?? "");
  };
  const nameOf = (id: UniqueIdentifier) =>
    isSectionId(id)
      ? `「${groupName(id)}」`
      : (items.find((item) => item.id === id)?.name ?? "");
  // 持ち物の上なら何番目か、グループの区切りの上ならそのグループ
  const placeOf = (id: UniqueIdentifier) =>
    isSectionId(id)
      ? `「${groupName(id)}」`
      : `${items.findIndex((item) => item.id === id) + 1}番目`;

  return {
    onDragStart: ({ active }) => `${nameOf(active.id)}を持ち上げました。`,
    onDragOver: ({ active, over }) =>
      over
        ? `${nameOf(active.id)}を${placeOf(over.id)}へ動かしています。`
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)}を${placeOf(over.id)}に置きました。`
        : `${nameOf(active.id)}を元の位置に戻しました。`,
    onDragCancel: ({ active }) =>
      `${nameOf(active.id)}の並べ替えをやめました。`,
  };
}
