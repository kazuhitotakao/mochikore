"use client";

import {
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { SPLIT_DEFAULT_RATIO } from "./useCombinedLayout";

// これより動かさずに離したら、ドラッグではなく押しただけ（ダブルタップの判定に使う）
const TAP_TOLERANCE_PX = 6;
// 2回目を押すまでの時間がこれ以内ならダブルタップ
const DOUBLE_TAP_MS = 350;
// 矢印キー1回で動かす割合
const KEY_STEP = 0.05;
// 見出しにこの距離まで近づけたら、そのリストをたたむ。それまでは指に合わせて動かす（利用者の指示）
const COLLAPSE_NEAR_PX = 24;
// 見出しの高さを測れないときの値（分割表示のリストの見出しの最小の高さ）
const HEAD_FALLBACK_PX = 40;
// ダブルタップ・矢印キーで高さを一度に変えるときに、上下の高さを動かす時間（入れ物の transition と同じ）
const SETTLE_MS = 150;

type Props = {
  // 覚えている上のリストの割合
  ratio: number;
  // 指を離したとき・ダブルタップ・矢印キーで決まった割合。覚える
  onCommit: (ratio: number) => void;
  // 上・下のリストをたたんでいるか
  collapsed: readonly [boolean, boolean];
  // 境界線でリストをたたむ・開く（0 が上、1 が下）
  onCollapse: (pane: 0 | 1, collapsed: boolean) => void;
  // 上下のリストと境界線を入れた領域。ドラッグ中は、ここに割合を直接書いて描き直す
  area: RefObject<HTMLElement | null>;
  // 上のリストの入れ物の id（読み上げで、どこの大きさを変えるかを伝える）
  controls: string;
  // 一時的に隠すとき（キーボードの表示中に入力中のリストだけを広げている・両方のリストをたたんでいる）
  concealed: boolean;
};

function headHeight(area: HTMLElement, pane: 0 | 1) {
  return (
    area.querySelector<HTMLElement>(
      `[data-split-pane="${pane}"] [data-split-head]`,
    )?.offsetHeight || HEAD_FALLBACK_PX
  );
}

/**
 * 上下に使える高さ（領域から境界線を除いた分）と、たたまずに残る最小の高さ（見出し＋たたむまでの距離）、
 * 上のリストの割合の範囲
 */
function measure(area: HTMLElement, divider: HTMLElement) {
  const total = area.clientHeight - divider.offsetHeight;
  const minTop = headHeight(area, 0) + COLLAPSE_NEAR_PX;
  const minBottom = headHeight(area, 1) + COLLAPSE_NEAR_PX;
  // 両方に取れないほど低いときは、真ん中で止める
  if (total <= minTop + minBottom) {
    return { total, minTop, minBottom, min: 0.5, max: 0.5 };
  }
  return {
    total,
    minTop,
    minBottom,
    min: minTop / total,
    max: 1 - minBottom / total,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** ドラッグ中は React で描き直さず、領域の CSS 変数だけを書き換える（2つのリストを毎回描き直さないため） */
function applyRatio(area: HTMLElement, ratio: number) {
  area.style.setProperty("--split-top", String(ratio));
  area.style.setProperty("--split-bottom", String(1 - ratio));
}

/**
 * D-125：まとめ表示の分割表示で、上下のリストの間に置く境界線（SC-20-10）。
 * ドラッグ中は指に合わせて止まらずに動き、離した位置で止まる（決まった位置へ寄せない。寄せると止まっては跳ぶ
 * 動きになる、利用者の指示）。
 * 見出しのすぐ近くまで指に合わせて動き、そこまで近づけるとそのリストをたたみ（見出しだけ）、同じドラッグで戻すと開く
 * （利用者の指示）。たたんだまま指を離したときは、比率を変えない（見出しの矢印で開くと前の高さに戻る）。
 * たたんでいる間も境界線を出し、引けば開く。ダブルタップで、たたんだリストも開いて50%ずつに戻す。
 * 持ち物のドラッグ（dnd-kit）は持ち物の行・グループの見出しからだけ始まり、ここはその外なので、取り合わない。
 * ブラウザのスクロールとも取り合わないよう、touch-action を止め、指を離すまで動きを受け持つ（pointer capture）。
 */
export function SplitDivider({
  ratio,
  onCommit,
  collapsed,
  onCollapse,
  area,
  controls,
  concealed,
}: Props) {
  const drag = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
    total: number;
    minTop: number;
    minBottom: number;
    min: number;
    max: number;
    ratio: number;
    moved: boolean;
    // ドラッグを始めたときに覚えている割合（たたんだまま離したときに戻す）
    base: number;
    // ドラッグ中の、上・下をたたんでいるか（描き直しを待たずに判定するため、ここで持つ）
    collapsed: [boolean, boolean];
  } | null>(null);
  const frame = useRef<number | null>(null);
  const lastTap = useRef(0);
  const settleTimer = useRef<number | null>(null);
  // 少し後で覚える割合（覚えると React で描き直すので、離した直後・高さを動かしている間に描き直さないため）
  const pendingCommit = useRef<{ ratio: number; timer: number } | null>(null);

  function commitLater(value: number) {
    if (pendingCommit.current) clearTimeout(pendingCommit.current.timer);
    const timer = window.setTimeout(() => {
      pendingCommit.current = null;
      onCommit(value);
    }, SETTLE_MS + 50);
    pendingCommit.current = { ratio: value, timer };
  }

  // まだ覚えていない割合があれば、すぐに覚える（次のドラッグを、覚えた割合から始めるため）
  function flushCommit() {
    const pending = pendingCommit.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingCommit.current = null;
    onCommit(pending.ratio);
  }

  // 高さを一度に変えるときだけ、領域に data-settling を付けて上下の高さを短く滑らかに動かす。
  // ドラッグ中は指に遅れないよう、付けない
  function settle(areaElement: HTMLElement) {
    if (settleTimer.current !== null) clearTimeout(settleTimer.current);
    areaElement.dataset.settling = "";
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      delete areaElement.dataset.settling;
    }, SETTLE_MS + 50);
  }

  function stopSettling(areaElement: HTMLElement) {
    if (settleTimer.current !== null) clearTimeout(settleTimer.current);
    settleTimer.current = null;
    delete areaElement.dataset.settling;
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    // マウスは左ボタンだけ。2本目の指は無視する
    if (event.button !== 0 || drag.current) return;
    const areaElement = area.current;
    const top = areaElement?.querySelector<HTMLElement>(
      '[data-split-pane="0"]',
    );
    if (!areaElement || !top) return;
    const { total, minTop, minBottom, min, max } = measure(
      areaElement,
      event.currentTarget,
    );
    stopSettling(areaElement);
    // 覚える前の割合があれば、それが今の割合（描き直しはまだなので、ratio はまだ前の値）
    const base = pendingCommit.current?.ratio ?? ratio;
    flushCommit();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.dataset.active = "";
    drag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: top.getBoundingClientRect().height,
      total,
      minTop,
      minBottom,
      min,
      max,
      ratio: base,
      moved: false,
      base,
      collapsed: [collapsed[0], collapsed[1]],
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    const areaElement = area.current;
    if (!current || current.pointerId !== event.pointerId || !areaElement) {
      return;
    }
    const distance = event.clientY - current.startY;
    if (!current.moved && Math.abs(distance) < TAP_TOLERANCE_PX) return;
    current.moved = true;
    const top = current.startHeight + distance;
    const bottom = current.total - top;
    // 見出しのすぐ近くまで来た側をたたむ（低い画面で両方とも近いときは、指を近づけた側）
    const closeTop = top < current.minTop && top <= bottom;
    const closeBottom = bottom < current.minBottom && bottom < top;
    if (!closeTop && !closeBottom) {
      current.ratio = clamp(top / current.total, current.min, current.max);
    }
    // 開くときは、先に今の位置の割合を書いておく（開いた直後に、覚えている高さで一度描かないように）
    if (
      (current.collapsed[0] && !closeTop) ||
      (current.collapsed[1] && !closeBottom)
    ) {
      applyRatio(areaElement, current.ratio);
    }
    if (current.collapsed[0] !== closeTop) {
      current.collapsed[0] = closeTop;
      onCollapse(0, closeTop);
    }
    if (current.collapsed[1] !== closeBottom) {
      current.collapsed[1] = closeBottom;
      onCollapse(1, closeBottom);
    }
    if (closeTop || closeBottom) return;
    // 描くのは画面の書き換えの合間に1回だけ
    if (frame.current === null) {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (drag.current) applyRatio(areaElement, drag.current.ratio);
      });
    }
  }

  function finish(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    delete event.currentTarget.dataset.active;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    if (current.moved) {
      lastTap.current = 0;
      if (current.collapsed[0] || current.collapsed[1]) {
        // たたんだまま離したときは比率を覚え直さず、ドラッグ中に書いた割合を覚えている値に戻す
        if (area.current) applyRatio(area.current, current.base);
        return;
      }
      if (area.current) applyRatio(area.current, current.ratio);
      commitLater(current.ratio);
      return;
    }
    if (event.type !== "pointerup") return;
    // ダブルタップ（パソコンはダブルクリック）で、たたんだリストも開いて50%ずつに戻す
    if (event.timeStamp - lastTap.current <= DOUBLE_TAP_MS) {
      lastTap.current = 0;
      if (area.current) {
        settle(area.current);
        applyRatio(area.current, SPLIT_DEFAULT_RATIO);
      }
      if (collapsed[0] || collapsed[1]) {
        // たたんだリストを開くときは、どのみち描き直すので、すぐに覚える
        if (collapsed[0]) onCollapse(0, false);
        if (collapsed[1]) onCollapse(1, false);
        onCommit(SPLIT_DEFAULT_RATIO);
      } else {
        commitLater(SPLIT_DEFAULT_RATIO);
      }
    } else {
      lastTap.current = event.timeStamp;
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const areaElement = area.current;
    if (!areaElement) return;
    event.preventDefault();
    const base = pendingCommit.current?.ratio ?? ratio;
    flushCommit();
    // たたんだリストの側へ広げる向きなら、まず開く（高さは前の比率）
    if (event.key === "ArrowDown" && collapsed[0]) {
      onCollapse(0, false);
      return;
    }
    if (event.key === "ArrowUp" && collapsed[1]) {
      onCollapse(1, false);
      return;
    }
    const { min, max } = measure(areaElement, event.currentTarget);
    const step = event.key === "ArrowUp" ? -KEY_STEP : KEY_STEP;
    settle(areaElement);
    onCommit(clamp(clamp(base, min, max) + step, min, max));
  }

  const percent = Math.round(ratio * 100);

  return (
    // 見た目は細い線と中央の短い持ち手だけにし、つかめる範囲は前後の余白に重ねて高さ44pxにする（帯28px＋上下8px）。
    // 下のリストの見出し（z-20）より手前に置き、重ねた部分も境界線として押せるようにする
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="リストの境目"
      aria-controls={controls}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={
        collapsed[0]
          ? "上のリストをたたんでいます"
          : collapsed[1]
            ? "下のリストをたたんでいます"
            : `上のリスト ${percent}%`
      }
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      // 指を離した後にブラウザが送るクリックを止める。ダブルタップで高さが変わると、指の下に来た持ち物の名前などが押されてしまうため
      onTouchEnd={(event) => event.preventDefault()}
      onKeyDown={handleKeyDown}
      className={`group relative z-30 -mx-5 h-7 ${concealed ? "hidden" : "hidden split:flex"} shrink-0 cursor-row-resize touch-none items-center justify-center select-none before:absolute before:inset-x-0 before:-inset-y-2 before:content-[''] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand [-webkit-touch-callout:none]`}
    >
      {/* 上をたたんでいる間は、上の見出しの下の線と2本並ぶので、線を出さず持ち手だけにする */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line ${collapsed[0] ? "hidden" : ""}`}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none relative h-1.5 w-10 rounded-full bg-line-strong transition-colors group-hover:bg-faint group-data-active:bg-brand"
      />
    </div>
  );
}
