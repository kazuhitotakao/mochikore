"use client";

import { useLayoutEffect, type RefObject } from "react";

// D-125：分割表示の上下それぞれのスクロール位置（「まとめ表示のID:リストのID」ごと）。
// アプリを開いている間だけ覚え、ブラウザには保存しない（開き直したら一番上から）
const positions = new Map<string, number>();

/**
 * D-125：分割表示の上下それぞれのスクロール位置を覚え、そのリストを出し直したときに同じ位置へ戻す。
 * 上下の中のスクロールはブラウザが覚えないので、戻さないと、リスト名から SC-07 を開いて「←」で戻ったとき・
 * たたんで開いたとき・通常表示から戻したとき・読み直して部品を作り直したときに、一番上へ戻ってしまう。
 * 位置はリストごとに覚えるので、上下を入れ替えてもリストについて動く。
 * area には上下のリスト（data-split-pane・data-list-id）を入れた領域を、shown には上下に出しているものが
 * 変わったときに変わる値（並び・作り直し・たたんだリスト・キーボードで広げているリスト）を渡す。
 */
export function useSplitScrollMemory(
  active: boolean,
  area: RefObject<HTMLElement | null>,
  viewId: number,
  shown: string,
) {
  useLayoutEffect(() => {
    const areaElement = area.current;
    if (!active || !areaElement) return;

    const keyOf = (scroller: HTMLElement) => {
      const listId =
        scroller.closest<HTMLElement>("[data-split-pane]")?.dataset.listId;
      return listId ? `${viewId}:${listId}` : null;
    };

    // 描く前に戻す（一番上が一瞬見えないように）。隠しているリストは、出したときにもう一度ここを通る
    for (const scroller of areaElement.querySelectorAll<HTMLElement>(
      "[data-split-scroll]",
    )) {
      const key = keyOf(scroller);
      const saved = key === null ? undefined : positions.get(key);
      if (saved !== undefined) scroller.scrollTop = saved;
    }

    const remember = (event: Event) => {
      const target = event.target;
      if (
        !(target instanceof HTMLElement) ||
        !target.hasAttribute("data-split-scroll")
      ) {
        return;
      }
      const key = keyOf(target);
      if (key !== null) positions.set(key, target.scrollTop);
    };
    // 中のスクロールは親へ伝わらないので、領域では捕まえる段階で受ける
    areaElement.addEventListener("scroll", remember, {
      capture: true,
      passive: true,
    });
    return () =>
      areaElement.removeEventListener("scroll", remember, { capture: true });
  }, [active, area, viewId, shown]);
}
