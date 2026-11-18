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
  type KeyboardCodes,
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
import { BackArrow } from "@/components/BackLink";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useDragSensors } from "@/components/dragSensors";
import { Icon } from "@/components/Icon";
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
import { MoveItemDialog } from "./MoveItemDialog";
import {
  SavedGroupCandidates,
  type CandidatesState,
} from "./SavedGroupCandidates";
import { ShowCheckedSwitch } from "@/features/lists/ShowCheckedSwitch";
import { withShowChecked } from "@/features/lists/showChecked";
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
    "持ち物でEnterキーを押すと、移し先を一覧から選べます。持ち物をグループへ移すときは、スペースキーで持ち上げ、矢印キーで移す先の丸を選び、スペースキーで置くこともできます。丸を動かすときは、丸でスペースキーを押して持ち上げ、矢印キーで動かします。Escキーでやめます。",
};

// SC-09-7（利用者の指示）：持ち物の Enter キーは移し先を選ぶのに使うので、キーボードで持ち上げるのはスペースキーだけにする
const KEYBOARD_CODES: KeyboardCodes = {
  start: ["Space"],
  cancel: ["Escape"],
  end: ["Space", "Enter", "Tab"],
};

// スマホで0.1秒より長く押すとドラッグが始まり、押した操作（click）が届かない。
// 動かさずに離したときは、短く押したときと同じく移し先を選べるようにする（利用者の指示）。値は指のぶれの許容と同じ
const TAP_TOLERANCE_PX = 5;

function isTouchTap(event: DragEndEvent): boolean {
  return (
    "touches" in event.activatorEvent &&
    Math.hypot(event.delta.x, event.delta.y) < TAP_TOLERANCE_PX
  );
}

// 移した持ち物がたたんだグループに隠れたときは、その枠へカーソルを戻す（SC-09、利用者の指示）。
function focusItemChip(itemId: number, targetKey: string | null) {
  requestAnimationFrame(() => {
    const item = document.querySelector<HTMLElement>(
      `[data-item-chip="${itemId}"]`,
    );
    if (item && item.getClientRects().length > 0) {
      item.focus();
    } else if (targetKey !== null) {
      document
        .querySelector<HTMLElement>(`[data-group-key="${targetKey}"]`)
        ?.focus();
    }
  });
}

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
  // D-95：SC-07 でチェック済みを表示中に開いたときは true。開いたときの表示で、画面の中でも切り替えられる
  includeChecked: boolean;
};

