"use client";

import { useId, useSyncExternalStore } from "react";
import { SwitchIndicator } from "@/components/SwitchIndicator";
import { COMPACT_DISPLAY_KEY, COMPACT_DISPLAY_ON } from "@/lib/compactDisplay";
import { readStored, subscribeStored, writeStored } from "@/lib/deviceMemory";
import { SettingRow } from "./SettingRow";

/**
 * SC-12-11・D-126：コンパクト表示のスイッチ。オンにすると、自分のリストの内容（SC-07）とまとめ表示（SC-20）の
 * 持ち物の行と文字を詰める。この端末のブラウザに覚えるだけで、通信しない。
 * 印の付け外しは CompactDisplaySync が覚えた値を見て行うので、ここでは値を書くだけにする。
 */
export function CompactDisplaySetting() {
  const titleId = useId();
  const descriptionId = useId();
  // サーバーでの表示はオフ（初めの値）にし、覚えた値は表示の後に反映する
  const on = useSyncExternalStore(
    subscribeStored,
    () => readStored(COMPACT_DISPLAY_KEY) === COMPACT_DISPLAY_ON,
    () => false,
  );

  return (
    <SettingRow
      title="コンパクト表示"
      titleId={titleId}
      action={
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          onClick={() =>
            writeStored(COMPACT_DISPLAY_KEY, on ? null : COMPACT_DISPLAY_ON)
          }
          className="flex min-h-11 shrink-0 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <SwitchIndicator on={on} />
        </button>
      }
    >
      <p id={descriptionId} className="text-sm text-muted">
        持ち物の行と文字を小さくして、一度に多く見せます。
      </p>
    </SettingRow>
  );
}
