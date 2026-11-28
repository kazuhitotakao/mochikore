"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  useDndContext,
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
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from "react";
import { BackArrow } from "@/components/BackLink";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useDragSensors } from "@/components/dragSensors";
import { Icon } from "@/components/Icon";
import { SwitchIndicator } from "@/components/SwitchIndicator";
import { useDismiss } from "@/components/useDismiss";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type {
  GroupCheckMode,
  GroupingSaveResult,
  GroupingState,
  PackingListItem,
  SavedGroup,
} from "@/types/api";
import {
  draftFrom,
  rebaseDraft,
  rebaseHistory,
  sameDraft,
  type Draft,
} from "./draft";
import { GroupNameDialog } from "./GroupNameDialog";
import { MoveItemDialog } from "./MoveItemDialog";
import {
  SavedGroupCandidates,
  type CandidatesState,
} from "./SavedGroupCandidates";
import { SelectMark } from "@/features/lists/SelectionList";
import { ShowCheckedSwitch } from "@/features/lists/ShowCheckedSwitch";
import { RepeatBadge } from "@/features/lists/RepeatBadge";
import { listPagePath } from "@/features/combined-views/returnPath";
import { useRemoteListSync } from "@/features/lists/useRemoteListSync";
import type { RealtimeConfig } from "@/lib/realtime/types";
import { MAX_GROUPS } from "./validation";

// V-13：分類の保存（API-30）の競合
const CONFLICT_MESSAGE = "リストが変更されています。読み直してください。";
// F-35・D-119：共同編集で保存が競合したとき。下書きは残し、ほかのメンバーの変更を取り込んでから送り直してもらう
const MERGED_MESSAGE =
  "ほかのメンバーの変更を取り込みました。内容を確かめて、もう一度「←」で戻ると保存します。";

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
    "持ち物でEnterキーを押すと、その持ち物を選びます（もう一度押すと外します）。選んだ持ち物は、画面下の「移し先を選ぶ」から移せます。持ち物をグループへ移すときは、スペースキーで持ち上げ、矢印キーで移す先の丸を選び、スペースキーで置くこともできます。選んだ持ち物を持ち上げて置くと、選んだ持ち物をまとめて移します。丸を動かすときは、丸でスペースキーを押して持ち上げ、矢印キーで動かします。Escキーでやめます。",
};

// SC-09-7（利用者の指示）：持ち物の Enter キーは選ぶのに使うので、キーボードで持ち上げるのはスペースキーだけにする（D-112）
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

