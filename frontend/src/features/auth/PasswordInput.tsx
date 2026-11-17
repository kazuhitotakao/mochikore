"use client";

import { useState } from "react";

type Props = {
  id: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  describedBy?: string;
  invalid?: boolean;
  onChange?: () => void;
};

// D-39：確認用の2回入力の代わりに、入力内容を表示して確かめられるようにする
export function PasswordInput({
  id,
  name,
  autoComplete,
  describedBy,
  invalid = false,
  onChange,
}: Props) {
  const [visible, setVisible] = useState(false);

  return (
    // 画面の絵と同じく、切り替えのボタンを入力欄の枠の中に置く。枠全体を1つの入力欄に見せる
    <div className="field flex items-center gap-1 py-0 pr-1">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        onChange={onChange}
        className="min-h-10 min-w-0 flex-1 bg-transparent outline-none"
      />
      {/* D-39：よくある目のアイコンにする。押すと次にどうなるかを形で示す（隠れているときは目、表示中は斜線付きの目）。
          押せる範囲は44px四方にし、上下にはみ出させて枠の高さをほかの入力欄とそろえる（D-73） */}
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-controls={id}
        aria-pressed={visible}
        aria-label={visible ? "パスワードを隠す" : "パスワードを表示"}
        className="-my-0.5 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  );
}
