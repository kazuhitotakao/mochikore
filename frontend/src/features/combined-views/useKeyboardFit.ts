"use client";

import { useEffect, useState, type RefObject } from "react";
import { SPLIT_MIN_PANE_PX } from "./useCombinedLayout";

// 見えている高さがこれ以上減ったら、画面のキーボードが出ていると見なす（ブラウザの帯の出入りより大きい値）
const KEYBOARD_MIN_PX = 120;
// 境界線の帯の高さ（SplitDivider の h-7）
const DIVIDER_PX = 28;

/** 上下とも出したままにするのに要る高さ。開いているリストは最小の高さ（160px）、たたんだリストは見出しの高さ */
function neededHeight(area: HTMLElement | null): number {
  if (!area) return SPLIT_MIN_PANE_PX * 2;
  return [...area.querySelectorAll<HTMLElement>("[data-split-pane]")].reduce(
    (sum, pane) =>
      sum +
      (pane.hasAttribute("data-collapsed")
        ? (pane.querySelector<HTMLElement>("[data-split-head]")?.offsetHeight ??
          0)
        : SPLIT_MIN_PANE_PX),
    0,
  );
}

/**
 * D-125：分割表示の間、画面のキーボードが出たら、上下のリストをキーボードの上の見えている範囲に収める。
 * iPhone の Safari などはキーボードが出ても画面の高さが変わらないので、見えている範囲（visualViewport）に
 * 画面（root、position: fixed）の位置と高さを合わせる（CSS 変数 --split-viewport-top・--split-viewport-height）。
 * その範囲で上下とも最小の高さ（たたんだリストは見出しの高さ）を取れないときは、入力中のリスト（data-split-pane）の番号を返し、そのリストだけを広げる。
 * キーボードを閉じたら元に戻す。覚えている表示方法・比率は変えず、部品も作り直さない（入力中の文字を残す）。
 */
export function useKeyboardFit(
  active: boolean,
  root: RefObject<HTMLElement | null>,
  area: RefObject<HTMLElement | null>,
): number | null {
  const [expandedPane, setExpandedPane] = useState<number | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    const rootElement = root.current;
    if (!active || !viewport || !rootElement) return;
    let frame: number | null = null;

    const release = () => {
      rootElement.style.removeProperty("--split-viewport-top");
      rootElement.style.removeProperty("--split-viewport-height");
    };

    const update = () => {
      frame = null;
      // 指で拡大しているときも見えている高さが減るので、拡大していないときだけキーボードと見なす
      const keyboard =
        viewport.scale < 1.01 &&
        window.innerHeight - viewport.height >= KEYBOARD_MIN_PX;
      if (!keyboard) {
        release();
        setExpandedPane(null);
        return;
      }
      rootElement.style.setProperty(
        "--split-viewport-top",
        `${viewport.offsetTop}px`,
      );
      rootElement.style.setProperty(
        "--split-viewport-height",
        `${viewport.height}px`,
      );
      // 高さを合わせた後の、上下に使える高さ（読むときに配置を計算し直す）
      const areaElement = area.current;
      const room = (areaElement?.clientHeight ?? 0) - DIVIDER_PX;
      if (room >= neededHeight(areaElement)) {
        setExpandedPane(null);
        return;
      }
      const pane =
        document.activeElement instanceof HTMLElement
          ? document.activeElement.closest<HTMLElement>("[data-split-pane]")
          : null;
      setExpandedPane(pane ? Number(pane.dataset.splitPane) : null);
    };

    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(update);
    };

    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    // 入力欄を移ったときも、広げるリストを選び直す
    document.addEventListener("focusin", schedule);
    schedule();
    return () => {
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", schedule);
      if (frame !== null) cancelAnimationFrame(frame);
      release();
      setExpandedPane(null);
    };
  }, [active, root, area]);

  return expandedPane;
}
