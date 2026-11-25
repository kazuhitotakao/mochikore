import type { GroupCheckMode, GroupingState } from "@/types/api";

// SC-09 グループ整理の下書き（D-59・D-113）。構成・順番・所属と、グループごとのチェックの動き（D-122）を持ち、
// 画面を離れるときにまとめて保存する

export type DraftGroup = {
  key: string;
  id: number | null;
  name: string;
  checkMode: GroupCheckMode;
};
export type Draft = {
  groups: DraftGroup[];
  // 持ち物ID → 所属するグループの key。null は未分類
  assignment: Record<number, string | null>;
};

// 既存のグループは IDから key を作る。新しいグループは new1・new2…（06_API一覧「キーと削除の意味」）
export function groupKey(id: number): string {
  return `g${id}`;
}

export function draftFrom(state: GroupingState): Draft {
  return {
    groups: state.groups.map((group) => ({
      key: groupKey(group.id),
      id: group.id,
      name: group.name,
      checkMode: group.check_mode,
    })),
    assignment: Object.fromEntries(
      state.items.map((item) => [
        item.id,
        item.group_id === null ? null : groupKey(item.group_id),
      ]),
    ),
  };
}

export function sameDraft(a: Draft, b: Draft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * F-35・D-119：共同編集で、ほかのメンバーの変更を自分の下書きへ取り込む。
 * base は下書きを始めたとき（前に取り込んだとき）の保存済みの内容、latest は今の保存済みの内容。
 * 自分が変えたところ（base と違うところ）は残し、変えていないところは latest に合わせる。
 *
 * - グループ：ほかの人が消したグループは消す。自分が名前を変えたものは自分の名前、そうでなければ最新の名前。
 *   チェックの動き（D-122）も同じく、自分が変えたものは自分の設定、そうでなければ最新の設定。
 *   ほかの人が足したグループは足す。自分が足したグループと同じ名前を、ほかの人も足していたら1つにまとめる
 *   （設定は、後から保存する自分のものにする）
 * - 順番：自分が並べ替えていなければ最新の順番、並べ替えていれば自分の順番（ほかの人が足した分は最後）
 * - 所属：自分が移した持ち物は自分の移し先、そうでなければ最新の所属。足された持ち物は最新の所属で入れ、
 *   消された持ち物は外す。同じ持ち物を2人が別のグループへ移したときは、後から保存する人（自分）が優先になる
 */
export function rebaseDraft(draft: Draft, base: Draft, latest: Draft): Draft {
  const baseKeys = new Set(base.groups.map((group) => group.key));
  const baseByKey = new Map(base.groups.map((group) => [group.key, group]));
  const latestByKey = new Map(latest.groups.map((group) => [group.key, group]));
  const draftKeys = new Set(draft.groups.map((group) => group.key));
  // 自分が足したグループの key → まとめた先（ほかの人が同じ名前で足したグループ）の key
  const mergedKeys = new Map<string, string>();
  const takenKeys = new Set<string>();

  // 1. 自分の下書きにあるグループを、最新の内容に合わせる
  const kept: DraftGroup[] = [];
  for (const group of draft.groups) {
    if (group.id === null) {
      const twin = latest.groups.find(
        (candidate) =>
          candidate.name === group.name &&
          !baseKeys.has(candidate.key) &&
          !draftKeys.has(candidate.key) &&
          !takenKeys.has(candidate.key),
      );
      if (twin) {
        mergedKeys.set(group.key, twin.key);
        takenKeys.add(twin.key);
        kept.push({ ...twin, checkMode: group.checkMode });
      } else {
        kept.push(group);
      }
      continue;
    }

    const theirs = latestByKey.get(group.key);
    // ほかの人が消したグループは、自分の下書きからも消す
    if (!theirs) continue;
    const before = baseByKey.get(group.key);
    const renamedByMe = before !== undefined && before.name !== group.name;
    const modeChangedByMe =
      before !== undefined && before.checkMode !== group.checkMode;
    takenKeys.add(group.key);
    kept.push({
      ...theirs,
      name: renamedByMe ? group.name : theirs.name,
      checkMode: modeChangedByMe ? group.checkMode : theirs.checkMode,
    });
  }

  // 2. ほかの人が足したグループ（自分の下書きにも、前の保存済みにもないもの）
  const added = latest.groups.filter(
    (group) => !baseKeys.has(group.key) && !takenKeys.has(group.key),
  );

  // 3. 順番。自分が並べ替えていなければ、最新の順番に合わせる
  const latestOrder = new Map(
    latest.groups.map((group, index) => [group.key, index]),
  );
  const groups = reorderedByMe(draft, base)
    ? [...kept, ...added]
    : [
        ...[...kept, ...added]
          .filter((group) => latestOrder.has(group.key))
          .sort(
            (a, b) =>
              (latestOrder.get(a.key) ?? 0) - (latestOrder.get(b.key) ?? 0),
          ),
        // 自分が足したグループは、今までどおり最後に置く
        ...kept.filter((group) => !latestOrder.has(group.key)),
      ];

  // 4. 所属。最新にある持ち物だけを残す
  const resultKeys = new Set(groups.map((group) => group.key));
  const existing = (key: string | null | undefined): string | null =>
    key != null && resultKeys.has(key) ? key : null;
  const assignment: Record<number, string | null> = {};
  for (const [id, theirs] of Object.entries(latest.assignment)) {
    const itemId = Number(id);
    const mine = draft.assignment[itemId];
    const before = base.assignment[itemId];
    const movedByMe =
      mine !== undefined && before !== undefined && mine !== before;
    if (!movedByMe) {
      assignment[itemId] = existing(theirs);
      continue;
    }

    const target = mine === null ? null : (mergedKeys.get(mine) ?? mine);
    // 移し先のグループをほかの人が消していたら、最新の所属に合わせる
    assignment[itemId] =
      target === null || resultKeys.has(target) ? target : existing(theirs);
  }

  return { groups, assignment };
}

/**
 * 自分がグループの順番を変えたか。前の保存済みにもあるグループの並びが変わっているか、
 * 自分が足したグループを最後以外に置いているとき。
 */
function reorderedByMe(draft: Draft, base: Draft): boolean {
  const baseKeys = new Set(base.groups.map((group) => group.key));
  const draftKeys = new Set(draft.groups.map((group) => group.key));
  const mineOrder = draft.groups
    .filter((group) => baseKeys.has(group.key))
    .map((group) => group.key);
  const baseOrder = base.groups
    .filter((group) => draftKeys.has(group.key))
    .map((group) => group.key);
  if (mineOrder.join("\n") !== baseOrder.join("\n")) return true;

  // 自分が足したグループ（前の保存済みにないもの）の後ろに、前からあるグループが並んでいるか
  const firstNew = draft.groups.findIndex((group) => !baseKeys.has(group.key));
  return (
    firstNew !== -1 &&
    draft.groups.slice(firstNew).some((group) => baseKeys.has(group.key))
  );
}

/**
 * 「元に戻す」「やり直す」の履歴にも同じ取り込みを行い、取り込んだ結果が隣と同じになった分は捨てる
 * （押しても何も変わらない段を残さない）。
 */
export function rebaseHistory(
  history: { past: Draft[]; future: Draft[] },
  current: Draft,
  rebase: (draft: Draft) => Draft,
): { past: Draft[]; future: Draft[] } {
  const past: Draft[] = [];
  for (const step of history.past.map(rebase)) {
    if (past.length === 0 || !sameDraft(past[past.length - 1], step)) {
      past.push(step);
    }
  }
  while (past.length > 0 && sameDraft(past[past.length - 1], current)) {
    past.pop();
  }

  const future: Draft[] = [];
  let previous = current;
  for (const step of history.future.map(rebase)) {
    if (!sameDraft(previous, step)) {
      future.push(step);
      previous = step;
    }
  }

  return { past, future };
}
