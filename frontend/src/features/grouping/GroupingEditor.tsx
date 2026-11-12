"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  type Active,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type ScreenReaderInstructions,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useDragSensors } from "@/components/dragSensors";
import { useDismiss } from "@/components/useDismiss";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type {
  GroupingSaveResult,
  GroupingState,
  PackingListItem,
  SavedGroup,
} from "@/types/api";
import { GroupNameDialog } from "./GroupNameDialog";
import {
  SavedGroupCandidates,
  type CandidatesState,
} from "./SavedGroupCandidates";
import { MAX_GROUPS } from "./validation";

// V-13：分類の保存（API-30）の競合
const CONFLICT_MESSAGE = "リストが変更されています。読み直してください。";

// 02_画面配置 共通4：結果の通知は数秒で消す
const NOTICE_DURATION_MS = 5000;

// 未分類の欄を表す、ドラッグの置き場所のID
const UNGROUPED_DROP_ID = "ungrouped";

// 丸と未分類の欄に持たせる、置いたときの移し先（groupKey が null なら未分類）
type DropData = { groupKey: string | null; label: string };

// D-98：丸もドラッグして順番を変えるので、持ち物のID（数）と分けた文字のIDにする
const CIRCLE_PREFIX = "circle-";

function circleId(key: string): string {
  return `${CIRCLE_PREFIX}${key}`;
}

function isCircleId(id: UniqueIdentifier): boolean {
  return typeof id === "string" && id.startsWith(CIRCLE_PREFIX);
}

// 持ち物をドラッグしているときだけ、移し先の枠を強調する（丸を動かしているときは強調しない）
function isItemDrag(active: Active | null): boolean {
  return active !== null && !isCircleId(active.id);
}

// 画面読み上げで伝える文。dnd-kit の既定は英語なので、日本語にする
const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "持ち物をグループへ移すときは、スペースキーで持ち上げ、矢印キーで移す先の丸を選び、スペースキーで置きます。丸を動かすときは、丸でスペースキーを押して持ち上げ、矢印キーで動かします。Escキーでやめます。",
};

// 持ち物は、指・マウスなら離した位置にある丸（または未分類の欄）へ、キーボードなら重なっている丸へ移す。
// 丸を動かしているときは、ほかの丸のうちいちばん近いものと入れ替える（D-98）
const detectDropArea: CollisionDetection = (args) => {
  if (isCircleId(args.active.id)) {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((container) =>
        isCircleId(container.id),
      ),
    });
  }
  return args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args);
};

const ARROW_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

/**
 * キーボードの矢印キーで、その向きにあるいちばん近い丸（または未分類の欄）の真ん中へ持ち物を動かす。
 * dnd-kit の並べ替え用の計算は、持ち物自体が置き場所でないと動かないので、ここで決める。
 */
const dropAreaKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  {
    context: {
      active,
      collisionRect,
      droppableRects,
      droppableContainers,
      over,
    },
  },
) => {
  if (!ARROW_KEYS.includes(event.code)) return undefined;
  event.preventDefault();
  if (!active || !collisionRect) return undefined;

  const fromX = collisionRect.left + collisionRect.width / 2;
  const fromY = collisionRect.top + collisionRect.height / 2;
  let nearest: { x: number; y: number; distance: number } | null = null;

  for (const container of droppableContainers.getEnabled()) {
    // 今重なっている丸は飛ばして、次の丸へ進む
    if (container.id === over?.id) continue;
    const rect = droppableRects.get(container.id);
    if (!rect) continue;

    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const ahead =
      (event.code === "ArrowDown" && y > fromY) ||
      (event.code === "ArrowUp" && y < fromY) ||
      (event.code === "ArrowRight" && x > fromX) ||
      (event.code === "ArrowLeft" && x < fromX);
    if (!ahead) continue;

    const distance = Math.hypot(x - fromX, y - fromY);
    if (!nearest || distance < nearest.distance) {
      nearest = { x, y, distance };
    }
  }

  if (!nearest) return undefined;
  return {
    x: nearest.x - collisionRect.width / 2,
    y: nearest.y - collisionRect.height / 2,
  };
};

// 丸はほかの丸と並べ替えるので dnd-kit の並べ替え用の計算、持ち物は上の計算を使う
const groupingKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) =>
  isCircleId(args.active)
    ? sortableKeyboardCoordinates(event, args)
    : dropAreaKeyboardCoordinates(event, args);

