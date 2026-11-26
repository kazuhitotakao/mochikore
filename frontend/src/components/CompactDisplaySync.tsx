"use client";

import { useLayoutEffect } from "react";
import {
  COMPACT_DISPLAY_ATTRIBUTE,
  COMPACT_DISPLAY_KEY,
  COMPACT_DISPLAY_ON,
} from "@/lib/compactDisplay";
import { readStored, subscribeStored } from "@/lib/deviceMemory";

/**
 * D-126：コンパクト表示の印（<html> の data-compact）を、覚えた値に合わせ続ける。画面には何も出さない。
 * 開いたときの印は layout.tsx の <head> の文が付ける。ここでは、アカウント設定（SC-12）や別のタブで切り替えたときに
 * 付け外しする。開発中は React が確認のために部品を作り直し、<html> の印を消すので、描く前に付け直す役目もある。
 */
export function CompactDisplaySync() {
  useLayoutEffect(() => {
    const apply = () =>
      document.documentElement.toggleAttribute(
        COMPACT_DISPLAY_ATTRIBUTE,
        readStored(COMPACT_DISPLAY_KEY) === COMPACT_DISPLAY_ON,
      );
    apply();
    return subscribeStored(apply);
  }, []);

  return null;
}
