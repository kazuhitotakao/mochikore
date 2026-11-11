"use client";

import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type Modifier,
  type ScreenReaderInstructions,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { PackingListItem } from "@/types/api";

// D-03：「≡」を長押ししてから動かす。押している間に指やマウスが少し動いたら、並べ替えを始めない
const LONG_PRESS_MS = 250;
const LONG_PRESS_TOLERANCE_PX = 5;

/**
 * 指・マウスは長押し、キーボードはスペースで持ち上げて矢印キーで動かす。
 */
export function useItemSortSensors() {
  return useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: LONG_PRESS_MS,
        tolerance: LONG_PRESS_TOLERANCE_PX,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
}

// 上下だけに動かし、横にはずれないようにする
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

// 画面読み上げで伝える文。dnd-kit の既定は英語なので、日本語にする
export const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "並べ替えるときは、スペースキーで持ち上げ、上下の矢印キーで動かし、スペースキーで置きます。Escキーでやめます。",
};

export function itemSortAnnouncements(items: PackingListItem[]): Announcements {
  const nameOf = (id: UniqueIdentifier) =>
    items.find((item) => item.id === id)?.name ?? "";
  const positionOf = (id: UniqueIdentifier) =>
    items.findIndex((item) => item.id === id) + 1;

  return {
    onDragStart: ({ active }) => `${nameOf(active.id)}を持ち上げました。`,
    onDragOver: ({ active, over }) =>
      over
        ? `${nameOf(active.id)}を${positionOf(over.id)}番目へ動かしています。`
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)}を${positionOf(over.id)}番目に置きました。`
        : `${nameOf(active.id)}を元の位置に戻しました。`,
    onDragCancel: ({ active }) =>
      `${nameOf(active.id)}の並べ替えをやめました。`,
  };
}
