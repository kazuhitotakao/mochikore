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
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-controls={id}
        aria-pressed={visible}
        className="min-h-10 shrink-0 rounded-lg px-2 text-sm text-brand hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-brand"
      >
        {visible ? "パスワードを隠す" : "パスワードを表示"}
      </button>
    </div>
  );
}
