"use client";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { useDismiss } from "@/components/useDismiss";
import type { Category } from "@/types/api";

type Props = {
  categories: Category[];
  value: number;
  onChange: (categoryId: number) => void;
  // 開いている間は親が候補の一覧を隠し、その場所を使う（小さいスマホでもパネルからはみ出さないため）
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * SC-08-3：候補のカテゴリーを切り替える（利用者の指示で、ブラウザ標準の選択欄から変えた）。
 * 標準の選択欄は開いた一覧をブラウザ・OSが描くため、環境によって項目が小さくなり、アプリ側で大きくできない。
 * 自前の一覧にして、どの端末でも指で押しやすい高さにする。選ぶと閉じ、開いたボタンへカーソルを戻す。
 */
export function CategoryPicker({
  categories,
  value,
  onChange,
  open,
  onOpenChange,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const labelId = useId();
  const valueId = useId();
  const listId = useId();
  const current = categories.find((category) => category.id === value);

  // 一覧の外を押したとき・Esc で閉じる。Esc のときは開いたボタンへカーソルを戻す
  useDismiss(container, open, () => onOpenChange(false));

  // 開いたら、選んでいるカテゴリーへカーソルを移す。キーボードでもそこから上下に選べる
  useEffect(() => {
    if (!open) return;
    list.current
      ?.querySelector<HTMLButtonElement>('[aria-current="true"]')
      ?.focus();
  }, [open]);

  function choose(categoryId: number) {
    if (categoryId !== value) onChange(categoryId);
    onOpenChange(false);
    toggle.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      // 一覧だけを閉じ、パネル（dialog）までは閉じない
      event.preventDefault();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const options = Array.from(
      list.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    );
    const index = options.findIndex(
      (option) => option === document.activeElement,
    );
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    options[Math.min(Math.max(next, 0), options.length - 1)]?.focus();
  }

  return (
    <div
      ref={container}
      onKeyDown={handleKeyDown}
      className={open ? "flex min-h-0 flex-col" : undefined}
    >
      <span id={labelId} className="block font-medium">
        カテゴリー
      </span>
      <button
        ref={toggle}
        type="button"
        aria-labelledby={`${labelId} ${valueId}`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center justify-between gap-3 rounded border border-zinc-400 px-3 py-2 text-left"
      >
        <span id={valueId} className="min-w-0 wrap-break-word">
          {current?.name}
        </span>
        <span aria-hidden="true" className="shrink-0 text-sm">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <ul
          ref={list}
          id={listId}
          aria-labelledby={labelId}
          className="mt-1 min-h-0 divide-y divide-zinc-200 overflow-y-auto rounded border border-zinc-400"
        >
          {categories.map((category) => {
            const selected = category.id === value;
            return (
              <li key={category.id}>
                {/* 選んでいるものは色だけでなく ✓ と太字で示す */}
                <button
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  onClick={() => choose(category.id)}
                  className={`flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-500/10 ${selected ? "font-bold" : ""}`}
                >
                  <span aria-hidden="true" className="w-4 shrink-0">
                    {selected ? "✓" : ""}
                  </span>
                  <span className="min-w-0 wrap-break-word">
                    {category.name}
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
