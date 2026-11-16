"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useDismiss } from "@/components/useDismiss";

export type CategoryOption<V> = { value: V; label: string };

type Props<V extends string | number | null> = {
  // 開く枠のID。入力エラーのとき、最初のエラーの欄としてカーソルを移す先にもなる（C-04）
  id: string;
  label: string;
  options: CategoryOption<V>[];
  value: V;
  onChange: (value: V) => void;
  // 選んでいるものが選択肢にないときに枠へ出す文
  placeholder?: string;
  disabled?: boolean;
  // 入力エラーの文の要素ID。読み上げではこの文でエラーを伝える（ボタンには aria-invalid を付けられないため）
  describedBy?: string;
  // 入力エラーのとき枠を赤くする。色だけにならないよう、エラーの文は親が describedBy の要素に出す
  invalid?: boolean;
  // 開いている間、親がほかの表示を隠すときに使う（SC-08 は候補の一覧に場所を譲る）
  onOpenChange?: (open: boolean) => void;
};

/**
 * カテゴリーを選ぶ（SC-07-17・SC-08-3・SC-10-4、利用者の指示でブラウザ標準の選択欄から変えた）。
 * 標準の選択欄は開いた一覧をブラウザ・OSが描くため、環境によって項目が小さくなり、アプリ側で大きくできない。
 * 自前の一覧にして、どの端末でも指で押しやすい高さにする。選ぶと閉じ、開いた枠へカーソルを戻す。
 */
export function CategoryPicker<V extends string | number | null>({
  id,
  label,
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
  describedBy,
  invalid = false,
  onOpenChange,
}: Props<V>) {
  const container = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpenState] = useState(false);
  const labelId = useId();
  const valueId = useId();
  const listId = useId();
  const current = options.find((option) => option.value === value);

  function setOpen(next: boolean) {
    setOpenState(next);
    onOpenChange?.(next);
  }

  // 一覧の外を押したとき・Esc で閉じる。Esc のときは開いた枠へカーソルを戻す
  useDismiss(container, open, () => setOpen(false));

  // 開いたら、選んでいるもの（なければ先頭）へカーソルを移す。キーボードでもそこから上下に選べる
  useEffect(() => {
    if (!open) return;
    const selected =
      list.current?.querySelector<HTMLButtonElement>('[aria-current="true"]') ??
      list.current?.querySelector<HTMLButtonElement>("button");
    selected?.focus();
  }, [open]);

  function choose(next: V) {
    if (next !== value) onChange(next);
    setOpen(false);
    toggle.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      // 一覧だけを閉じ、ダイアログの中にあってもダイアログまでは閉じない
      event.preventDefault();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = Array.from(
      list.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    );
    const index = buttons.findIndex(
      (button) => button === document.activeElement,
    );
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    buttons[Math.min(Math.max(next, 0), buttons.length - 1)]?.focus();
  }

  return (
    <div
      ref={container}
      onKeyDown={handleKeyDown}
      className={open ? "flex min-h-0 flex-col" : undefined}
    >
      <span id={labelId} className="mb-1 block font-bold">
        {label}
      </span>
      <button
        ref={toggle}
        id={id}
        type="button"
        disabled={disabled}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-expanded={open}
        aria-controls={listId}
        aria-describedby={describedBy}
        onClick={() => setOpen(!open)}
        data-invalid={invalid}
        className="field flex w-full items-center justify-between gap-3 text-left"
      >
        <span id={valueId} className="min-w-0 wrap-break-word">
          {current?.label ?? placeholder}
        </span>
        <span aria-hidden="true" className="shrink-0 text-sm text-brand">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        // 小さいダイアログでもはみ出さないよう高さに上限を付け、それより多い分は一覧の中でスクロールする
        <ul
          ref={list}
          id={listId}
          aria-labelledby={labelId}
          className="mt-1 max-h-64 min-h-0 divide-y divide-line-soft overflow-y-auto rounded-xl border border-line-strong bg-white"
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <li key={String(option.value)}>
                {/* 選んでいるものは色だけでなく ✓ と太字で示す */}
                <button
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  onClick={() => choose(option.value)}
                  className={`flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left hover:bg-sunken ${selected ? "bg-brand-soft font-bold text-brand-deep" : ""}`}
                >
                  <span aria-hidden="true" className="w-4 shrink-0">
                    {selected ? "✓" : ""}
                  </span>
                  <span className="min-w-0 wrap-break-word">
                    {option.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
