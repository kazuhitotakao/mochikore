"use client";

import { useCallback, useSyncExternalStore } from "react";
import { readStored, subscribeStored, writeStored } from "@/lib/deviceMemory";

// D-125：分割表示を使える画面（スマホ幅で、高さが足りるとき）。globals.css の can-split・split と同じ条件にする
export const SPLIT_MEDIA = "(width < 64rem) and (height >= 30rem)";
// 分割表示にするのは、表示できるリストがちょうど2件のときだけ
export const SPLIT_LIST_COUNT = 2;
// キーボードが出ているとき、上下とも出したままにするのに要る高さ（見出しと持ち物2行ほどが見え、操作できる大きさ）。
// 境界線のドラッグでは、これより小さくしてもよい（見出しの近くまで動かすとたたむ）
export const SPLIT_MIN_PANE_PX = 160;
export const SPLIT_DEFAULT_RATIO = 0.5;

export type CombinedLayout = {
  // 分割表示を選んでいるか（通常表示を選んだら false）
  split: boolean;
  // 上のリストの高さの割合（上下の合計に対して）
  ratio: number;
};

const KEY_PREFIX = "mochikore:combined-layout:";
// 初めて開いたときは分割表示で、上下50%ずつ（利用者の指示）
const DEFAULT_LAYOUT: CombinedLayout = {
  split: true,
  ratio: SPLIT_DEFAULT_RATIO,
};

// useSyncExternalStore は同じ値なら同じオブジェクトを求めるので、読んだ文字列ごとに控える
const parsed = new Map<
  string,
  { raw: string | null; layout: CombinedLayout }
>();

// 書き換えられた値でも画面が壊れないよう、決まった形だけを使い、ほかは初めの値にする
function parseLayout(raw: string | null): CombinedLayout {
  if (!raw) return DEFAULT_LAYOUT;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return DEFAULT_LAYOUT;
    const { mode, ratio } = value as Record<string, unknown>;
    if (mode !== "split" && mode !== "normal") return DEFAULT_LAYOUT;
    return {
      split: mode === "split",
      ratio:
        typeof ratio === "number" && ratio > 0 && ratio < 1
          ? ratio
          : SPLIT_DEFAULT_RATIO,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function readLayout(key: string): CombinedLayout {
  const raw = readStored(key);
  const cached = parsed.get(key);
  if (cached && cached.raw === raw) return cached.layout;
  const layout = parseLayout(raw);
  parsed.set(key, { raw, layout });
  return layout;
}

/**
 * D-125：まとめ表示ごとの表示方法（分割・通常）と上下の比率。この端末のブラウザに覚える（D-110 と同じ考え方）。
 * サーバーでの表示は初めの値（分割表示・50%）で描き、覚えた値は表示の後に反映する。
 * 画面の大きさやキーボードで一時的に変わる表示は、ここには書かない（覚えた値を変えない）。
 */
export function useCombinedLayout(viewId: number) {
  const key = `${KEY_PREFIX}${viewId}`;
  const layout = useSyncExternalStore(
    subscribeStored,
    () => readLayout(key),
    () => DEFAULT_LAYOUT,
  );

  const save = useCallback(
    (next: CombinedLayout) =>
      writeStored(
        key,
        JSON.stringify({
          mode: next.split ? "split" : "normal",
          ratio: next.ratio,
        }),
      ),
    [key],
  );

  return { layout, save };
}

function subscribeSplitMedia(onChange: () => void) {
  const query = window.matchMedia(SPLIT_MEDIA);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * D-125：今の画面が分割表示を使える大きさか。画面の形（上下の領域）は CSS（split:）で決めるので、
 * ここで分かった値は、ドラッグの範囲やキーボードへの対応など、表示の後に動く処理だけに使う
 */
export function useSplitCapable(): boolean {
  return useSyncExternalStore(
    subscribeSplitMedia,
    () => window.matchMedia(SPLIT_MEDIA).matches,
    () => false,
  );
}
