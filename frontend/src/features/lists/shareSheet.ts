"use client";

import { useSyncExternalStore } from "react";

// D-129：「送る」は指で操作する端末（スマホ・タブレット）だけに出す。PC は今までどおり「コピー」だけ
const TOUCH_MEDIA = "(pointer: coarse)";

export const SHARE_FAILED_MESSAGE =
  "送れませんでした。「コピー」から送ってください。";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(TOUCH_MEDIA);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function canOpenShareSheet() {
  return (
    typeof navigator.share === "function" &&
    window.matchMedia(TOUCH_MEDIA).matches
  );
}

/** 端末の共有画面（LINE などへ送る画面）を開けるか。サーバーで描くときは出さない */
export function useCanShare() {
  return useSyncExternalStore(subscribe, canOpenShareSheet, () => false);
}

/**
 * 端末の共有画面を開き、文とリンクを渡す（D-129）。
 * 閉じた（送らなかった）ときは "cancelled"、開けなかったときは "failed" を返す。
 */
export async function openShareSheet(
  text: string,
  url: string,
): Promise<"shared" | "cancelled" | "failed"> {
  const data = { text, url };
  if (typeof navigator.canShare === "function" && !navigator.canShare(data)) {
    return "failed";
  }
  try {
    await navigator.share(data);
    return "shared";
  } catch (failure) {
    return failure instanceof DOMException && failure.name === "AbortError"
      ? "cancelled"
      : "failed";
  }
}
