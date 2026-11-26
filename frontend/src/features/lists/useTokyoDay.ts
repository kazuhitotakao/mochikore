"use client";

import { useEffect, useRef, useState } from "react";
import { msUntilNextTokyoDay, tokyoDayKey } from "./lastChecked";

// 0時ちょうどは端末の時計のずれで前の日のままになることがあるので、少し待ってから確かめる
const AFTER_MIDNIGHT_MARGIN_MS = 3000;

/**
 * D-122：日本時間の今日（「2026-11-25」の形）を返し、日付が変わったら描き直す。
 * 画面を開いたまま0時を過ぎたとき・別のアプリから戻って日付が変わっていたときに、
 * 「前回 今日」を「前回 11/25・1日前」へ変える。チェックは自動では外れないので、リストは読み直さない。
 */
export function useTokyoDay(): string {
  const [day, setDay] = useState(() => tokyoDayKey(new Date()));
  // タイマーの中で、今出している日付と比べるために覚える
  const dayRef = useRef(day);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    function check() {
      const today = tokyoDayKey(new Date());
      if (dayRef.current !== today) {
        dayRef.current = today;
        setDay(today);
      }
      schedule();
    }

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(
        check,
        msUntilNextTokyoDay(new Date()) + AFTER_MIDNIGHT_MARGIN_MS,
      );
    }

    // スマホでは、画面を閉じている間はタイマーが進まないので、戻ったときにも確かめる
    function onVisible() {
      if (document.visibilityState === "visible") check();
    }

    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return day;
}
