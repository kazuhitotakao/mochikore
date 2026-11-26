"use client";

import { useLayoutEffect, type RefObject } from "react";

// メニューと画面・入れ物の端との間に空ける幅
const MARGIN_PX = 8;

type Bounds = { top: number; bottom: number; scroller: HTMLElement | null };

/**
 * メニューが見える範囲。見えている画面（キーボードの分を除く）と、一番近いスクロールする入れ物
 * （まとめ表示の分割表示の上下、D-125）の重なる範囲。ページ全体のスクロールは画面として扱う
 */
function visibleBounds(element: HTMLElement): Bounds {
  const viewport = window.visualViewport;
  const viewTop = viewport?.offsetTop ?? 0;
  const viewBottom = viewTop + (viewport?.height ?? window.innerHeight);
  for (
    let node = element.parentElement;
    node && node !== document.body;
    node = node.parentElement
  ) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "visible") continue;
    const rect = node.getBoundingClientRect();
    return {
      top: Math.max(rect.top, viewTop),
      bottom: Math.min(rect.bottom, viewBottom),
      scroller: overflowY === "auto" || overflowY === "scroll" ? node : null,
    };
  }
  return { top: viewTop, bottom: viewBottom, scroller: null };
}

/**
 * D-125：「…」から開くメニューを、下に入りきらないときは上に開く（開くボタンの下より上が広いとき）。
 * 表示する前に測り、メニューに data-up を付ける（React の描き直しの対象にしない属性。見た目は data-up: で変える）。
 * スクロールする入れ物の中では、向きを決めた後も隠れる分だけ、その入れ物の中をスクロールして見せる。
 * menu には開いたメニューの要素、anchor には開くボタンを囲む要素を渡す。
 */
export function useMenuPlacement(
  open: boolean,
  menu: RefObject<HTMLElement | null>,
  anchor: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    const menuElement = menu.current;
    const anchorElement = anchor.current;
    if (!open || !menuElement || !anchorElement) return;
    const bounds = visibleBounds(anchorElement);
    const anchorRect = anchorElement.getBoundingClientRect();
    const below = bounds.bottom - anchorRect.bottom;
    const above = anchorRect.top - bounds.top;
    const height = menuElement.getBoundingClientRect().height + MARGIN_PX;
    menuElement.toggleAttribute("data-up", height > below && above > below);

    const { scroller } = bounds;
    if (!scroller) return;
    const menuRect = menuElement.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    if (menuRect.bottom + MARGIN_PX > scrollerRect.bottom) {
      scroller.scrollTop += menuRect.bottom + MARGIN_PX - scrollerRect.bottom;
    } else if (menuRect.top - MARGIN_PX < scrollerRect.top) {
      scroller.scrollTop -= scrollerRect.top - (menuRect.top - MARGIN_PX);
    }
  }, [open, menu, anchor]);
}