type DraftGroup = { key: string; id: number | null; name: string };
type Draft = {
  groups: DraftGroup[];
  // 持ち物ID → 所属するグループの key。null は未分類
  assignment: Record<number, string | null>;
};

type NameDialog = { mode: "add" } | { mode: "rename"; key: string } | null;
// 破棄の確認の後に行うこと
type AfterDiscard = "leave" | "reload" | null;

// 既存のグループは IDから key を作る。新しいグループは new1・new2…（06_API一覧「キーと削除の意味」）
function groupKey(id: number): string {
  return `g${id}`;
}

function draftFrom(state: GroupingState): Draft {
  return {
    groups: state.groups.map((group) => ({
      key: groupKey(group.id),
      id: group.id,
      name: group.name,
    })),
    assignment: Object.fromEntries(
      state.items.map((item) => [
        item.id,
        item.group_id === null ? null : groupKey(item.group_id),
      ]),
    ),
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

type Props = {
  listId: number;
  initialState: GroupingState;
  // D-95：SC-07 でチェック済みを表示中に開いたときだけ true。false ならチェック済みを出さない
  includeChecked: boolean;
};

// SC-09 グループ整理（F-19）。ここでの操作はすべて下書きで、「OK」でまとめて保存する（D-59）。
// チェック・持ち物の追加/削除/並べ替えはここではしない（D-60）
export function GroupingEditor({
  listId,
  initialState,
  includeChecked,
}: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const [state, setState] = useState(initialState);
  const [savedDraft, setSavedDraft] = useState(() => draftFrom(initialState));
  const [draft, setDraft] = useState(() => draftFrom(initialState));
  const [nameDialog, setNameDialog] = useState<NameDialog>(null);
  const [afterDiscard, setAfterDiscard] = useState<AfterDiscard>(null);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const newGroupCount = useRef(0);
  // 保存できて SC-07 へ戻るときは、離脱の確認を出さない
  const leaving = useRef(false);
  // サーバーとブラウザで同じ値になるIDを渡し、読み上げ用の要素のIDをそろえる
  const dndId = useId();
  // D-58（利用者の指示で変更）：SC-07 の並べ替えと同じく、持ち物のどこをつかんでも動かせる。
  // 丸は中の持ち物と分けるため、0.3秒押してから動かす（D-98）
  const sensors = useDragSensors(groupingKeyboardCoordinates, isCircleId);
  // 動かしている持ち物のID、または丸のID
  const [draggingId, setDraggingId] = useState<UniqueIdentifier | null>(null);
  // SC-09-11・D-102：このリストのカテゴリーのよく使うグループ。どの読み込みの結果かを key で区別し、
  // 古い結果を表示しない
  const [candidateLoadCount, setCandidateLoadCount] = useState(0);
  const [candidates, setCandidates] = useState<
    ({ key: string } & CandidatesState) | null
  >(null);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);

  const categoryId = state.category.id;
  const candidateKey = `${categoryId}-${candidateLoadCount}`;
  // 今の読み込みが終わるまでは null（読み込み中）
  const currentCandidates =
    candidates?.key === candidateKey ? candidates : null;

  const dirty = !sameDraft(draft, savedDraft);
  const busy = saving || reloading;
  // D-95：出さないチェック済みも下書きには残し、今の所属のまま保存する（API-30 は全有効持ち物の所属を受け取る）
  const shownItems = includeChecked
    ? state.items
    : state.items.filter((item) => !item.is_checked);
  const hiddenCheckedCount = state.items.length - shownItems.length;
  const draggingItem = shownItems.find((item) => item.id === draggingId);
  const draggingGroup = draft.groups.find(
    (group) => circleId(group.key) === draggingId,
  );

  // 29-04：変更があるまま再読み込み・タブを閉じようとしたら、ブラウザの確認を出す
  useEffect(() => {
    if (!dirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (leaving.current) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  // SC-09-1：開いたときに、このリストのカテゴリーのよく使うグループを読む（API-39）。
  // 読めなくても整理は始められ、候補の欄にだけ通信失敗を出す（D-102）
  useEffect(() => {
    let ignore = false;
    clientApi<SavedGroup[]>(`/saved-groups?category_id=${categoryId}`)
      .then((savedGroups) => {
        if (!ignore) setCandidates({ key: candidateKey, savedGroups });
      })
      .catch((failure: unknown) => {
        if (ignore || redirectIfAuthError(failure)) return;
        setCandidates({ key: candidateKey, error: NETWORK_ERROR_MESSAGE });
      });
    return () => {
      ignore = true;
    };
  }, [categoryId, candidateKey, redirectIfAuthError]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // SC-09-5「よく使うグループに保存」：丸の今の名前を、このリストのカテゴリーでその場で保存する（API-40）。
  // 下書きの OK は待たない。同じ名前がすでにあれば、既存の候補が返る（D-102）
  async function saveAsFavorite(name: string) {
    if (savingFavorite) return;

    setSavingFavorite(true);
    setNotice(null);
    setFavoriteError(null);
    try {
      const saved = await clientApi<SavedGroup>("/saved-groups", {
        method: "POST",
        body: { name, category_id: categoryId },
      });
      // 新しく保存した候補は、候補のいちばん上に足す（新しく保存した順）
      setCandidates((previous) =>
        previous &&
        "savedGroups" in previous &&
        !previous.savedGroups.some((savedGroup) => savedGroup.id === saved.id)
          ? { ...previous, savedGroups: [saved, ...previous.savedGroups] }
          : previous,
      );
      setNotice("保存しました");
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      setFavoriteError(favoriteErrorMessage(failure));
    } finally {
      setSavingFavorite(false);
    }
  }

  // SC-09-12：削除した候補を外す
  function removeCandidate(savedGroupId: number) {
    setCandidates((previous) =>
      previous && "savedGroups" in previous
        ? {
            ...previous,
            savedGroups: previous.savedGroups.filter(
              (savedGroup) => savedGroup.id !== savedGroupId,
            ),
          }
        : previous,
    );
  }

  function itemsIn(key: string | null): PackingListItem[] {
    // D-60：丸の中も、全体の持ち物順をグループごとに絞って表示する。件数も出している持ち物だけ数える（D-95）
    return shownItems.filter(
      (item) => (draft.assignment[item.id] ?? null) === key,
    );
  }

  function updateDraft(change: (current: Draft) => Draft) {
    setError(null);
    setDraft(change);
  }

  // 持ち物を丸（または未分類）へ移す。1件につき1グループまで（D-56）。順番とチェックは変えない（D-60）
  function moveItemTo(itemId: number, key: string | null) {
    if (busy) return;
    updateDraft((current) => ({
      ...current,
      assignment: { ...current.assignment, [itemId]: key },
    }));
  }

  // D-98：丸を別の丸の位置へ動かして、グループの順番を変える（下書き）。チェックリストの見出しも同じ順になる
  function moveGroupTo(fromKey: string, toKey: string) {
    if (busy) return;
    updateDraft((current) => {
      const from = current.groups.findIndex((group) => group.key === fromKey);
      const to = current.groups.findIndex((group) => group.key === toKey);
      if (from < 0 || to < 0 || from === to) return current;
      return { ...current, groups: arrayMove(current.groups, from, to) };
    });
  }

  // SC-09-4・6・D-58：持ち物をドラッグして丸（または未分類）に置いたら移す
  function handleDragStart(event: DragStartEvent) {
    setDraggingId(event.active.id);
  }

  // 丸の外に置いたとき・Escキーでやめたときは移さず、元の所属・順番のままにする（D-58）
  function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    const target = event.over?.data.current as DropData | undefined;
    if (!target) return;

    if (isCircleId(event.active.id)) {
      const source = event.active.data.current as DropData | undefined;
      if (source?.groupKey && target.groupKey) {
        moveGroupTo(source.groupKey, target.groupKey);
      }
      return;
    }
    moveItemTo(Number(event.active.id), target.groupKey);
  }

  const nameOf = (id: UniqueIdentifier) =>
    isCircleId(id)
      ? `「${draft.groups.find((group) => circleId(group.key) === id)?.name ?? ""}」`
      : (shownItems.find((item) => item.id === id)?.name ?? "");
  const labelOf = (data: unknown) => (data as DropData | undefined)?.label;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${nameOf(active.id)}を持ち上げました。`,
    onDragOver: ({ active, over }) => {
      if (!over) return undefined;
      return isCircleId(active.id)
        ? `${nameOf(active.id)}を「${labelOf(over.data.current)}」の位置へ動かしています。`
        : `${nameOf(active.id)}を「${labelOf(over.data.current)}」の上に動かしています。`;
    },
    onDragEnd: ({ active, over }) => {
      if (!over) return `${nameOf(active.id)}を移さずに戻しました。`;
      return isCircleId(active.id)
        ? `${nameOf(active.id)}を「${labelOf(over.data.current)}」の位置に置きました。`
        : `${nameOf(active.id)}を「${labelOf(over.data.current)}」へ移しました。`;
    },
    onDragCancel: ({ active }) => `${nameOf(active.id)}の移動をやめました。`,
  };

  function addGroup(name: string) {
    newGroupCount.current += 1;
    const key = `new${newGroupCount.current}`;
    updateDraft((current) => ({
      ...current,
      groups: [...current.groups, { key, id: null, name }],
    }));
    setNameDialog(null);
  }

  function renameGroup(key: string, name: string) {
    updateDraft((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.key === key ? { ...group, name } : group,
      ),
    }));
    setNameDialog(null);
  }

  // SC-09-5「上へ」「下へ」：丸とチェックリストの見出しの順番（D-57）
  function moveGroup(key: string, offset: -1 | 1) {
    updateDraft((current) => {
      const index = current.groups.findIndex((group) => group.key === key);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= current.groups.length) {
        return current;
      }
      const groups = [...current.groups];
      [groups[index], groups[target]] = [groups[target], groups[index]];
      return { ...current, groups };
    });
  }

  // SC-09-5「削除」：中の持ち物は消さずに未分類へ戻す（D-61）
  function deleteGroup(key: string) {
    updateDraft((current) => ({
      groups: current.groups.filter((group) => group.key !== key),
      assignment: Object.fromEntries(
        Object.entries(current.assignment).map(([itemId, groupKeyValue]) => [
          itemId,
          groupKeyValue === key ? null : groupKeyValue,
        ]),
      ),
    }));
  }

  function backToList() {
    leaving.current = true;
    router.replace(`/lists/${listId}`);
  }

  // SC-09-9「キャンセル」と「←」。変更がなければそのまま戻り、あれば破棄を確かめる（SC-09-10）
  function handleCancel() {
    if (busy) return;
    if (dirty) {
      setAfterDiscard("leave");
      return;
    }
    backToList();
  }

  // SC-09-1・10：最新の分類を読み直す（API-29）。下書きは捨てる
  async function reload() {
    setReloading(true);
    setError(null);
    try {
      const latest = await clientApi<GroupingState>(
        `/lists/${listId}/grouping`,
      );
      setState(latest);
      const fresh = draftFrom(latest);
      setSavedDraft(fresh);
      setDraft(fresh);
      setDraggingId(null);
      setConflict(false);
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      if (failure instanceof ApiError && failure.status === 404) {
        router.refresh();
        return;
      }
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setReloading(false);
    }
  }

  function handleReload() {
    if (busy) return;
    if (dirty) {
      setAfterDiscard("reload");
      return;
    }
    void reload();
  }

  // SC-09-9「OK」：構成・順番・所属をまとめて保存する（API-30）。成功したら SC-07 へ戻る
  async function handleSave() {
    if (busy) return;
    // 何も変えていなければ保存せずに戻る（revision・更新日時は変わらない、28-05）
    if (!dirty) {
      backToList();
      return;
    }

    setSaving(true);
    setError(null);
    setConflict(false);
    try {
      await clientApi<GroupingSaveResult>(`/lists/${listId}/grouping`, {
        method: "PUT",
        body: {
          base_revision: state.grouping_revision,
          groups: draft.groups.map(({ key, id, name }) => ({ key, id, name })),
          assignments: state.items.map((item) => ({
            item_id: item.id,
            group_key: draft.assignment[item.id] ?? null,
          })),
        },
      });
      // 移動が終わるまで保存中のままにして、二重に保存しない（28-02）
      backToList();
    } catch (failure) {
      setSaving(false);
      if (redirectIfAuthError(failure)) return;
      if (!(failure instanceof ApiError)) {
        setError(NETWORK_ERROR_MESSAGE);
      } else if (failure.status === 404) {
        router.refresh();
      } else if (failure.code === "grouping_conflict") {
        // 上書きせず、破棄を確かめてから読み直してもらう（D-59）
        setConflict(true);
      } else if (failure.code === "validation_error") {
        // 422 は下書きを残し、最初の1文を出す（SC-09-9）
        setError(Object.values(failure.errors).flat()[0] ?? failure.message);
      } else {
        setError(NETWORK_ERROR_MESSAGE);
      }
    }
  }

  const otherNames = (exceptKey: string | null) =>
    draft.groups
      .filter((group) => group.key !== exceptKey)
      .map((group) => group.name);
  const renaming =
    nameDialog?.mode === "rename"
      ? draft.groups.find((group) => group.key === nameDialog.key)
      : undefined;
  const unclassified = itemsIn(null);

  return (
    <>
      {/* 画面下に固定した「キャンセル」「OK」に、最後の持ち物が隠れないよう余白をとる */}
      <div className="flex flex-col gap-6 pb-40">
        <button
          type="button"
          aria-label="戻る"
          onClick={handleCancel}
          className="self-start rounded px-2 py-1 text-xl"
        >
          ←
        </button>

        {/* SC-09-2・3 */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">グループを整理</h1>
          <button
            type="button"
            onClick={() => setNameDialog({ mode: "add" })}
            disabled={busy || draft.groups.length >= MAX_GROUPS}
            className="shrink-0 rounded border border-zinc-400 px-3 py-1 disabled:opacity-50"
          >
            グループを追加
          </button>
        </div>
        {hiddenCheckedCount > 0 && (
          <p className="text-sm text-zinc-600">
            チェック済みの持ち物（{hiddenCheckedCount}
            件）は表示していません。今のグループに残ります（グループを削除すると未分類へ移ります）。
          </p>
        )}
        {conflict && (
          <div className="flex flex-col gap-2">
            <p role="alert" className="text-red-700">
              {CONFLICT_MESSAGE}
            </p>
            <button
              type="button"
              onClick={handleReload}
              disabled={busy}
              className="self-start rounded border border-zinc-400 px-3 py-1 disabled:opacity-50"
            >
              読み直す
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}

        {/* SC-09-4・6・D-58：持ち物を丸か未分類の欄へドラッグして移す。丸の外に置いたら移さない */}
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={detectDropArea}
          accessibility={{ announcements, screenReaderInstructions }}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDraggingId(null)}
        >
          {/* SC-09-4：丸のグループ。画面幅に合わせて折り返して並べる。位置は保存しない。
              D-98：丸を長押しして動かすと、グループの順番を変えられる */}
          {draft.groups.length > 0 && (
            <SortableContext
              items={draft.groups.map((group) => circleId(group.key))}
              strategy={rectSortingStrategy}
            >
              <div className="flex flex-wrap gap-3">
                {draft.groups.map((group, index) => (
                  <GroupCircle
                    key={group.key}
                    dropKey={group.key}
                    name={group.name}
                    items={itemsIn(group.key)}
                    canMoveUp={index > 0}
                    canMoveDown={index < draft.groups.length - 1}
                    disabled={busy}
                    onRename={() =>
                      setNameDialog({ mode: "rename", key: group.key })
                    }
                    onMoveUp={() => moveGroup(group.key, -1)}
                    onMoveDown={() => moveGroup(group.key, 1)}
                    favoriteDisabled={savingFavorite}
                    onSaveAsFavorite={() => void saveAsFavorite(group.name)}
                    onDelete={() => deleteGroup(group.key)}
                  />
                ))}
              </div>
            </SortableContext>
          )}

          {/* SC-09-6：未分類の欄 */}
          <UnclassifiedArea items={unclassified} disabled={busy} />

          {/* SC-09-8：ドラッグ中は、指やマウスの下に持ち物（または丸）の名前を出す */}
          <DragOverlay>
            {draggingItem ? (
              <span className="flex cursor-grabbing items-center gap-2 rounded-full border border-zinc-900 bg-background px-3 py-1 shadow-md">
                {draggingItem.name}
              </span>
            ) : draggingGroup ? (
              <span className="flex cursor-grabbing items-center rounded-4xl border-2 border-zinc-900 bg-background px-4 py-3 font-medium shadow-md">
                {draggingGroup.name}
              </span>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* SC-09-9：「キャンセル」「OK」は画面下に固定する */}
      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-300 bg-background">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-2 px-4 py-3">
          {/* SC-09-5：よく使うグループに保存した結果 */}
          {notice && (
            <p role="status" className="text-sm">
              {notice}
            </p>
          )}
          {favoriteError && (
            <p role="alert" className="text-sm text-red-700">
              {favoriteError}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy}
              className="rounded border border-zinc-400 px-4 py-2 disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy}
              className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
            >
              OK
            </button>
          </div>
        </div>
      </div>

      {nameDialog?.mode === "add" && (
        <GroupNameDialog
          title="グループを追加"
          submitLabel="追加"
          initialName=""
          otherNames={otherNames(null)}
          onSubmit={addGroup}
          onCancel={() => setNameDialog(null)}
        >
          {/* SC-09-11：押すと、名前を入力して確定したときと同じく丸を下書きに足す（D-102） */}
          <SavedGroupCandidates
            candidates={currentCandidates}
            takenNames={otherNames(null)}
            full={draft.groups.length >= MAX_GROUPS}
            onPick={addGroup}
            onRemoved={removeCandidate}
            onRetry={() => setCandidateLoadCount((count) => count + 1)}
          />
        </GroupNameDialog>
      )}
      {renaming && (
        <GroupNameDialog
          title="名前を変更"
          submitLabel="変更"
          initialName={renaming.name}
          otherNames={otherNames(renaming.key)}
          onSubmit={(name) => renameGroup(renaming.key, name)}
          onCancel={() => setNameDialog(null)}
        />
      )}

      {/* SC-09-10：変更があるときのキャンセル・戻る・読み直し */}
      <ConfirmDialog
        open={afterDiscard !== null}
        message="変更を破棄しますか？"
        confirmLabel="破棄する"
        cancelLabel="編集を続ける"
        destructive
        onConfirm={() => {
          const next = afterDiscard;
          setAfterDiscard(null);
          if (next === "leave") backToList();
          if (next === "reload") void reload();
        }}
        onCancel={() => setAfterDiscard(null)}
      />
    </>
  );
}

// 移し先の枠の見た目。ドラッグで上にいるときは、色だけでなく枠を太くして示す。
// D-98（利用者の指示）：「ここに移します」の文は出さず、枠の強調だけにする
function dropAreaBorder(isOver: boolean): string {
  if (isOver)
    return "border-zinc-900 outline-2 outline-offset-2 outline-zinc-900";
  return "border-zinc-300";
}

type GroupCircleProps = {
  // ドラッグで置いたときの移し先
  dropKey: string;
  name: string;
  items: PackingListItem[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled: boolean;
  // よく使うグループの保存中は押せない（D-102）
  favoriteDisabled: boolean;
  onRename: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSaveAsFavorite: () => void;
  onDelete: () => void;
};

// SC-09-4・5：丸の中にグループ名と件数、中の持ち物。ドラッグして丸の上で離すと移す（D-58）。
// 丸自体も長押しして動かし、グループの順番を変えられる（D-98）
function GroupCircle({
  dropKey,
  name,
  items,
  canMoveUp,
  canMoveDown,
  disabled,
  favoriteDisabled,
  onRename,
  onMoveUp,
  onMoveDown,
  onSaveAsFavorite,
  onDelete,
}: GroupCircleProps) {
  const menuContainer = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useDismiss(menuContainer, menuOpen, () => setMenuOpen(false));
  const dropData: DropData = { groupKey: dropKey, label: name };
  // 丸は、持ち物を置く場所であり、自分も並べ替えられる
  const {
    active,
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: circleId(dropKey),
    data: dropData,
    disabled,
    attributes: { role: "group", roleDescription: "並べ替えできるグループ" },
  });
  // 丸そのものを持ち手にする。キーボードは丸にカーソルがあるときだけ持ち上げ、
  // 中の持ち物・「…」のキー操作はそれぞれに使う
  const setCircleRef = useCallback(
    (node: HTMLElement | null) => {
      setNodeRef(node);
      setActivatorNodeRef(node);
    },
    [setNodeRef, setActivatorNodeRef],
  );

  function choose(action: () => void) {
    setMenuOpen(false);
    action();
  }

  return (
    <section
      ref={setCircleRef}
      {...attributes}
      {...listeners}
      aria-label={name}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex min-w-36 flex-1 cursor-grab touch-manipulation flex-col gap-2 rounded-4xl border-2 bg-background px-4 py-3 select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 ${dropAreaBorder(
        isOver && isItemDrag(active),
      )} ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 font-medium wrap-break-word">
          {name}（{items.length}件）
        </h2>
        <div ref={menuContainer} data-no-drag className="relative shrink-0">
          <button
            type="button"
            aria-label={`${name}の操作`}
            aria-expanded={menuOpen}
            disabled={disabled}
            onClick={() => setMenuOpen((open) => !open)}
            className="rounded px-2 disabled:opacity-50"
          >
            …
          </button>
          {menuOpen && (
            <ul className="absolute right-0 z-10 mt-1 w-48 rounded border border-zinc-300 bg-background py-1 shadow">
              <li>
                <button
                  type="button"
                  onClick={() => choose(onRename)}
                  className="block w-full px-4 py-2 text-left"
                >
                  名前を変更
                </button>
              </li>
              {canMoveUp && (
                <li>
                  <button
                    type="button"
                    onClick={() => choose(onMoveUp)}
                    className="block w-full px-4 py-2 text-left"
                  >
                    上へ
                  </button>
                </li>
              )}
              {canMoveDown && (
                <li>
                  <button
                    type="button"
                    onClick={() => choose(onMoveDown)}
                    className="block w-full px-4 py-2 text-left"
                  >
                    下へ
                  </button>
                </li>
              )}
              <li>
                {/* SC-09-5・D-102：名前だけを、その場で保存する（下書きの OK は待たない） */}
                <button
                  type="button"
                  onClick={() => choose(onSaveAsFavorite)}
                  disabled={favoriteDisabled}
                  className="block w-full px-4 py-2 text-left disabled:opacity-50"
                >
                  よく使うグループに保存
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => choose(onDelete)}
                  className="block w-full px-4 py-2 text-left text-red-700"
                >
                  削除
                </button>
              </li>
            </ul>
          )}
        </div>
      </div>
      <ItemChips items={items} disabled={disabled} />
    </section>
  );
}

// SC-09-6：未分類の欄へドラッグして離すと戻す（D-58）
function UnclassifiedArea({
  items,
  disabled,
}: {
  items: PackingListItem[];
  disabled: boolean;
}) {
  const dropData: DropData = { groupKey: null, label: "未分類" };
  const { active, setNodeRef, isOver } = useDroppable({
    id: UNGROUPED_DROP_ID,
    data: dropData,
    disabled,
  });

  return (
    <section
      ref={setNodeRef}
      aria-label="未分類"
      className={`flex flex-col gap-2 rounded border-2 border-dashed p-3 ${dropAreaBorder(
        isOver && isItemDrag(active),
      )}`}
    >
      <h2 className="font-medium">未分類（{items.length}件）</h2>
      <ItemChips items={items} disabled={disabled} />
    </section>
  );
}

// SC-09-7：チェックの印は出さず、持ち物を直接ドラッグして移す
function ItemChips({
  items,
  disabled,
}: {
  items: PackingListItem[];
  disabled: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <ItemChip key={item.id} item={item} disabled={disabled} />
      ))}
    </ul>
  );
}

function ItemChip({
  item,
  disabled,
}: {
  item: PackingListItem;
  disabled: boolean;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: item.id,
    disabled,
    attributes: { roleDescription: "グループへ移動できる持ち物" },
  });

  return (
    <li className={isDragging ? "opacity-40" : undefined}>
      {/* D-58（利用者の指示で変更）：持ち手を出さず、名前のどこからでも動かせる。
          キーボードでも、このボタンから持ち上げて移動できる */}
      <button
        ref={setNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        className="cursor-grab touch-manipulation rounded-full border border-zinc-400 px-3 py-1 text-left wrap-break-word select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50"
      >
        {item.name}
      </button>
    </li>
  );
}

// V-21・D-102：よく使うグループの保存（API-40）で出す文。理由は code で見分ける（D-53）
function favoriteErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "saved_group_limit_reached") {
      return "保存できるのは100件までです。";
    }
    if (error.code === "validation_error") {
      return Object.values(error.errors).flat()[0] ?? error.message;
    }
  }

  return NETWORK_ERROR_MESSAGE;
}
