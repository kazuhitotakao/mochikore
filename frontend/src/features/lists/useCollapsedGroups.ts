"use client";

import { useSyncExternalStore } from "react";
import { readStored, subscribeStored, writeStored } from "@/lib/deviceMemory";

// D-110：SC-07 でたたんだグループを、この端末のブラウザにリストごとに覚える（利用者の指示）。
// 覚えるのはグループのIDだけで、名前などリストの中身は入れない。別の端末とは共有しない。
// D-124：まとめ表示（SC-20）でたたんだリストも、同じ仕組みでまとめ表示ごとにリストのIDを覚える
const KEY_PREFIX = "mochikore:collapsed-groups:";
const COMBINED_KEY_PREFIX = "mochikore:collapsed-lists:";
const NONE: readonly number[] = [];

// useSyncExternalStore は同じ値なら同じ配列を求めるので、読んだ文字列ごとに控える
const parsed = new Map<
  string,
  { raw: string | null; ids: readonly number[] }
>();

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
  const raw = readStored(key);
  const cached = parsed.get(key);
  if (cached && cached.raw === raw) return cached.ids;
  const ids = parseIds(raw);
  parsed.set(key, { raw, ids });
  return ids;
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
  return useCollapsedIds(`${KEY_PREFIX}${listId}`, groupIds);
}

/**
 * D-124：まとめ表示（SC-20）でたたんだリストのIDと、たたむ・開く操作。グループ（D-110）と同じ覚え方。
 * まとめ表示から外したリストのIDは使わず、次にたたむ・開くときに消す。
 */
export function useCollapsedLists(viewId: number, listIds: readonly number[]) {
  return useCollapsedIds(`${COMBINED_KEY_PREFIX}${viewId}`, listIds);
}

function useCollapsedIds(key: string, currentIds: readonly number[]) {
  const stored = useSyncExternalStore(
    subscribeStored,
    () => readIds(key),
    () => NONE,
  );
  const collapsed = new Set(stored.filter((id) => currentIds.includes(id)));

  // D-125：描いたときの値ではなく、今覚えている値から作る。まとめ表示では、描き直していないリストの部品
  // （CombinedPane）からも呼び、分割表示の境界線のドラッグでは描き直しを待たずに続けて呼ぶため
  function toggle(id: number) {
    set(id, !readIds(key).includes(id));
  }

  // D-125：たたむ・開くを決めて書く
  function set(id: number, value: boolean) {
    const current = readIds(key).filter((existing) =>
      currentIds.includes(existing),
    );
    if (current.includes(id) === value) return;
    const next = value
      ? [...current, id]
      : current.filter((existing) => existing !== id);
    writeStored(key, next.length > 0 ? JSON.stringify(next) : null);
  }

  return { collapsed, toggle, set };
}
