"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

// 行が上下へ移るときの長さ。グループの端まで離れて移るときも、どこへ行ったか目で追える長さにする
const MOVE_DURATION_MS = 300;

type Props = {
  // 並びが変わった行を動かすか。ドラッグ中・並べ替えの保存中は dnd-kit が動かすので false にする
  animate: boolean;
  className: string;
  children: ReactNode;
};

/**
 * D-122（利用者の指示）：繰り返し利用のグループで、チェックしてチェック済みが下へ・外して上へ移るとき、
 * 行を瞬間的に入れ替えず、元の位置から滑らかに動かす。
 * 描くたびに行（li）の位置を覚え、行の順番が入れ替わったときだけ、前の位置から今の位置へ動かす（FLIP）。
 * 持ち物を足した・消した・名前を折り返したなど、順番が変わらないときは動かさない。動きを減らす設定の端末でも動かさない。
 */
export function AnimatedItemList({ animate, className, children }: Props) {
  const ref = useRef<HTMLUListElement>(null);
  // 前に描いたときの、行ごとの一覧の上端からの位置。同じ持ち物の行は React が同じ要素のまま動かす
  const positions = useRef(new Map<Element, number>());

  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    if (!animate) {
      // 動かさない間に変わった並びを、次に描いたときに動かさないよう、覚えた位置を捨てる
      positions.current = new Map();
      return;
    }

    const top = list.getBoundingClientRect().top;
    const rows = Array.from(list.children);
    const next = new Map(
      rows.map((row) => [row, row.getBoundingClientRect().top - top]),
    );
    const previous = positions.current;
    positions.current = next;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const before = Array.from(previous.keys()).filter((row) => next.has(row));
    const after = rows.filter((row) => previous.has(row));
    if (before.every((row, index) => row === after[index])) return;

    for (const row of after) {
      const delta = (previous.get(row) ?? 0) - (next.get(row) ?? 0);
      if (delta === 0) continue;
      row.animate(
        [{ transform: `translateY(${delta}px)` }, { transform: "none" }],
        { duration: MOVE_DURATION_MS, easing: "ease-out" },
      );
    }
  });

  return (
    <ul ref={ref} className={className}>
      {children}
    </ul>
  );
}
