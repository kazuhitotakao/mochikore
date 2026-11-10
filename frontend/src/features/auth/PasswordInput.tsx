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
    <div className="flex gap-2">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        onChange={onChange}
        className="min-w-0 flex-1 rounded border border-zinc-400 px-3 py-2"
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-controls={id}
        aria-pressed={visible}
        className="shrink-0 rounded border border-zinc-400 px-3 py-2 text-sm"
      >
        {visible ? "パスワードを隠す" : "パスワードを表示"}
      </button>
    </div>
  );
}
