"use client";

// D-110・D-124・D-125：画面の表示の好み（たたんだグループ・リスト、まとめ表示の分割表示）を、この端末のブラウザに覚える。
// 中身（名前など）は入れず、IDや表示の設定だけを入れる。別の端末とは共有しない。
// useSyncExternalStore の subscribe と組み合わせて使い、書き換えたら同じページの画面にも知らせる。

const listeners = new Set<() => void>();
// プライベートブラウズ・容量不足などで保存できなかったときは、ページを開いている間だけここで覚える
const unsaved = new Map<string, string | null>();

export function readStored(key: string): string | null {
  if (unsaved.has(key)) return unsaved.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, raw: string | null) {
  try {
    if (raw === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, raw);
    unsaved.delete(key);
  } catch {
    unsaved.set(key, raw);
  }
  for (const listener of listeners) listener();
}

export function subscribeStored(onChange: () => void) {
  listeners.add(onChange);
  // 同じ画面を別のタブで変えたときも合わせる
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}
