"use client";

import { useEffect, type RefObject } from "react";

/**
 * 開いているメニュー（「…」で開くもの）を、外を押したとき・Esc キーで閉じる（利用者の指示）。
 * container には、開くボタンとメニューの両方を囲む要素を渡す。開くボタンを押したときは外ではないので、
 * ボタン側の開閉に任せる。Esc で閉じたときは、開くボタン（中の最初のボタン）へカーソルを戻す。
 */
export function useDismiss(
  container: RefObject<HTMLElement | null>,
  open: boolean,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const element = container.current;
      if (element && !element.contains(event.target as Node)) onDismiss();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      onDismiss();
      container.current?.querySelector("button")?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [container, open, onDismiss]);
}