// SC-09-13・D-112：選んだ持ち物が全部同じ所属ならその所属、ばらばらなら undefined（移し先の一覧の「今ここ」）
function sharedKeyOf(
  items: PackingListItem[],
  assignment: Record<number, string | null>,
): string | null | undefined {
  const keys = new Set(items.map((item) => assignment[item.id] ?? null));
  return keys.size === 1 ? [...keys][0] : undefined;
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

type NameDialog = { mode: "add" } | { mode: "rename"; key: string } | null;

// D-113（利用者の指示）：この画面を開いたときまで何回でも戻せ、戻した分は「やり直す」で進められるよう、
// 下書きを変えるたびに前の下書きを積む。戻した後に新しく変えたら、進める分は捨てる
type DraftHistory = { past: Draft[]; future: Draft[] };
const EMPTY_HISTORY: DraftHistory = { past: [], future: [] };

type Props = {
  listId: number;
  initialState: GroupingState;
  // D-95：SC-07 でチェック済みを表示中に開いたときは true。開いたときの表示で、画面の中でも切り替えられる
  includeChecked: boolean;
  // F-35・D-119：共同編集の配信の接続先。設定がなければ null
  realtime: RealtimeConfig | null;
  // D-124：まとめ表示から開いた SC-07 から来たときの、そのまとめ表示のID。戻った SC-07 の「←」で使う
  combinedViewId: number | null;
};

// SC-09 グループ整理（F-19）。分類・順番は下書きで、「←」やブラウザの戻るで画面を離れるときにまとめて保存する（D-59・D-113）。
// チェック・持ち物の追加/削除/並べ替えはここではしない（D-60）
export function GroupingEditor({
  listId,
  initialState,
  includeChecked,
  realtime,
  combinedViewId,
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
  // SC-09-10：変更があるまま「読み直す」を押したときの破棄の確認
  const [confirmingReload, setConfirmingReload] = useState(false);
  const [history, setHistory] = useState<DraftHistory>(EMPTY_HISTORY);
  // 「元に戻す」「やり直す」の結果を読み上げる（画面には出さない）
  const [historyNotice, setHistoryNotice] = useState("");
  const undoButtonId = useId();
  const redoButtonId = useId();
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  // F-35・D-119：共同編集のリスト（自分がメンバー、またはメンバーがいる）では、ほかのメンバーの変更を
  // 下書きを残したまま取り込む。保存が競合したときも、破棄せずに取り込む
  const collaborative = !state.is_owner || state.member_count > 0;
  // 保存が競合して、最新を取り込むのを待っているか（取り込めたら案内を出す）
  const mergeAfterConflict = useRef(false);
  const [mergedNotice, setMergedNotice] = useState(false);
  const newGroupCount = useRef(0);
  // 保存できて SC-07 へ戻るときは、離脱の確認を出さない
  const leaving = useRef(false);
  // D-113：変更したら同じ画面の履歴を1つ足しておく。ブラウザの戻る・スマホのスワイプはまずこの分を戻すので、
  // 画面を離れる前に保存できる
  const historyGuard = useRef(false);
  // 保存できた後に足した履歴を戻すとき。戻り終わったら SC-07 へ移る
  const leaveAfterPop = useRef(false);
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
  // D-112（利用者の指示）：選んだ持ち物。押すだけで選べ、下書きと同じく画面の中だけに持つ
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(
    new Set(),
  );
  // SC-09-13：選んだ持ち物の移し先を選んでいるか
  const [choosingTarget, setChoosingTarget] = useState(false);
  const chooseTargetButtonId = useId();
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
  // F-35・D-119：合図・つなぎ直し・画面に戻ったときに API-29 を読み直して、下書きへ取り込む。
  // 保存中・読み直し中・ドラッグ中は、終わるまで待つ
  const syncNow = useRemoteListSync<GroupingState>({
    listId,
    path: `/lists/${listId}/grouping`,
    realtime,
    enabled: collaborative,
    busy: busy || draggingId !== null,
    onSynced: applyRemoteState,
  });
  const allGroupsCollapsed =
    draft.groups.length > 0 &&
    draft.groups.every((group) => collapsedGroups.has(group.key));
  // D-95：出さないチェック済みも下書きには残し、今の所属のまま保存する（API-30 は全有効持ち物の所属を受け取る）
  // 切り替えても下書き（所属・丸・名前）は変えないので、隠した後に戻しても動かした所属が残る
  // D-122：繰り返し利用のグループ（下書きの設定・所属で判定）の持ち物は、SC-07 と同じくチェックしても隠さない
  const repeatKeys = new Set(
    draft.groups
      .filter((group) => group.checkMode === "repeat")
      .map((group) => group.key),
  );
  const hidesWhenChecked = (item: PackingListItem) =>
    item.is_checked && !repeatKeys.has(draft.assignment[item.id] ?? "");
  const shownItems = showChecked
    ? state.items
    : state.items.filter((item) => !hidesWhenChecked(item));
  const checkedCount = state.items.filter(hidesWhenChecked).length;
  // SC-09-2・14：「←」の右のスイッチ。2つとも出すときは、640px未満で上下に重ねる（D-73）
  const hasCollapseSwitch = draft.groups.length > 0;
  const hasCheckedSwitch = checkedCount > 0;
  const stackSwitches = hasCollapseSwitch && hasCheckedSwitch;
  const draggingItem = shownItems.find((item) => item.id === draggingId);
  // D-112：持ち物を選んでいる間は、名前の変更・丸の並べ替え・「…」・チェック済みの表示の切り替えを止める
  const hasSelection = selectedIds.size > 0;
  // 選んだ持ち物をつかんで動かしているときは、選んだ持ち物をまとめて移す
  const draggingSelection =
    draggingItem !== undefined && selectedIds.has(draggingItem.id);
  // 画面に出している順の、選んだ持ち物
  const selectedItems = shownItems.filter((item) => selectedIds.has(item.id));
  const draggingGroup = draft.groups.find(
    (group) => circleId(group.key) === draggingId,
  );

  // D-113：最初に変更したときに、同じURLの履歴を1つ足す（Next.js の履歴の情報は引き継がれる）
  useEffect(() => {
    if (!dirty || historyGuard.current) return;
    historyGuard.current = true;
    window.history.pushState(null, "", window.location.href);
  }, [dirty]);

  // D-113：足した履歴から戻ったとき（ブラウザの戻る・スワイプ、または「←」で保存できた後）
  const onHistoryBack = useEffectEvent(() => {
    if (!historyGuard.current) return;
    historyGuard.current = false;
    if (leaveAfterPop.current || (!dirty && !busy)) {
      // Next.js も同じ popstate で、戻った先（この画面）を描き直す。再読み込み・URL を直接開いたときは
      // この受け取りが Next.js より先に動き、SC-07 への移動が描き直しに取り消されるので、次の順番に回す
      window.setTimeout(backToList, 0);
      return;
    }
    // 保存が終わるまで（失敗したときも）この画面に残るよう、履歴を足し直す
    historyGuard.current = true;
    window.history.pushState(null, "", window.location.href);
    if (!busy) void saveAndLeave();
  });

  useEffect(() => {
    const handlePopState = () => onHistoryBack();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // 29-04：変更があるまま再読み込み・タブを閉じようとしたら、ブラウザの確認を出す（このときは保存できない、D-113）
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
  // 画面を離れるときの下書きの保存は待たない。同じ名前がすでにあれば、既存の候補が返る（D-102）
  async function saveAsFavorite(name: string, checkMode: GroupCheckMode) {
    if (savingFavorite) return;

    setSavingFavorite(true);
    setNotice(null);
    setFavoriteError(null);
    try {
      const saved = await clientApi<SavedGroup>("/saved-groups", {
        method: "POST",
        // D-122：チェックの動きも一緒に覚える
        body: { name, category_id: categoryId, check_mode: checkMode },
      });
      // 新しく保存した候補は、候補のいちばん上に足す（新しく保存した順）。
      // 同じ名前がすでにあれば、新しい設定で上書きされた候補に差し替える（D-122）
      setCandidates((previous) => {
        if (!previous || !("savedGroups" in previous)) return previous;
        const exists = previous.savedGroups.some(
          (savedGroup) => savedGroup.id === saved.id,
        );
        return {
          ...previous,
          savedGroups: exists
            ? previous.savedGroups.map((savedGroup) =>
                savedGroup.id === saved.id ? saved : savedGroup,
              )
            : [saved, ...previous.savedGroups],
        };
      });
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

  // F-35・D-119：読み直した最新の内容（API-29）を、下書きを残したまま取り込む。
  // 自分が変えたところは残し、変えていないところは最新に合わせる（rebaseDraft）。
  // 「元に戻す」「やり直す」の履歴にも同じ取り込みを行うので、取り込んだ後も開いたときまで戻せる
  function applyRemoteState(latest: GroupingState) {
    const latestDraft = draftFrom(latest);
    const rebase = (target: Draft) =>
      rebaseDraft(target, savedDraft, latestDraft);
    const merged = rebase(draft);
    setState(latest);
    setSavedDraft(latestDraft);
    setDraft(merged);
    setHistory(rebaseHistory(history, merged, rebase));
    setConflict(false);
    // ほかのメンバーが消した持ち物・グループを、選んだまま・名前の変更中のままにしない
    const itemIds = new Set(latest.items.map((item) => item.id));
    setSelectedIds((current) => {
      const kept = [...current].filter((id) => itemIds.has(id));
      return kept.length === current.size ? current : new Set(kept);
    });
    if (
      nameDialog?.mode === "rename" &&
      !merged.groups.some((group) => group.key === nameDialog.key)
    ) {
      setNameDialog(null);
    }
    if (mergeAfterConflict.current) {
      mergeAfterConflict.current = false;
      setMergedNotice(true);
    }
  }

  // D-113：下書きを変える操作（移動・並べ替え・追加・名前の変更・削除）はすべてここを通し、変える前の下書きを積む
  function changeDraft(next: Draft) {
    if (sameDraft(next, draft)) return;
    setError(null);
    setMergedNotice(false);
    setHistory((current) => ({ past: [...current.past, draft], future: [] }));
    setDraft(next);
    setHistoryNotice("");
  }

  // 押せなくなったボタンからカーソルが外れないよう、反対のボタンへ移す
  function focusLater(id: string) {
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  // 「元に戻す」：1つ前の下書きに戻す。開いたときの下書きまで戻せる
  function handleUndo() {
    const previous = history.past[history.past.length - 1];
    if (!previous || busy) return;
    setError(null);
    setHistory({
      past: history.past.slice(0, -1),
      future: [draft, ...history.future],
    });
    setDraft(previous);
    setHistoryNotice("1つ前に戻しました");
    if (history.past.length === 1) focusLater(redoButtonId);
  }

  // 「やり直す」：戻した下書きを1つ先へ進める
  function handleRedo() {
    const next = history.future[0];
    if (!next || busy) return;
    setError(null);
    setHistory({
      past: [...history.past, draft],
      future: history.future.slice(1),
    });
    setDraft(next);
    setHistoryNotice("1つ先へ進めました");
    if (history.future.length === 1) focusLater(undoButtonId);
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
    changeDraft({
      ...draft,
      assignment: { ...draft.assignment, [itemId]: key },
    });
  }

  // D-98：丸を別の丸の位置へ動かして、グループの順番を変える（下書き）。チェックリストの見出しも同じ順になる
  function moveGroupTo(fromKey: string, toKey: string) {
    if (busy) return;
    const from = draft.groups.findIndex((group) => group.key === fromKey);
    const to = draft.groups.findIndex((group) => group.key === toKey);
    if (from < 0 || to < 0 || from === to) return;
    changeDraft({ ...draft, groups: arrayMove(draft.groups, from, to) });
  }

  // SC-09-4・6・D-58：持ち物をドラッグして丸（または未分類）に置いたら移す
  function handleDragStart(event: DragStartEvent) {
    setDraggingId(event.active.id);
  }

  // 丸の外に置いたとき・Escキーでやめたときは移さず、元の所属・順番のままにする（D-58）
  function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    if (!isCircleId(event.active.id) && isTouchTap(event)) {
      // D-112：動かさずに離したときも、押したときと同じく選ぶ・外す
      toggleSelected(Number(event.active.id));
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
    // D-112：選んだ持ち物をつかんで置いたら、選んだ持ち物をまとめて移す。選んでいない持ち物はその1件だけ移す
    if (selectedIds.has(Number(event.active.id))) {
      moveSelectedTo(target.groupKey);
      return;
    }
    moveItemTo(Number(event.active.id), target.groupKey);
    if (target.groupKey !== null && collapsedGroups.has(target.groupKey)) {
      focusItemChip(Number(event.active.id), target.groupKey);
    }
  }

  // 選んだ持ち物をまとめて動かしているときは、件数も読み上げる（D-112）
  const nameOf = (id: UniqueIdentifier) => {
    if (isCircleId(id)) {
      return `「${draft.groups.find((group) => circleId(group.key) === id)?.name ?? ""}」`;
    }
    const name = shownItems.find((item) => item.id === id)?.name ?? "";
    return selectedIds.has(Number(id)) && selectedIds.size > 1
      ? `${name}など選んだ${selectedIds.size}件`
      : name;
  };
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

  // D-112（利用者の指示）：持ち物を押す（キーボードはEnter）と選ぶ・外す。保存中は選べない
  function toggleSelected(itemId: number) {
    if (busy) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  // 「選択を解除」：選んだ持ち物を外し、止めていた名前の変更・丸の並べ替えを使えるように戻す
  function clearSelection() {
    setSelectedIds(new Set());
  }

  // 選んだ持ち物をまとめて移す。1件ずつ移すときと同じく下書きで、順番とチェックは変えない（D-59・D-60）。
  // 移した後は印を外し、続けて別の持ち物を選べるようにする（利用者の指示）。
  // 1件も所属が変わらなかったとき（同じ丸に戻した）は、選んだまま残す
  function moveSelectedTo(key: string | null, { focus = false } = {}) {
    const ids = selectedItems.map((item) => item.id);
    if (ids.every((id) => (draft.assignment[id] ?? null) === key)) return;
    const assignment = { ...draft.assignment };
    for (const id of ids) assignment[id] = key;
    changeDraft({ ...draft, assignment });
    setSelectedIds(new Set());
    // 移し先の一覧から選んだとき・たたんだ丸へ置いたときは、移した持ち物（見えなければ丸）へカーソルを移す
    if (focus || (key !== null && collapsedGroups.has(key))) {
      focusItemChip(ids[0], key);
    }
  }

  // SC-09-13：「移し先を選ぶ」から移すとき。やめたときは選んだまま「移し先を選ぶ」へカーソルを戻す
  function closeTargetDialog() {
    setChoosingTarget(false);
    requestAnimationFrame(() =>
      document.getElementById(chooseTargetButtonId)?.focus(),
    );
  }

  function addGroup(name: string, checkMode: GroupCheckMode) {
    newGroupCount.current += 1;
    const key = `new${newGroupCount.current}`;
    changeDraft({
      ...draft,
      groups: [...draft.groups, { key, id: null, name, checkMode }],
    });
    setNameDialog(null);
  }

  // SC-09-5：名前とチェックの動き（D-122）を下書きで変える
  function editGroup(key: string, name: string, checkMode: GroupCheckMode) {
    changeDraft({
      ...draft,
      groups: draft.groups.map((group) =>
        group.key === key ? { ...group, name, checkMode } : group,
      ),
    });
    setNameDialog(null);
  }

  // SC-09-5「削除」：中の持ち物は消さずに未分類へ戻す（D-61）
  function deleteGroup(key: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    changeDraft({
      groups: draft.groups.filter((group) => group.key !== key),
      assignment: Object.fromEntries(
        Object.entries(draft.assignment).map(([itemId, groupKeyValue]) => [
          itemId,
          groupKeyValue === key ? null : groupKeyValue,
        ]),
      ),
    });
  }

  function backToList() {
    leaving.current = true;
    // D-94（利用者の指示）：戻った SC-07 は、この画面で最後に選んだ表示で始める
    router.replace(
      listPagePath(`/lists/${listId}`, { showChecked, combinedViewId }),
    );
  }

  // 足した履歴が残っていれば先に戻し（戻り終わったら SC-07 へ）、なければそのまま SC-07 へ移る。
  // 足した履歴を残したまま移ると、SC-07 からブラウザで戻ったときに古いこの画面が開くため
  function leaveToList() {
    if (historyGuard.current) {
      leaveAfterPop.current = true;
      window.history.back();
      return;
    }
    backToList();
  }

  // SC-09-9「←」（D-113、利用者の指示）：変更があれば保存してから戻る。ブラウザの戻る・スワイプも同じ
  function handleBack() {
    if (busy) return;
    void saveAndLeave();
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
      // 読み直した内容が新しい出発点になるので、戻す・進める分は捨てる（D-113）
      setHistory(EMPTY_HISTORY);
      setDraggingId(null);
      setConflict(false);
      // 読み直した持ち物と合わないので、選んでいた持ち物は外す（D-112）
      setSelectedIds(new Set());
      setChoosingTarget(false);
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
      setConfirmingReload(true);
      return;
    }
    void reload();
  }

  // SC-09-9（D-113）：構成・順番・所属をまとめて保存し（API-30）、成功したら SC-07 へ戻る。
  // 失敗したら戻らずに理由を出し、下書きを残す。もう一度「←」で送り直せる
  async function saveAndLeave() {
    // 何も変えていなければ保存せずに戻る（revision・更新日時は変わらない、28-05）
    if (!dirty) {
      leaveToList();
      return;
    }

    setSaving(true);
    setError(null);
    setConflict(false);
    setMergedNotice(false);
    try {
      await clientApi<GroupingSaveResult>(`/lists/${listId}/grouping`, {
        method: "PUT",
        body: {
          base_revision: state.grouping_revision,
          groups: draft.groups.map(({ key, id, name, checkMode }) => ({
            key,
            id,
            name,
            check_mode: checkMode,
          })),
          assignments: state.items.map((item) => ({
            item_id: item.id,
            group_key: draft.assignment[item.id] ?? null,
          })),
        },
      });
      // 移動が終わるまで保存中のままにして、二重に保存しない（28-02）
      leaveToList();
    } catch (failure) {
      setSaving(false);
      if (redirectIfAuthError(failure)) return;
      if (failure instanceof ApiError && failure.status === 404) {
        router.refresh();
        return;
      }
      if (!(failure instanceof ApiError)) {
        setError(NETWORK_ERROR_MESSAGE);
      } else if (failure.code === "grouping_conflict" && collaborative) {
        // F-35・D-119：共同編集では、ほかのメンバーが同時に変えることがあるので、下書きを捨てずに
        // 最新を取り込む。自動では送り直さず、内容を確かめてからもう一度「←」で保存してもらう
        mergeAfterConflict.current = true;
        syncNow();
      } else if (failure.code === "grouping_conflict") {
        // 上書きせず、破棄を確かめてから読み直してもらう（D-59）
        setConflict(true);
      } else if (failure.code === "validation_error") {
        // 422 は下書きを残し、最初の1文を出す（SC-09-9）
        setError(Object.values(failure.errors).flat()[0] ?? failure.message);
      } else {
        setError(NETWORK_ERROR_MESSAGE);
      }
      // ブラウザの戻るで下の方から保存したときも、「←」の下に出した理由が見えるようにする
      window.scrollTo(0, 0);
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
  // D-113：一度でも下書きを変えたら「元に戻す」「やり直す」を出す。持ち物を選んでいる間は選んだ操作を出す
  const showHistory =
    !hasSelection && (history.past.length > 0 || history.future.length > 0);
  // 画面下は、選んでいる間・「元に戻す」「やり直す」・よく使うグループの保存結果があるときだけ出す（利用者の指示）
  const footerVisible =
    hasSelection || showHistory || notice !== null || favoriteError !== null;

  return (
    <>
      {/* 画面下の表示に、最後の持ち物が隠れないよう余白をとる */}
      <div
        className={`flex flex-col gap-4 ${footerVisible ? "pb-40" : "pb-8"}`}
      >
        {/* SC-09-2・14（D-73、利用者の指示）：「←」と同じ行の右に、表示のスイッチをまとめる。
            行の高さは「←」の丸に固定し、スイッチのまとまりの中央を「←」の中央にそろえる（はみ出す分は上下へ均等に出す）。
            見出しの位置は「←」だけのときと変えない */}
        <div className="mb-1 flex h-9 items-center justify-between gap-3">
          <button
            type="button"
            aria-label="戻る"
            onClick={handleBack}
            // 共通2の「←」（BackLink）と同じ白い丸にする。押せる範囲は44px四方（D-73）
            className="group shrink-0 back-button tap-target"
          >
            <BackArrow />
          </button>
          {(hasCollapseSwitch || hasCheckedSwitch) && (
            // 640px未満は2つを上下に重ねる。幅がある画面は横に並べる。
            // 下のスイッチの押せる範囲は見出しの上の余白まで届くので、見出しより前面に出す
            <div className="relative z-10 flex min-w-0 flex-col items-end sm:flex-row sm:items-center sm:gap-x-4">
              {hasCollapseSwitch && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={allGroupsCollapsed}
                  aria-controls={groupGridId}
                  onClick={toggleAllCollapsed}
                  disabled={busy || draggingId !== null}
                  // 重ねるときは、文字とスイッチを下のスイッチ寄せにして2つの間を8pxに詰める。
                  // 押せる範囲（44px）は上へ広げ、下のスイッチと重ねない（D-73）
                  className={`flex min-h-11 items-center gap-2 rounded-lg text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50 ${stackSwitches ? "pt-5 pb-1 sm:py-0" : ""}`}
                >
                  <span>すべてたたむ</span>
                  <SwitchIndicator on={allGroupsCollapsed} size="sm" />
                </button>
              )}
              {/* D-112：持ち物を選んでいる間は、選ぶ対象が変わらないよう押せなくする。
                  隠すと「すべてたたむ」の位置が動くので、出したままにする */}
              {hasCheckedSwitch && (
                <ShowCheckedSwitch
                  on={showChecked}
                  count={checkedCount}
                  disabled={busy || draggingId !== null || hasSelection}
                  size="sm"
                  align="end"
                  // 重ねるときは上のスイッチ寄せにし、押せる範囲（44px）は下へ広げる（D-73）
                  className={stackSwitches ? "pt-1 pb-5 sm:py-0" : ""}
                  onToggle={() => setShowChecked((current) => !current)}
                />
              )}
            </div>
          )}
        </div>
        {/* SC-07と同じく、戻るボタンの下に見出しを左寄せで置く（D-73、利用者の指示）。 */}
        <h1 className="text-2xl font-medium">グループを整理</h1>
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
        {mergedNotice && (
          <p role="status" className="text-brand-deep">
            {MERGED_MESSAGE}
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
            <div
              id={groupGridId}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
              {draft.groups.map((group) => (
                <GroupCircle
                  key={group.key}
                  dropKey={group.key}
                  name={group.name}
                  checkMode={group.checkMode}
                  items={itemsIn(group.key)}
                  collapsed={collapsedGroups.has(group.key)}
                  onToggleCollapsed={() => toggleCollapsed(group.key)}
                  disabled={busy}
                  onRename={() =>
                    setNameDialog({ mode: "rename", key: group.key })
                  }
                  favoriteDisabled={savingFavorite}
                  onSaveAsFavorite={() =>
                    void saveAsFavorite(group.name, group.checkMode)
                  }
                  onDelete={() => deleteGroup(group.key)}
                  selection={selectedIds}
                  onSelectItem={toggleSelected}
                />
              ))}
              {/* SC-09-3（利用者の指示）：作ったグループが出る場所の近くで追加できるよう、並びの最後に置く。
                  20件のときは押せない */}
              <button
                type="button"
                onClick={() => setNameDialog({ mode: "add" })}
                disabled={busy || draft.groups.length >= MAX_GROUPS}
                className="min-h-12 rounded-2xl border-2 border-dashed border-line-strong px-4 py-2 text-brand hover:bg-brand-soft disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <span aria-hidden="true">＋ </span>グループを追加
              </button>
            </div>
          </SortableContext>

          {/* SC-09-6：未分類の欄 */}
          <UnclassifiedArea
            items={unclassified}
            disabled={busy}
            selection={selectedIds}
            onSelectItem={toggleSelected}
          />

          {/* グループは枠そのものを動かし、持ち物だけ名前を重ねて表示する（SC-09-8、利用者の指示）。 */}
          {!draggingGroup && (
            <DragOverlay>
              {draggingItem ? (
                // 件数を添えても名前が折り返さないよう、元の持ち物の幅より広がってよい（画面の幅まで）
                <span className="flex w-max max-w-[calc(100vw-2.5rem)] cursor-grabbing items-center gap-2 rounded-full border border-brand bg-background px-4 py-2 shadow-md">
                  {draggingItem.name}
                  {/* D-112：選んだ持ち物をまとめて動かすときは、何件動くかを添える */}
                  {draggingSelection && selectedIds.size > 1 && (
                    <span className="shrink-0 rounded-full bg-brand px-2 text-sm text-white">
                      {selectedIds.size}件
                    </span>
                  )}
                </span>
              ) : null}
            </DragOverlay>
          )}
        </DndContext>
      </div>

      {/* SC-09-15（D-113、利用者の指示）：「キャンセル」「保存」は置かず、必要なときだけ画面下に出す */}
      {footerVisible && (
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
            {/* SC-09-15・D-112：持ち物を選んでいる間だけ、選んだ件数と「選択を解除」「移し先を選ぶ」を出す。
              ふだんはドラッグで移し、ドラッグしづらいときは「移し先を選ぶ」から移せる（利用者の指示）。
              たたんだ丸の中で選んだ持ち物も数える */}
            {hasSelection && (
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p role="status">{selectedIds.size}件選択中</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={clearSelection}
                    disabled={busy}
                    className="btn-outline btn-sm tap-target"
                  >
                    選択を解除
                  </button>
                  <button
                    id={chooseTargetButtonId}
                    type="button"
                    onClick={() => setChoosingTarget(true)}
                    disabled={busy}
                    className="btn-outline btn-sm tap-target"
                  >
                    移し先を選ぶ
                  </button>
                </div>
              </div>
            )}
            {/* D-113（利用者の指示）：開いたときまで1つずつ戻せ、戻した分は進められる。何をしたかの文は出さない */}
            {showHistory && (
              <div className="flex items-center justify-end gap-2">
                <p role="status" className="sr-only">
                  {historyNotice}
                </p>
                <button
                  id={undoButtonId}
                  type="button"
                  onClick={handleUndo}
                  disabled={busy || history.past.length === 0}
                  className="btn-outline btn-sm tap-target gap-1.5"
                >
                  <Icon name="undo" className="size-4" />
                  元に戻す
                </button>
                <button
                  id={redoButtonId}
                  type="button"
                  onClick={handleRedo}
                  disabled={busy || history.future.length === 0}
                  className="btn-outline btn-sm tap-target gap-1.5"
                >
                  やり直す
                  <Icon name="redo" className="size-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {nameDialog?.mode === "add" && (
        <GroupNameDialog
          title="グループを追加"
          submitLabel="追加"
          initialName=""
          initialCheckMode="normal"
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
      {/* SC-09-13・D-112：選んだ持ち物の移し先。全部が同じ所属のときだけ、そこを「今ここ」にする */}
      {choosingTarget && selectedItems.length > 0 && (
        <MoveItemDialog
          title={
            selectedItems.length === 1
              ? `「${selectedItems[0].name}」の移し先`
              : `選んだ持ち物（${selectedItems.length}件）の移し先`
          }
          currentKey={sharedKeyOf(selectedItems, draft.assignment)}
          targets={[
            ...draft.groups.map((group) => ({
              key: group.key,
              name: group.name,
            })),
            { key: null, name: "未分類" },
          ]}
          onMove={(key) => {
            setChoosingTarget(false);
            moveSelectedTo(key, { focus: true });
          }}
          onCancel={closeTargetDialog}
        />
      )}
      {renaming && (
        <GroupNameDialog
          // D-122：名前のほかにチェックの動きも変えられるので、「名前を変更」から「グループを編集」にした
          title="グループを編集"
          submitLabel="変更"
          initialName={renaming.name}
          initialCheckMode={renaming.checkMode}
          otherNames={otherNames(renaming.key)}
          onSubmit={(name, checkMode) =>
            editGroup(renaming.key, name, checkMode)
          }
          onCancel={() => setNameDialog(null)}
        />
      )}

      {/* SC-09-10：変更があるまま読み直すと下書きが消えるので確かめる（戻るときは保存する、D-113） */}
      <ConfirmDialog
        open={confirmingReload}
        message="変更を破棄しますか？"
        confirmLabel="破棄する"
        cancelLabel="キャンセル"
        destructive
        onConfirm={() => {
          setConfirmingReload(false);
          void reload();
        }}
        onCancel={() => setConfirmingReload(false)}
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
  // D-122：繰り返し利用のグループには印を付ける
  checkMode: GroupCheckMode;
  items: PackingListItem[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  disabled: boolean;
  // よく使うグループの保存中は押せない（D-102）
  favoriteDisabled: boolean;
  onRename: () => void;
  onSaveAsFavorite: () => void;
  onDelete: () => void;
  // D-112：選んだ持ち物のID
  selection: ReadonlySet<number>;
  // 中の持ち物を押したとき（選ぶ・外す）
  onSelectItem: (itemId: number) => void;
};

// SC-09-4・5：丸の中にグループ名と件数、中の持ち物。ドラッグして丸の上で離すと移す（D-58）。
// 丸自体も長押しして動かし、グループの順番を変えられる（D-98）
function GroupCircle({
  dropKey,
  name,
  checkMode,
  items,
  collapsed,
  onToggleCollapsed,
  disabled,
  favoriteDisabled,
  onRename,
  onSaveAsFavorite,
  onDelete,
  selection,
  onSelectItem,
}: GroupCircleProps) {
  const contentId = useId();
  // D-112（利用者の指示）：持ち物を選んでいる間だけ、丸の並べ替え・名前の変更・「…」を止める（押し間違えないように）。
  // 「選択を解除」・移した後は、また使える
  const selecting = selection.size > 0;
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
    // 持ち物を選んでいる間も、選んだ持ち物を置く場所としては使う（D-112）
    disabled: { draggable: disabled || selecting, droppable: disabled },
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
      // 持ち物を選んでいる間は並べ替えの読み上げ（押せない状態）を付けない。たたんだ丸へ移したときに
      // カーソルを戻せるよう、カーソルだけは置けるようにする（focusItemChip）
      {...(selecting ? { tabIndex: -1 } : attributes)}
      {...listeners}
      aria-label={name}
      data-group-key={dropKey}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex min-w-0 touch-manipulation flex-col gap-2 rounded-2xl border-2 bg-white px-4 py-3 select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${dropAreaBorder(
        isOver && isItemDrag(active),
        "border-brand",
      )} ${collapsed ? "self-start" : ""} ${isDragging ? "relative z-10 cursor-grabbing shadow-md" : selecting ? "" : "cursor-grab"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 font-bold wrap-break-word text-brand-deep">
          {/* D-109・D-122：名前を押すと「グループを編集」（名前とチェックの動き）を開く。
              短く押したときだけ開き、長押し（0.3秒）して動かしたときは丸の並べ替えにする */}
          <button
            type="button"
            onClick={onRename}
            disabled={disabled || selecting}
            className="text-left font-bold wrap-break-word disabled:opacity-50"
          >
            {name}
            <span className="sr-only">（名前・チェックの動きを変更）</span>
          </button>
          {/* 件数はSC-07の見出しと同じ控えめな14pxにし、名前と見分けやすくする（D-73、利用者の指示） */}
          <span className="inline-block text-sm font-normal whitespace-nowrap text-muted">
            （{items.length}件）
          </span>
          {/* D-122：繰り返し利用のグループに印を付ける。設定は名前を押して開く「グループを編集」で変える */}
          {checkMode === "repeat" && (
            <>
              {/* 行の途中では件数との間を空け、次の行へ折り返したときは左端にそろえる */}{" "}
              <span className="inline-block align-middle">
                <RepeatBadge />
              </span>
            </>
          )}
        </h2>
        {/* 押せる範囲（44px）は保ったまま上下を余白に重ね、名前と持ち物の間を詰める（D-73、利用者の指示） */}
        <div data-no-drag className="-my-2 -mr-2 flex shrink-0 items-center">
          <div ref={menuContainer} className="relative shrink-0">
            <button
              type="button"
              aria-label={`${name}の操作`}
              aria-expanded={menuOpen}
              disabled={disabled || selecting}
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
                  {/* SC-09-5・D-102：名前だけを、その場で保存する（下書きの保存は待たない） */}
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
            selection={selection}
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
  selection,
  onSelectItem,
}: {
  items: PackingListItem[];
  disabled: boolean;
  selection: ReadonlySet<number>;
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
        <span className="inline-block text-sm font-normal whitespace-nowrap">
          （{items.length}件）
        </span>
      </h2>
      <ItemChips
        items={items}
        disabled={disabled}
        selection={selection}
        onSelect={onSelectItem}
      />
    </section>
  );
}

// SC-09-7：チェックの印は出さず、持ち物を直接ドラッグして移す。押すと移し先を選べる（利用者の指示）
function ItemChips({
  items,
  disabled,
  selection,
  onSelect,
}: {
  items: PackingListItem[];
  disabled: boolean;
  selection: ReadonlySet<number>;
  onSelect: (itemId: number) => void;
}) {
  // D-112：選んだ持ち物をつかんで動かしている間は、一緒に移るほかの選んだ持ち物も薄くする
  const { active } = useDndContext();
  const movingSelection =
    active !== null &&
    !isCircleId(active.id) &&
    selection.has(Number(active.id));

  if (items.length === 0) return null;

  // 利用者の指示：スマホの指でつかみやすいよう、持ち物の左右の間をあける。上下は画面を広く使えるよう詰める（D-73）
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-2">
      {items.map((item) => (
        <ItemChip
          key={item.id}
          item={item}
          disabled={disabled}
          selected={selection.has(item.id)}
          moving={movingSelection && selection.has(item.id)}
          onSelect={() => onSelect(item.id)}
        />
      ))}
    </ul>
  );
}

function ItemChip({
  item,
  disabled,
  selected,
  moving,
  onSelect,
}: {
  item: PackingListItem;
  disabled: boolean;
  // D-112：選んでいるか
  selected: boolean;
  // 選んだ持ち物と一緒に動かしているところか
  moving: boolean;
  onSelect: () => void;
}) {
  // 選んだ持ち物をつかむと、選んだ持ち物をまとめて移す（D-112）
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: item.id,
    disabled,
    attributes: { roleDescription: "グループへ移動できる持ち物" },
  });

  return (
    <li
      className={`min-w-0 max-w-full ${isDragging || moving ? "opacity-40" : ""}`}
    >
      {/* D-58（利用者の指示で変更）：持ち手を出さず、名前のどこからでも動かせる。
          キーボードでも、このボタンから持ち上げて移動できる。
          押す（Enter キー）と選ぶ・外す（D-112、利用者の指示）。
          ドラッグが始まった後は dnd-kit が click を止めるので、両方は起きない */}
      <button
        ref={setNodeRef}
        type="button"
        {...attributes}
        aria-pressed={selected}
        {...listeners}
        onClick={onSelect}
        data-item-chip={item.id}
        disabled={disabled}
        className={`relative max-w-full cursor-grab touch-manipulation rounded-full border px-4 py-2 text-left wrap-break-word hover:border-brand select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50 ${
          selected
            ? "border-brand bg-brand-soft"
            : "border-line-strong bg-background"
        }`}
      >
        {/* 選んでも幅や文字の位置が変わらないよう、丸い印は右上に重ねる（D-73・D-112、利用者の指示）。 */}
        {selected && (
          <span className="absolute -top-2 -right-2 flex">
            <SelectMark selected />
          </span>
        )}
        <span className="min-w-0">{item.name}</span>
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