// SC-09 グループ整理（F-19）。分類・順番は下書きで、「保存」を押したときにまとめて保存する（D-59）。
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
  // SC-09（利用者の指示）：開閉は表示だけの状態。分類の保存・破棄確認やSC-07の記録とは分ける（D-59・D-110）。
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    new Set(),
  );
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
  const groupGridId = useId();
  // D-58（利用者の指示で変更）：SC-07 の並べ替えと同じく、持ち物のどこをつかんでも動かせる。
  // 丸は中の持ち物と分けるため、0.3秒押してから動かす（D-98）
  const sensors = useDragSensors(
    groupingKeyboardCoordinates,
    isCircleId,
    KEYBOARD_CODES,
  );
  // 動かしている持ち物のID、または丸のID
  const [draggingId, setDraggingId] = useState<UniqueIdentifier | null>(null);
  // SC-09-7：移し先を選んでいる持ち物のID（利用者の指示）
  const [movingItemId, setMovingItemId] = useState<number | null>(null);
  // SC-09-11・D-102：このリストのカテゴリーのよく使うグループ。どの読み込みの結果かを key で区別し、
  // 古い結果を表示しない
  const [candidateLoadCount, setCandidateLoadCount] = useState(0);
  const [candidates, setCandidates] = useState<
    ({ key: string } & CandidatesState) | null
  >(null);
  const [savingFavorite, setSavingFavorite] = useState(false);
  // D-95（利用者の指示）：SC-07 と同じ表示で始め、一覧の上で切り替える。画面の中の状態で、保存しない
  const [showChecked, setShowChecked] = useState(includeChecked);
  const [notice, setNotice] = useState<string | null>(null);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);

  const categoryId = state.category.id;
  const candidateKey = `${categoryId}-${candidateLoadCount}`;
  // 今の読み込みが終わるまでは null（読み込み中）
  const currentCandidates =
    candidates?.key === candidateKey ? candidates : null;

  const dirty = !sameDraft(draft, savedDraft);
  const busy = saving || reloading;
  const allGroupsCollapsed =
    draft.groups.length > 0 &&
    draft.groups.every((group) => collapsedGroups.has(group.key));
  // D-95：出さないチェック済みも下書きには残し、今の所属のまま保存する（API-30 は全有効持ち物の所属を受け取る）
  // 切り替えても下書き（所属・丸・名前）は変えないので、隠した後に戻しても動かした所属が残る
  const shownItems = showChecked
    ? state.items
    : state.items.filter((item) => !item.is_checked);
  const checkedCount = state.items.filter((item) => item.is_checked).length;
  const draggingItem = shownItems.find((item) => item.id === draggingId);
  const movingItem = shownItems.find((item) => item.id === movingItemId);
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
  // 下書きの「保存」は待たない。同じ名前がすでにあれば、既存の候補が返る（D-102）
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

  function toggleCollapsed(key: string) {
    if (busy || draggingId !== null) return;
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // 未分類は振り分ける持ち物を探す場所なので、まとめてたたむ対象に含めない（SC-09、利用者の指示）。
  function toggleAllCollapsed() {
    if (busy || draggingId !== null) return;
    setCollapsedGroups(
      allGroupsCollapsed
        ? new Set()
        : new Set(draft.groups.map((group) => group.key)),
    );
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
    if (!isCircleId(event.active.id) && isTouchTap(event)) {
      openMoveDialog(Number(event.active.id));
      return;
    }
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
    if (target.groupKey !== null && collapsedGroups.has(target.groupKey)) {
      focusItemChip(Number(event.active.id), target.groupKey);
    }
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

  // SC-09-7：持ち物を押したら、移し先を選ぶ（利用者の指示）。保存中は選べない
  function openMoveDialog(itemId: number) {
    if (busy) return;
    setMovingItemId(itemId);
  }

  function closeMoveDialog(
    itemId: number,
    targetKey: string | null = draft.assignment[itemId] ?? null,
  ) {
    setMovingItemId(null);
    focusItemChip(itemId, targetKey);
  }

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

  // SC-09-5「削除」：中の持ち物は消さずに未分類へ戻す（D-61）
  function deleteGroup(key: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
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
    // D-94（利用者の指示）：戻った SC-07 は、この画面で最後に選んだ表示で始める
    router.replace(withShowChecked(`/lists/${listId}`, showChecked));
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

  // SC-09-9「保存」：構成・順番・所属をまとめて保存する（API-30）。成功したら SC-07 へ戻る
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
      {/* 画面下に固定した「キャンセル」「保存」に、最後の持ち物が隠れないよう余白をとる */}
      <div className="flex flex-col gap-6 pb-40">
        <div className="flex min-h-11 items-center gap-3">
          <button
            type="button"
            aria-label="戻る"
            onClick={handleCancel}
            // 共通2の「←」（BackLink）と同じ白い丸にする。押せる範囲は44px四方（D-73）
            className="group shrink-0 back-button tap-target"
          >
            <BackArrow />
          </button>
          <h1 className="min-w-0 flex-1 text-2xl font-medium">
            グループを整理
          </h1>
        </div>
        {conflict && (
          <div className="flex flex-col gap-2">
            <p role="alert" className="text-danger">
              {CONFLICT_MESSAGE}
            </p>
            <button
              type="button"
              onClick={handleReload}
              disabled={busy}
              className="self-start btn-outline btn-sm"
            >
              読み直す
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-danger">
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
          {/* SC-09-4：丸のグループ。スマホは1列、幅がある画面は同じ幅の2列で並べる（D-73）。位置は保存しない。
              D-98：丸を長押しして動かすと、グループの順番を変えられる */}
          <SortableContext
            items={draft.groups.map((group) => circleId(group.key))}
            strategy={rectSortingStrategy}
          >
            <div className="flex flex-col gap-2">
              {/* SC-09-2（利用者の指示）：1回で切り替えられるよう、SC-07と同じ小さな文字で一覧の上に置く。
                  押せる高さは44pxを保ち、余白を詰めて一覧が下がりすぎないようにする（D-73・D-95）。 */}
              {(draft.groups.length > 0 || checkedCount > 0) && (
                <div className="relative z-10 -mt-4 flex flex-wrap items-center justify-between gap-x-2">
                  {draft.groups.length > 0 && (
                    <button
                      type="button"
                      aria-controls={groupGridId}
                      onClick={toggleAllCollapsed}
                      disabled={busy || draggingId !== null}
                      className="min-h-11 tap-target rounded-lg text-sm font-medium text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
                    >
                      {allGroupsCollapsed ? "すべて開く" : "すべてたたむ"}
                    </button>
                  )}
                  {checkedCount > 0 && (
                    <ShowCheckedSwitch
                      on={showChecked}
                      count={checkedCount}
                      disabled={busy || draggingId !== null}
                      size="sm"
                      align="end"
                      className="ml-auto"
                      onToggle={() => setShowChecked((current) => !current)}
                    />
                  )}
                </div>
              )}
              <div
                id={groupGridId}
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                {draft.groups.map((group) => (
                  <GroupCircle
                    key={group.key}
                    dropKey={group.key}
                    name={group.name}
                    items={itemsIn(group.key)}
                    collapsed={collapsedGroups.has(group.key)}
                    onToggleCollapsed={() => toggleCollapsed(group.key)}
                    disabled={busy}
                    onRename={() =>
                      setNameDialog({ mode: "rename", key: group.key })
                    }
                    favoriteDisabled={savingFavorite}
                    onSaveAsFavorite={() => void saveAsFavorite(group.name)}
                    onDelete={() => deleteGroup(group.key)}
                    onSelectItem={openMoveDialog}
                  />
                ))}
                {/* SC-09-3（利用者の指示）：作ったグループが出る場所の近くで追加できるよう、並びの最後に置く。
                  20件のときは押せない */}
                <button
                  type="button"
                  onClick={() => setNameDialog({ mode: "add" })}
                  disabled={busy || draft.groups.length >= MAX_GROUPS}
                  className="min-h-16 rounded-2xl border-2 border-dashed border-line-strong px-4 py-3 text-brand hover:bg-brand-soft disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  <span aria-hidden="true">＋ </span>グループを追加
                </button>
              </div>
            </div>
          </SortableContext>

          {/* SC-09-6：未分類の欄 */}
          <UnclassifiedArea
            items={unclassified}
            disabled={busy}
            onSelectItem={openMoveDialog}
          />

          {/* グループは枠そのものを動かし、持ち物だけ名前を重ねて表示する（SC-09-8、利用者の指示）。 */}
          {!draggingGroup && (
            <DragOverlay>
              {draggingItem ? (
                <span className="flex cursor-grabbing items-center gap-2 rounded-full border border-brand bg-background px-4 py-2 shadow-md">
                  {draggingItem.name}
                </span>
              ) : null}
            </DragOverlay>
          )}
        </DndContext>
      </div>

      {/* SC-09-9：「キャンセル」「保存」は画面下に固定する */}
      <div className="fixed bottom-0 left-1/2 w-full max-w-[640px] -translate-x-1/2 border-t border-line bg-background sm:border-x">
        <div className="flex flex-col gap-2 px-5 py-3">
          {/* SC-09-5：よく使うグループに保存した結果 */}
          {notice && (
            <p role="status" className="text-sm">
              {notice}
            </p>
          )}
          {favoriteError && (
            <p role="alert" className="text-sm text-danger">
              {favoriteError}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy}
              className="btn-outline"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy}
              className="btn-primary"
            >
              保存
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
      {movingItem && (
        <MoveItemDialog
          itemName={movingItem.name}
          currentKey={draft.assignment[movingItem.id] ?? null}
          targets={[
            ...draft.groups.map((group) => ({
              key: group.key,
              name: group.name,
            })),
            { key: null, name: "未分類" },
          ]}
          onMove={(key) => {
            moveItemTo(movingItem.id, key);
            closeMoveDialog(movingItem.id, key);
          }}
          onCancel={() => closeMoveDialog(movingItem.id)}
        />
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
function dropAreaBorder(isOver: boolean, idle: string): string {
  if (isOver)
    return "border-brand-deep outline-2 outline-offset-2 outline-brand-deep";
  return idle;
}

type GroupCircleProps = {
  // ドラッグで置いたときの移し先
  dropKey: string;
  name: string;
  items: PackingListItem[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  disabled: boolean;
  // よく使うグループの保存中は押せない（D-102）
  favoriteDisabled: boolean;
  onRename: () => void;
  onSaveAsFavorite: () => void;
  onDelete: () => void;
  // 中の持ち物を押したとき（移し先を選ぶ）
  onSelectItem: (itemId: number) => void;
};

// SC-09-4・5：丸の中にグループ名と件数、中の持ち物。ドラッグして丸の上で離すと移す（D-58）。
// 丸自体も長押しして動かし、グループの順番を変えられる（D-98）
function GroupCircle({
  dropKey,
  name,
  items,
  collapsed,
  onToggleCollapsed,
  disabled,
  favoriteDisabled,
  onRename,
  onSaveAsFavorite,
  onDelete,
  onSelectItem,
}: GroupCircleProps) {
  const contentId = useId();
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
      data-group-key={dropKey}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex min-w-0 touch-manipulation flex-col gap-2 rounded-2xl border-2 bg-white px-4 py-3 select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${dropAreaBorder(
        isOver && isItemDrag(active),
        "border-brand",
      )} ${collapsed ? "self-start" : ""} ${isDragging ? "relative z-10 cursor-grabbing shadow-md" : "cursor-grab"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 font-bold wrap-break-word text-brand-deep">
          {/* D-109：名前を押すと「名前を変更」を開く（持ち物を押すと移し先を選ぶのと同じ）。
              短く押したときだけ開き、長押し（0.3秒）して動かしたときは丸の並べ替えにする */}
          <button
            type="button"
            onClick={onRename}
            disabled={disabled}
            className="text-left font-bold wrap-break-word disabled:opacity-50"
          >
            {name}
            <span className="sr-only">（名前を変更）</span>
          </button>
          <span className="inline-block whitespace-nowrap">
            （{items.length}件）
          </span>
        </h2>
        <div data-no-drag className="-mt-2 -mr-2 flex shrink-0 items-center">
          <div ref={menuContainer} className="relative shrink-0">
            <button
              type="button"
              aria-label={`${name}の操作`}
              aria-expanded={menuOpen}
              disabled={disabled}
              onClick={() => setMenuOpen((open) => !open)}
              // 指で押しやすいよう、押せる範囲を44px四方以上にする。丸の見出しが高くなりすぎないよう、上と右の余白に重ねる
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-brand-deep disabled:opacity-50"
            >
              …
            </button>
            {menuOpen && (
              // D-109：名前の変更は名前を押して行うので、ここには置かない
              <ul className="absolute right-0 z-10 mt-1 w-64 menu py-1">
                <li>
                  {/* SC-09-5・D-102：名前だけを、その場で保存する（下書きの「保存」は待たない） */}
                  <button
                    type="button"
                    onClick={() => choose(onSaveAsFavorite)}
                    disabled={favoriteDisabled}
                    className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left disabled:opacity-50"
                  >
                    <Icon name="save" className="size-5 text-muted" />
                    <span>よく使うグループに保存</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => choose(onDelete)}
                    className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-danger"
                  >
                    <Icon name="trash" />
                    <span>削除</span>
                  </button>
                </li>
              </ul>
            )}
          </div>
          {/* SC-07と同じ位置で開閉できるよう、矢印は一番右に置く（D-110、利用者の指示）。 */}
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls={contentId}
            aria-label={collapsed ? `${name}を開く` : `${name}をたたむ`}
            onClick={onToggleCollapsed}
            disabled={disabled || active !== null}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          >
            <Icon
              name="chevron"
              className={`size-5 transition-transform duration-200 motion-reduce:transition-none ${collapsed ? "-rotate-90" : ""}`}
            />
          </button>
        </div>
      </div>
      <div id={contentId} hidden={collapsed || items.length === 0}>
        {!collapsed && (
          <ItemChips
            items={items}
            disabled={disabled}
            onSelect={onSelectItem}
          />
        )}
      </div>
    </section>
  );
}

// SC-09-6：未分類の欄へドラッグして離すと戻す（D-58）
function UnclassifiedArea({
  items,
  disabled,
  onSelectItem,
}: {
  items: PackingListItem[];
  disabled: boolean;
  onSelectItem: (itemId: number) => void;
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
      className={`flex flex-col gap-2 rounded-2xl border-2 border-dashed bg-white px-4 py-3 ${dropAreaBorder(
        isOver && isItemDrag(active),
        "border-line-strong",
      )}`}
    >
      <h2 className="font-bold text-muted">
        未分類
        <span className="inline-block whitespace-nowrap">
          （{items.length}件）
        </span>
      </h2>
      <ItemChips items={items} disabled={disabled} onSelect={onSelectItem} />
    </section>
  );
}

// SC-09-7：チェックの印は出さず、持ち物を直接ドラッグして移す。押すと移し先を選べる（利用者の指示）
function ItemChips({
  items,
  disabled,
  onSelect,
}: {
  items: PackingListItem[];
  disabled: boolean;
  onSelect: (itemId: number) => void;
}) {
  if (items.length === 0) return null;

  // 利用者の指示：スマホの指でつかみやすいよう、持ち物の間をあける
  return (
    <ul className="flex flex-wrap gap-3">
      {items.map((item) => (
        <ItemChip
          key={item.id}
          item={item}
          disabled={disabled}
          onSelect={() => onSelect(item.id)}
        />
      ))}
    </ul>
  );
}

function ItemChip({
  item,
  disabled,
  onSelect,
}: {
  item: PackingListItem;
  disabled: boolean;
  onSelect: () => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: item.id,
    disabled,
    attributes: { roleDescription: "グループへ移動できる持ち物" },
  });

  return (
    <li className={`min-w-0 max-w-full ${isDragging ? "opacity-40" : ""}`}>
      {/* D-58（利用者の指示で変更）：持ち手を出さず、名前のどこからでも動かせる。
          キーボードでも、このボタンから持ち上げて移動できる。
          押す（Enter キー）と移し先を選べる。ドラッグが始まった後は dnd-kit が click を止めるので、両方は起きない */}
      <button
        ref={setNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        onClick={onSelect}
        data-item-chip={item.id}
        disabled={disabled}
        className="max-w-full cursor-grab touch-manipulation rounded-full border border-line-strong bg-background px-4 py-2 text-left wrap-break-word hover:border-brand select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
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
