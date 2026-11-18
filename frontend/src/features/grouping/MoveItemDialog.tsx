"use client";

import { useEffect, useId, useRef } from "react";
import { useBackdropDismiss } from "@/components/useBackdropDismiss";

// 移し先。key が null なら未分類
export type MoveTarget = { key: string | null; name: string };

type Props = {
  itemName: string;
  // 今の所属。null なら未分類
  currentKey: string | null;
  // 画面と同じ順（グループの順、最後に未分類）
  targets: MoveTarget[];
  onMove: (key: string | null) => void;
  // 「やめる」・Esc・外枠を押したとき
  onCancel: () => void;
};

// SC-09-7：持ち物を押したときに、移し先を選ぶ（利用者の指示）。遠くの丸までドラッグしなくても移せるようにする。
// ドラッグと同じく下書きに入れるだけで、「保存」を押すまで保存しない（D-59）。開くたびに作り直すので、親は開いている間だけ表示する
export function MoveItemDialog({
  itemName,
  currentKey,
  targets,
  onMove,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const backdrop = useBackdropDismiss(onCancel);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      {...backdrop}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl bg-background p-6 text-foreground backdrop:bg-overlay/50"
    >
      <div className="flex flex-col gap-4">
        <h2 id={titleId} className="text-lg font-bold wrap-break-word">
          「{itemName}」の移し先
        </h2>
        <ul className="flex flex-col gap-2">
          {targets.map((target) => {
            // 今の所属は選べない。色だけでなく「今ここ」の文字と点線で示す
            const current = target.key === currentKey;
            return (
              <li key={target.key ?? "ungrouped"}>
                <button
                  type="button"
                  disabled={current}
                  onClick={() => onMove(target.key)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border-[1.5px] border-line-strong bg-white px-4 py-3 text-left hover:border-brand disabled:border-dashed disabled:border-line-strong disabled:bg-transparent disabled:text-muted"
                >
                  <span className="min-w-0 wrap-break-word">{target.name}</span>
                  {current && (
                    <span className="shrink-0 text-sm whitespace-nowrap">
                      今ここ
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end">
          <button type="button" onClick={onCancel} className="btn-outline">
            やめる
          </button>
        </div>
      </div>
    </dialog>
  );
}
