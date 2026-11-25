"use client";

import { useEffect, useId, useRef } from "react";
import { useBackdropDismiss } from "@/components/useBackdropDismiss";

// 移し先。key が null なら未分類
export type MoveTarget = { key: string | null; name: string };

type Props = {
  // 見出し。1件なら「（持ち物名）」の移し先、2件以上は「選んだ持ち物（n件）の移し先」（D-112）
  title: string;
  // 今の所属。null なら未分類。選んだ持ち物の所属がばらばらのときは undefined（どれも押せる）
  currentKey: string | null | undefined;
  // 画面と同じ順（グループの順、最後に未分類）
  targets: MoveTarget[];
  onMove: (key: string | null) => void;
  // 「キャンセル」・Esc・外枠を押したとき
  onCancel: () => void;
};

// SC-09-13：選んだ持ち物を、画面下の「移し先を選ぶ」から移す（D-58・D-112、利用者の指示）。遠くの丸までドラッグしなくても移せるようにする。
// ドラッグと同じく下書きに入れるだけで、画面を離れるときにまとめて保存する（D-59・D-113）。開くたびに作り直すので、親は開いている間だけ表示する
export function MoveItemDialog({
  title,
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
          {title}
        </h2>
        <ul className="flex flex-col gap-2">
          {targets.map((target) => {
            // 今の所属は選べない。色だけでなく「今ここ」の文字と点線で示す
            const current =
              currentKey !== undefined && target.key === currentKey;
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
            キャンセル
          </button>
        </div>
      </div>
    </dialog>
  );
}
