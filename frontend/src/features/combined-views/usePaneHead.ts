"use client";

import { useLayoutEffect, type RefObject } from "react";

/**
 * D-125：分割表示の上下それぞれで、リストの見出し（data-split-head）の高さを測り、入れ物（data-split-pane）の
 * CSS 変数 --pane-head に書く。入れ物はこれを最小の高さにする。境界線で見出しの近くまで小さくしたときや、
 * 画面下の通知・キーボードで上下が縮んだときも、見出しを隠さないため（長いリスト名は2行になるので測る）。
 * shown には、上下に出しているものが変わったときに変わる値（並び・作り直し・たたんだリスト）を渡す。
 */
export function usePaneHead(
  active: boolean,
  area: RefObject<HTMLElement | null>,
  shown: string,
) {
  useLayoutEffect(() => {
    const areaElement = area.current;
    if (!active || !areaElement) return;
    const panes = [
      ...areaElement.querySelectorAll<HTMLElement>("[data-split-pane]"),
    ];

    const update = () => {
      for (const pane of panes) {
        const head = pane.querySelector<HTMLElement>("[data-split-head]");
        if (head)
          pane.style.setProperty("--pane-head", `${head.offsetHeight}px`);
      }
    };

    // 描く前に測る。後の変化（名前の変更・画面幅での折り返し）は大きさの変化で受ける
    update();
    const observer = new ResizeObserver(update);
    for (const pane of panes) {
      const head = pane.querySelector<HTMLElement>("[data-split-head]");
      if (head) observer.observe(head);
    }
    return () => {
      observer.disconnect();
      for (const pane of panes) pane.style.removeProperty("--pane-head");
    };
  }, [active, area, shown]);
}
