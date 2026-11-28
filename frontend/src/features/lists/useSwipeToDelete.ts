"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { TOUCH_DELAY_MS, TOUCH_TOLERANCE_PX } from "@/components/dragSensors";

// 左に引いたときに右端に出す「削除」の幅（SwipeDeleteLayer の w-20 と同じ）
export const SWIPE_BUTTON_WIDTH = 80;
// 横か縦かを決めるまでに動かす距離
const DIRECTION_PX = 10;
// 行の幅のこの割合より長く引いて離すと、ボタンを押さずに削除する（利用者の指示、D-105）
const LONG_PULL_RATIO = 0.5;
// スワイプの直後に届くクリックを、チェックや名前の編集として受け取らない時間
const SUPPRESS_CLICK_MS = 400;

type Gesture = {
  x: number;
  y: number;
  time: number;
  // 押し始めたときのずれ（開いていた行は -SWIPE_BUTTON_WIDTH）
  base: number;
  mode: "pending" | "swipe" | "none";
  // ドラッグが始まる前（0.1秒以内）に5pxを超えて動いたか
  movedEarly: boolean;
};

type Options = {
  // 行全体（赤い「削除」と中身を囲む要素）。幅と「行の外を押したか」を測るのに使う。
  // 呼び出す側で作って渡し、返す値には入れない（描画中に使う値と ref を分けるため）
  container: RefObject<HTMLDivElement | null>;
  disabled: boolean;
  // 0.1秒押してから動かすと並べ替えが始まる画面か（D-03）。並べ替えのない自分のリスト一覧（SC-05）は false にし、
  // 押してから少し間をおいて引いても横に動かせるようにする（D-120）
  dragOnHold?: boolean;
  // この行が開いている行か。開けるのは1行だけなので、親が持つ
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
};

// 名前を入力している間は、文字の選択・カーソル移動に使うので横に引かない
function startsOnTextInput(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('input:not([type="checkbox"]), textarea') !== null
  );
}

/**
 * D-105（利用者の指示）：スマホで行を左にスワイプすると、右端に赤い「削除」を出す。
 * 長く引いて離したときは、ボタンを押さずに削除する。指（touch）のときだけ受け付け、パソコンは「…」から削除する。
 * 並べ替えのある画面では、ドラッグ（0.1秒押してから動かす、D-03）と取り合わないよう、0.1秒以内に動き始めた横の動きだけをスワイプにする。
 * 縦の動きは画面のスクロールに任せる。
 */
export function useSwipeToDelete({
  container,
  disabled,
  dragOnHold = true,
  open,
  onOpenChange,
  onDelete,
}: Options) {
  const gesture = useRef<Gesture | null>(null);
  const latestOffset = useRef(0);
  const suppressClick = useRef(false);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const isOpen = open && !disabled;
  const offset = dragOffset ?? (isOpen ? -SWIPE_BUTTON_WIDTH : 0);

  // 開いている間に行の外を押したら閉じる
  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: globalThis.PointerEvent) {
      const element = container.current;
      if (element && !element.contains(event.target as Node)) {
        // 04-13：閉じて戻ってくる行（左端のチェック欄・名前）に、この指のクリックが当たることがある。
        // 閉じるだけにして、チェック・名前の編集にしない
        suppressClick.current = true;
        window.setTimeout(() => {
          suppressClick.current = false;
        }, SUPPRESS_CLICK_MS);
        onOpenChange(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [container, isOpen, onOpenChange]);

  function end(released: boolean) {
    const current = gesture.current;
    gesture.current = null;
    if (!current || current.mode !== "swipe") return;

    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, SUPPRESS_CLICK_MS);
    setDragOffset(null);
    // 画面のスクロールなどで取り消されたときは、元の開閉のまま戻す
    if (!released) return;

    const width = container.current?.offsetWidth ?? 0;
    const value = latestOffset.current;
    if (width > 0 && value <= -width * LONG_PULL_RATIO) {
      onOpenChange(false);
      onDelete();
      return;
    }
    onOpenChange(value <= -SWIPE_BUTTON_WIDTH / 2);
  }

  const handlers = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.pointerType !== "touch" || disabled) return;
      if (startsOnTextInput(event.target)) return;
      gesture.current = {
        x: event.clientX,
        y: event.clientY,
        time: event.timeStamp,
        base: isOpen ? -SWIPE_BUTTON_WIDTH : 0,
        mode: "pending",
        movedEarly: false,
      };
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const current = gesture.current;
      if (!current || current.mode === "none") return;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;

      if (current.mode === "pending") {
        const distance = Math.hypot(dx, dy);
        if (!current.movedEarly) {
          if (distance < TOUCH_TOLERANCE_PX) return;
          // 0.1秒動かさずに押していたら、並べ替えのドラッグが始まっているので横に引かない
          if (dragOnHold && event.timeStamp - current.time >= TOUCH_DELAY_MS) {
            current.mode = "none";
            return;
          }
          current.movedEarly = true;
        }
        if (distance < DIRECTION_PX) return;
        if (Math.abs(dx) <= Math.abs(dy)) {
          current.mode = "none";
          return;
        }
        current.mode = "swipe";
        event.currentTarget.setPointerCapture(event.pointerId);
        // ほかに開いている行があれば閉じる
        onOpenChange(true);
      }

      const width = container.current?.offsetWidth ?? 0;
      const next = Math.min(0, Math.max(-width, current.base + dx));
      latestOffset.current = next;
      setDragOffset(next);
    },
    onPointerUp() {
      end(true);
    },
    onPointerCancel() {
      end(false);
    },
    // スワイプの直後のクリックと、開いている行を押したときは、チェック・名前の編集にしないで閉じるだけにする
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (suppressClick.current || isOpen) {
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
        if (isOpen) onOpenChange(false);
      }
    },
  };

  return { offset, swiping: dragOffset !== null, isOpen, handlers };
}
