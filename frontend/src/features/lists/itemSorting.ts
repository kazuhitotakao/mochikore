"use client";

import type {
  Announcements,
  ClientRect,
  Collision,
  CollisionDetection,
  DroppableContainer,
  Modifier,
  ScreenReaderInstructions,
  UniqueIdentifier,
} from "@dnd-kit/core";
import { closestCenter } from "@dnd-kit/core";
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

// D-111：行の高さのうち、上下それぞれこの割合の端に入ったら並べ替え、残りの真ん中なら重ねてグループにする
const COMBINE_EDGE_RATIO = 0.25;

type CombineData = { combineWith: number };

/**
 * D-111：持ち物を重ねている相手（未分類の持ち物のID）。重ねていなければ null。
 * 相手の判定（detectUngroupedTarget）が、並べ替えの相手と一緒に返す。
 */
export function combineTargetOf(collisions: Collision[] | null): number | null {
  const data = collisions?.[0]?.data as Partial<CombineData> | undefined;
  return typeof data?.combineWith === "number" ? data.combineWith : null;
}

/**
 * D-111・D-98：未分類の欄で持ち物を動かしているときの相手。位置は、周りの行をずらす前の元の位置で比べる。
 * 動かしている行の中心が、ほかの持ち物の行の真ん中にあれば、その持ち物に重ねる（周りの行は動かさない）。
 * 並べ替えの相手は、行の端（下へ動かすときは下の端、上へは上の端）まで入ったときに変える。
 * 境目で入れ替えると、真ん中へ届く前に相手の行がずれて逃げるため。重ねる相手はまだずれていないので、見た目の位置と同じになる。
 */
export function detectUngroupedTarget(
  args: Parameters<CollisionDetection>[0],
  targets: DroppableContainer[],
): Collision[] {
  const { active, collisionRect, droppableRects } = args;
  const y = collisionRect.top + collisionRect.height / 2;
  const rows = targets.flatMap((container) => {
    const rect = droppableRects.get(container.id);
    return container.id !== active.id && rect
      ? [{ id: container.id, rect }]
      : [];
  });
  const edge = (rect: ClientRect) => rect.height * COMBINE_EDGE_RATIO;
  const combine = rows.find(
    ({ rect }) => y >= rect.top + edge(rect) && y <= rect.bottom - edge(rect),
  );
  const data = combine ? { combineWith: Number(combine.id) } : undefined;

  const activeRect = targets.some((container) => container.id === active.id)
    ? droppableRects.get(active.id)
    : undefined;
  if (!activeRect) {
    // 別のグループから入ってきた直後。重ねているときは元の場所のまま待ち、未分類の行をずらさない
    if (combine) return [{ id: active.id, data }];
    return closestCenter({ ...args, droppableContainers: targets });
  }

  // 下の行は上から、上の行は近い順に見て、端まで入った最も遠い行を相手にする。どこにも入っていなければ元の場所
  let overId: UniqueIdentifier = active.id;
  const below = rows
    .filter(({ rect }) => rect.top > activeRect.top)
    .sort((a, b) => a.rect.top - b.rect.top);
  for (const { id, rect } of below) {
    if (y > rect.bottom - edge(rect)) overId = id;
  }
  const above = rows
    .filter(({ rect }) => rect.top < activeRect.top)
    .sort((a, b) => b.rect.top - a.rect.top);
  for (const { id, rect } of above) {
    if (y < rect.top + edge(rect)) overId = id;
  }
  return [{ id: overId, data }];
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
