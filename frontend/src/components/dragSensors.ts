"use client";

import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type KeyboardCoordinateGetter,
  type MouseSensorOptions,
  type PointerActivationConstraint,
  type SensorProps,
  type TouchSensorOptions,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import type { MouseEvent, TouchEvent } from "react";

// D-03・D-58（利用者の指示で変更）：持ち物のどこをつかんでも動かせる。
// パソコンは長押しせず、押したまま少し動かしたらすぐ動かし始める
const MOUSE_DISTANCE_PX = 5;
// スマホは0.1秒押してから動かし始める。押してすぐ指を滑らせたときは、画面のスクロールにする
const TOUCH_DELAY_MS = 100;
const TOUCH_TOLERANCE_PX = 5;
// D-98：SC-09 の丸は、中の持ち物を動かす操作と分けるため、PC・スマホとも0.3秒押してから動かす
const LONG_PRESS: PointerActivationConstraint = { delay: 300, tolerance: 5 };

// 長押ししてから動かすもの（SC-09 の丸）かどうかを、画面ごとに決める
type LongPressOption = { longPressFor?: (id: UniqueIdentifier) => boolean };

// チェック・入力欄・メニューなどから始めた操作はドラッグにせず、押した動きをそのまま使う
function startsOnControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("input, textarea, select, [data-no-drag]") !== null
  );
}

// dnd-kit は動かし始めるたびにセンサーを作るので、そのときにつかんだ相手を見て始め方を切り替える。
// 同じ種類の操作（マウスを押すなど）を受けるセンサーは1つしか登録できないため、2つに分けない
function withLongPress<
  P extends SensorProps<LongPressOption & MouseSensorOptions>,
>(props: P): P {
  if (!props.options.longPressFor?.(props.active)) return props;
  return {
    ...props,
    options: { ...props.options, activationConstraint: LONG_PRESS },
  };
}

class ItemMouseSensor extends MouseSensor {
  constructor(props: SensorProps<MouseSensorOptions & LongPressOption>) {
    super(withLongPress(props));
  }

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
  constructor(props: SensorProps<TouchSensorOptions & LongPressOption>) {
    super(withLongPress(props));
  }

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
 * longPressFor に当てはまるもの（SC-09 の丸）は、0.3秒押してから動かす（D-98）。
 */
export function useDragSensors(
  coordinateGetter: KeyboardCoordinateGetter,
  longPressFor?: (id: UniqueIdentifier) => boolean,
) {
  return useSensors(
    useSensor(ItemMouseSensor, {
      activationConstraint: { distance: MOUSE_DISTANCE_PX },
      longPressFor,
    }),
    useSensor(ItemTouchSensor, {
      activationConstraint: {
        delay: TOUCH_DELAY_MS,
        tolerance: TOUCH_TOLERANCE_PX,
      },
      longPressFor,
    }),
    useSensor(KeyboardSensor, { coordinateGetter }),
  );
}
