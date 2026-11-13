"use client";

import { useEffect, useRef, useState } from "react";

// 利用者の指示：チェックしてすぐ消えると、付いたことが分からないので、少しだけ見せてから隠す
export const CHECKED_HIDE_DELAY_MS = 1000;

/**
 * チェック済みを隠している間にチェックを付けた持ち物を、少しの間だけ表示したままにする。
 * 時間が来たら onHide を呼んでから表示から外す（onHide で次のカーソルの位置を決められる）。
 */
export function useDelayedHide(onHide: (itemId: number) => void) {
  const [delayedIds, setDelayedIds] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  // タイマーが動いたときに、最新の描画の状態で判断できるようにする
  const onHideRef = useRef(onHide);
  useEffect(() => {
    onHideRef.current = onHide;
  });

  // 画面を離れたら、残っているタイマーを止める
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  // 取り消しの通信中も行を残すため、表示は変えずにタイマーだけを止める。
  function pauseHide(itemId: number) {
    clearTimeout(timers.current.get(itemId));
    timers.current.delete(itemId);
  }

  function forget(itemId: number) {
    pauseHide(itemId);
    setDelayedIds((current) => {
      if (!current.has(itemId)) return current;
      const next = new Set(current);
      next.delete(itemId);
      return next;
    });
  }

  // チェックを付けた持ち物を、少しの間だけ表示に残す
  function hideLater(itemId: number) {
    clearTimeout(timers.current.get(itemId));
    setDelayedIds((current) => new Set(current).add(itemId));
    timers.current.set(
      itemId,
      setTimeout(() => {
        onHideRef.current(itemId);
        forget(itemId);
      }, CHECKED_HIDE_DELAY_MS),
    );
  }

  return {
    delayedIds,
    hideLater,
    pauseHide,
    cancelHide: forget,
    // stateの描画待ちの間も、1秒の猶予が終わったかを正しく判定する。
    isWaitingToHide: (itemId: number) => timers.current.has(itemId),
  };
}
