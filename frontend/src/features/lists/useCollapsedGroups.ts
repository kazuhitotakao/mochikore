"use client";

import { useSyncExternalStore } from "react";

// D-110：SC-07 でたたんだグループを、この端末のブラウザにリストごとに覚える（利用者の指示）。
// 覚えるのはグループのIDだけで、名前などリストの中身は入れない。別の端末とは共有しない
const KEY_PREFIX = "mochikore:collapsed-groups:";
const NONE: readonly number[] = [];

const listeners = new Set<() => void>();
// useSyncExternalStore は同じ値なら同じ配列を求めるので、読んだ文字列ごとに控える
const parsed = new Map<
  string,
  { raw: string | null; ids: readonly number[] }
>();
// プライベートブラウズ・容量不足などで保存できなかったときは、ページを開いている間だけここで覚える
const unsaved = new Map<string, string | null>();

function storageKey(listId: number): string {
  return `${KEY_PREFIX}${listId}`;
}

function readRaw(key: string): string | null {
  if (unsaved.has(key)) return unsaved.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, raw: string | null) {
  try {
    if (raw === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, raw);
    unsaved.delete(key);
  } catch {
    unsaved.set(key, raw);
  }
  for (const listener of listeners) listener();
}

// 書き換えられた値でも画面が壊れないよう、1以上の整数だけを使う
function parseIds(raw: string | null): readonly number[] {
  if (!raw) return NONE;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return NONE;
    return value.filter(
      (id): id is number => Number.isSafeInteger(id) && id > 0,
    );
  } catch {
    return NONE;
  }
}

function readIds(key: string): readonly number[] {
  const raw = readRaw(key);
  const cached = parsed.get(key);
  if (cached && cached.raw === raw) return cached.ids;
  const ids = parseIds(raw);
  parsed.set(key, { raw, ids });
  return ids;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // 同じリストを別のタブでたたんだ・開いたときも合わせる
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * D-110：たたんだグループのIDと、たたむ・開く操作。
 * サーバーでの表示はすべて開いた状態にし、ブラウザで覚えた分は表示の後に反映する。
 * 今のリストにないグループ（削除したもの）のIDは使わず、次にたたむ・開くときに消す。
 */
export function useCollapsedGroups(
  listId: number,
  groupIds: readonly number[],
) {
  const key = storageKey(listId);
  const stored = useSyncExternalStore(
    subscribe,
    () => readIds(key),
    () => NONE,
  );
  const collapsed = new Set(stored.filter((id) => groupIds.includes(id)));

  function toggle(groupId: number) {
    const next = collapsed.has(groupId)
      ? [...collapsed].filter((id) => id !== groupId)
      : [...collapsed, groupId];
    writeRaw(key, next.length > 0 ? JSON.stringify(next) : null);
  }

  return { collapsed, toggle };
}
