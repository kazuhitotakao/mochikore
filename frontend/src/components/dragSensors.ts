"use client";

import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type KeyboardCoordinateGetter,
  type MouseSensorOptions,
  type TouchSensorOptions,
} from "@dnd-kit/core";
import type { MouseEvent, TouchEvent } from "react";

// D-03・D-58（利用者の指示で変更）：持ち物のどこをつかんでも動かせる。
// パソコンは長押しせず、押したまま少し動かしたらすぐ動かし始める
const MOUSE_DISTANCE_PX = 5;
// スマホは0.1秒押してから動かし始める。押してすぐ指を滑らせたときは、画面のスクロールにする
const TOUCH_DELAY_MS = 100;
const TOUCH_TOLERANCE_PX = 5;

// チェック・入力欄・メニューなどから始めた操作はドラッグにせず、押した動きをそのまま使う
function startsOnControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("input, textarea, select, [data-no-drag]") !== null
  );
}

class ItemMouseSensor extends MouseSensor {
  static activators = [
    {
      eventName: "onMouseDown" as const,
      handler: (event: MouseEvent, options: MouseSensorOptions) =>
        !startsOnControl(event.nativeEvent.target) &&
        MouseSensor.activators[0].handler(event, options),
    },
  ];
}

class ItemTouchSensor extends TouchSensor {
  static activators = [
    {
      eventName: "onTouchStart" as const,
      handler: (event: TouchEvent, options: TouchSensorOptions) =>
        !startsOnControl(event.nativeEvent.target) &&
        TouchSensor.activators[0].handler(event, options),
    },
  ];
}

/**
 * 持ち物を動かすときの共通の始め方（SC-07 の並べ替え・SC-09 の分類）。
 * キーボードは、持ち物にカーソルを合わせてスペースキーで持ち上げ、矢印キーで動かす。
 * 矢印キーでどこへ動かすかは、画面ごとに coordinateGetter で決める。
 */
export function useDragSensors(coordinateGetter: KeyboardCoordinateGetter) {
  return useSensors(
    useSensor(ItemMouseSensor, {
      activationConstraint: { distance: MOUSE_DISTANCE_PX },
    }),
    useSensor(ItemTouchSensor, {
      activationConstraint: {
        delay: TOUCH_DELAY_MS,
        tolerance: TOUCH_TOLERANCE_PX,
      },
    }),
    useSensor(KeyboardSensor, { coordinateGetter }),
  );
}
