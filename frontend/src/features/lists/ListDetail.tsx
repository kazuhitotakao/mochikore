"use client";

import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  closestCenter,
  pointerWithin,
  type Active,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Over,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import { SaveItemDialog } from "@/features/saved-items/SaveItemDialog";
import { SavedItemPanel } from "@/features/saved-items/SavedItemPanel";
import type {
  Category,
  ItemDeleteResult,
  PackingListDetail,
  PackingListItem,
} from "@/types/api";
import { AddItemRow } from "./AddItemRow";
import { DeletedItems, type DeletedItem } from "./DeletedItems";
import { GroupSection } from "./GroupSection";
import { ItemRow, itemCheckboxId } from "./ItemRow";
import { isNotFound } from "./itemErrors";
import {
  moveItemToGroup,
  reorderVisibleGroups,
  reorderVisibleItems,
} from "./itemOrder";
import { useDelayedHide } from "./useDelayedHide";
import { applyItemDragPreview, type ItemDragPreview } from "./itemDragPreview";
import {
  groupIdOfSection,
  isSectionId,
  itemSortAnnouncements,
  restrictToVerticalAxis,
  screenReaderInstructions,
  sectionId,
  useItemSortSensors,
} from "./itemSorting";
import { LIST_MENU_BUTTON_ID, ListMenu } from "./ListMenu";
import { SelectionList } from "./SelectionList";
import { SHOW_CHECKED_PARAM } from "./showChecked";

// 02_画面配置 共通4：結果の通知は数秒で消す
const NOTICE_DURATION_MS = 5000;

// ItemRow が持ち物のドラッグに持たせる、どのグループの持ち物か
type ItemSortData = { groupId: number | null };

/**
 * D-98：グループの見出しを動かしているときは、ほかのグループの区切りと入れ替える（未分類は最後のまま）。
 * 持ち物を動かしているときは、指やマウスがあるグループの中でいちばん近い持ち物を相手にする。
 * そのグループに見えている持ち物がなければ（空のグループ・全部チェック済みで隠している未分類）、グループそのものを相手にする。
 * キーボードは指の位置がないので、いちばん近い持ち物を相手にする。
 */
const detectSortTarget = (
  args: Parameters<CollisionDetection>[0],
  ungroupedStartLimit: number | null,
): ReturnType<CollisionDetection> => {
  const sections = args.droppableContainers.filter((container) =>
    isSectionId(container.id),
  );
  if (isSectionId(args.active.id)) {
    return closestCenter({
      ...args,
      droppableContainers: sections.filter(
        (container) => container.id !== sectionId(null),
      ),
    });
  }

  const itemTargets = args.droppableContainers.filter(
    (container) => !isSectionId(container.id),
  );
  if (args.pointerCoordinates) {
    const [section] = pointerWithin({ ...args, droppableContainers: sections });
    if (section && isSectionId(section.id)) {
      const groupId = groupIdOfSection(section.id);
      const inSection = itemTargets.filter(
        (container) =>
          (container.data.current as ItemSortData | undefined)?.groupId ===
          groupId,
      );
      // 元のグループが縮んでも、先頭を狙った指の位置を2番目として扱わない。
      // ページ内の座標で比べ、ドラッグ中のスクロールにも追従する。
      if (
        groupId === null &&
        ungroupedStartLimit !== null &&
        args.pointerCoordinates.y + window.scrollY <= ungroupedStartLimit
      ) {
        const activeTarget = inSection.filter(
          (container) => container.id === args.active.id,
        );
        if (activeTarget.length > 0) {
          return closestCenter({
            ...args,
            droppableContainers: activeTarget,
          });
        }
      }
      return inSection.length > 0
        ? closestCenter({ ...args, droppableContainers: inSection })
        : [section];
    }
  }
  // 指がリストの外に出たときは、仮表示の位置へ勝手に保存しない。
  if (args.pointerCoordinates) return [];
  return closestCenter({ ...args, droppableContainers: itemTargets });
};

// 離した相手がどのグループか（未分類は null）。分からなければ undefined
function targetGroupOf(over: Over): number | null | undefined {
  if (isSectionId(over.id)) return groupIdOfSection(over.id);
  return (over.data.current as ItemSortData | undefined)?.groupId;
}

// 動かした持ち物を、相手の持ち物の前に入れるか（指の位置が相手の真ん中より上なら前）
function dropsBefore(
  active: Active,
  over: Over,
  activatorEvent: Event,
): boolean {
  const dragged = active.rect.current.translated;
  if (!dragged) return true;
  const initial = active.rect.current.initial;
  const pressedAt = getEventCoordinates(activatorEvent);
  // 行の上端・下端をつかんだ場合も、指の位置で前後を選ぶ。キーボードは行の中央を使う。
  const y =
    initial && pressedAt
      ? dragged.top + pressedAt.y - initial.top
      : dragged.top + dragged.height / 2;
  return y < over.rect.top + over.rect.height / 2;
}

// API-07 と同じ並び（全体の sort_order、同じならid の小さい順）
function byListOrder(a: PackingListItem, b: PackingListItem): number {
  return a.sort_order - b.sort_order || a.id - b.id;
}

type Props = {
  list: PackingListDetail;
  // SC-07-17：よく使う項目に保存するときのカテゴリーの選択肢（API-18）
  categories: Category[];
  // D-94：チェック済みを表示したまま SC-06・SC-09 へ行って戻ったときだけ true
  initialShowChecked: boolean;
};

// SC-07 自分のリストの内容（通常画面）。持ち物の追加・削除で件数や公開の表示が変わるので、
// 画面の状態として持ち、保存できた値（D-71）で表示を更新する
export function ListDetail({ list, categories, initialShowChecked }: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  // サーバーとブラウザで同じ値になるIDを渡し、読み上げ用の要素のIDをそろえる
  const dndId = useId();
  const sensors = useItemSortSensors();
  const [items, setItems] = useState(list.items);
  // D-98：グループの順番は見出しを動かして変えるので、画面の状態として持つ
  const [groups, setGroups] = useState(list.groups);
  const [draggingItemId, setDraggingItemId] = useState<number | null>(null);
  const [itemDropAllowed, setItemDropAllowed] = useState(false);
  const [itemPreview, setItemPreview] = useState<ItemDragPreview | null>(null);
  const itemPreviewRef = useRef<ItemDragPreview | null>(null);
  const [ungroupedStartLimit, setUngroupedStartLimit] = useState<number | null>(
    null,
  );
  const [isPublic, setIsPublic] = useState(list.is_public);
  const [moderated, setModerated] = useState(Boolean(list.moderated_at));
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // SC-07-12：この画面で削除した持ち物の候補（D-28）
  const [deletedItems, setDeletedItems] = useState<DeletedItem[]>([]);
  const [reordering, setReordering] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  // D-99：見出しのチェックで送信中のグループ（未分類は null、送信中でなければ undefined）
  const [groupChecking, setGroupChecking] = useState<number | null | undefined>(
    undefined,
  );
  const [groupCheckError, setGroupCheckError] = useState<string | null>(null);
  const groupCheckInFlight = useRef(false);
  // D-106：復元や移動の後に、遅れて届いた空グループの応答を反映しない。
  const emptyGroupCheckVersions = useRef(new Map<number, number>());
  // 猶予中の取り消しでは、その操作で新しくチェックした持ち物だけを戻す（利用者の指示）。
  const groupCheckUndo = useRef(new Map<number | null, ReadonlySet<number>>());
  // SC-07-18・D-100：「選んで削除」の選ぶ表示。選んだ持ち物とグループは、この画面の中だけに持つ
  const [selecting, setSelecting] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  // D-94：チェック済みは初めは隠す。画面の中だけの状態で、開き直すと隠した状態から始まる。
  // 表示したまま SC-06・SC-09 へ行って戻ったときだけ、表示を引き継ぐ（利用者の指示）
  const [showChecked, setShowChecked] = useState(initialShowChecked);
  // SC-07-17：よく使う項目に保存しようとしている持ち物。null なら保存のダイアログを出さない
  const [savingItem, setSavingItem] = useState<PackingListItem | null>(null);
  // SC-07-5・SC-08：よく使う項目の選択パネル。この画面の中で開くので、削除した持ち物の候補と
  // チェック済みの表示切替は、開け閉めしても消えない（D-94）
  const [panelOpen, setPanelOpen] = useState(false);
  // D-105：左スワイプで「削除」を出している行（持ち物は item-ID、グループは group-ID）。開けるのは1行だけ
  const [swipeOpenKey, setSwipeOpenKey] = useState<string | null>(null);
  // D-105：見出しを左スワイプして削除しようとしているグループ。確認してから中の持ち物ごと消す
  const [swipeDeleteGroup, setSwipeDeleteGroup] = useState<{
    id: number;
    name: string;
  } | null>(null);
  // 行が隠れた後にカーソルを移す先。表示が変わってから移すので、描画に使わない ref に置く
  const pendingFocusId = useRef<string | null>(null);
  const { delayedIds, hideLater, pauseHide, cancelHide, isWaitingToHide } =
    useDelayedHide(handleHideDelayEnd);
  const {
    delayedIds: delayedGroupIds,
    hideLater: hideGroupLater,
    pauseHide: pauseGroupHide,
    cancelHide: cancelGroupHide,
    isWaitingToHide: isGroupWaitingToHide,
  } = useDelayedHide(handleEmptyGroupHideEnd);

  // D-95：画面は隠れたチェック済みも含む全件（items）を持ち、表示だけを絞る。
  // 隠している間にチェックを付けた持ち物は、少しの間だけ表示に残す（delayedIds）
  const visibleItems = showChecked
    ? items
    : items.filter((item) => !item.is_checked || delayedIds.has(item.id));
  const previewItems = applyItemDragPreview(items, itemPreview);
  const sortableItems = showChecked
    ? previewItems
    : previewItems.filter(
        (item) => !item.is_checked || delayedIds.has(item.id),
      );
  const draggingItem = items.find((item) => item.id === draggingItemId);
  const checkedCount = items.filter((item) => item.is_checked).length;
  // D-101：チェック済みを隠しているときは、中の全有効持ち物がチェック済みのグループ（未分類を含む）を
  // 見出しごと隠す。D-106：0件のグループは保存したチェックを使い、同じ1秒の猶予を保つ。
  const hiddenSectionIds = new Set<number | null>(
    showChecked
      ? []
      : [...groups.map((group) => group.id), null].filter((groupId) =>
          items.some((item) => item.group_id === groupId)
            ? !visibleItems.some((item) => item.group_id === groupId)
            : groupId !== null &&
              groups.some(
                (group) => group.id === groupId && group.is_checked,
              ) &&
              !delayedGroupIds.has(groupId),
        ),
  );
  const visibleGroups = groups.filter(
    (group) => !hiddenSectionIds.has(group.id),
  );

  // D-94：引き継ぎの印はURLから取り除き、再読み込みでは隠した状態から始める
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(SHOW_CHECKED_PARAM)) return;
    url.searchParams.delete(SHOW_CHECKED_PARAM);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // SC-07-7：チェックして行が隠れたら、次の行（なければ表示切替のある「…」ボタン）へカーソルを移す
  useEffect(() => {
    const targetId = pendingFocusId.current;
    if (!targetId) return;
    pendingFocusId.current = null;
    document.getElementById(targetId)?.focus();
  }, [items, delayedIds, groups, delayedGroupIds]);

  // D-106：空の見出しが隠れるときだけ、その中のカーソルをメニューへ移す。
  function handleEmptyGroupHideEnd(groupId: number) {
    if (
      showChecked ||
      !groups.some((group) => group.id === groupId && group.is_checked)
    )
      return;
    if (items.some((item) => item.group_id === groupId)) return;
    const section = document.getElementById(sectionId(groupId));
    const active = document.activeElement;
    // 送信中のdisabledでカーソルが外れた場合も、既存の持ち物と同じ移動先に戻す。
    if (!active || active === document.body || section?.contains(active))
      pendingFocusId.current = LIST_MENU_BUTTON_ID;
  }

  // 少し待った後、チェック済みの行が表示から外れる直前に呼ばれる
  function handleHideDelayEnd(itemId: number) {
    // 待っている間に全部表示へ切り替えた・チェックを外した・削除したときは、何も隠れない
    if (showChecked) return;
    const item = items.find((existing) => existing.id === itemId);
    if (!item?.is_checked) return;

    // D-101：グループの持ち物が全部チェック済みなら、見出しごと隠れる。
    // そのときは、見出しのチェック欄にカーソルがあっても移す
    const sectionItems = items.filter(
      (existing) => existing.group_id === item.group_id,
    );
    const sectionHides = sectionItems.every((existing) => existing.is_checked);
    const row = document.getElementById(itemCheckboxId(itemId))?.closest("li");
    const area = sectionHides ? row?.closest("section") : row;

    // その行（隠れるグループ）にカーソルがあるとき、またはどこにもないときだけ移す。
    // 待っている間に追加欄など別の所へ移っていたら、そのままにする
    const active = document.activeElement;
    const focusInArea = area && active && area.contains(active);
    const focusLost = !active || active === document.body;
    if (!focusInArea && !focusLost) return;

    // 画面の並びで、隠れる所より後ろにある未チェックの持ち物へ移す。なければ「…」ボタンへ
    const displayed = displayOrder();
    const last = sectionHides ? sectionItems[sectionItems.length - 1] : item;
    const next = displayed
      .slice(displayed.indexOf(last) + 1)
      .find((other) => !other.is_checked);
    pendingFocusId.current = next
      ? itemCheckboxId(next.id)
      : LIST_MENU_BUTTON_ID;
  }

  // 画面に出す並び。グループがあるときはグループ順に並べ、未分類を最後に置く（SC-07-6）
  function displayOrder(): PackingListItem[] {
    if (groups.length === 0) return items;
    return [...groups.map((group) => group.id), null].flatMap((groupId) =>
      items.filter((item) => item.group_id === groupId),
    );
  }

  function handleAdded(item: PackingListItem) {
    // API-10：新しい持ち物は全体の末尾に入る
    setItems((current) => [...current, item]);
  }

  // API-11 の成功後に呼ばれる。保存できた値で更新するので、隠す・戻すのも保存できてから（D-94）
  function handleChanged(item: PackingListItem) {
    const before = items.find((existing) => existing.id === item.id);
    if (before && before.is_checked !== item.is_checked) {
      groupCheckUndo.current.delete(item.group_id);
    }
    if (!showChecked && item.is_checked && before && !before.is_checked) {
      hideLater(item.id);
    }
    if (!item.is_checked) cancelHide(item.id);

    setItems((current) =>
      current.map((existing) => (existing.id === item.id ? item : existing)),
    );
  }

  // API-13：このリストのチェックを全部外した。持ち物・順番はそのまま
  function handleChecksReset() {
    groupCheckUndo.current.clear();
    for (const group of groups) {
      cancelGroupHide(group.id);
      emptyGroupCheckVersions.current.set(
        group.id,
        (emptyGroupCheckVersions.current.get(group.id) ?? 0) + 1,
      );
    }
    setGroups((current) =>
      current.map((group) => ({ ...group, is_checked: false })),
    );
    setItems((current) =>
      current.map((item) => ({ ...item, is_checked: false })),
    );
  }

  function handleDeleted(item: PackingListItem, result: ItemDeleteResult) {
    setItems((current) =>
      current.filter((existing) => existing.id !== item.id),
    );
    // 削除した持ち物は候補に移し、新しく削除したものを上に出す
    setDeletedItems((current) => [
      { item },
      ...current.filter((deleted) => deleted.item.id !== item.id),
    ]);
    // D-51：公開中のリストで最後の持ち物を削除すると、自動で非公開になる
    if (isPublic && !result.is_public) {
      setNotice("持ち物がなくなったため、リストを非公開にしました。");
    }
    setIsPublic(result.is_public);
  }

  // API-25：戻した持ち物だけを候補から外し、番号の位置に入れる（D-28・D-31）
  function handleRestored(item: PackingListItem) {
    clearEmptyGroupCheck(item.group_id);
    setItems((current) =>
      [...current.filter((existing) => existing.id !== item.id), item].sort(
        byListOrder,
      ),
    );
    setDeletedItems((current) =>
      current.filter((deleted) => deleted.item.id !== item.id),
    );
    // D-95：チェック済みのまま戻した持ち物は、隠している間は見えないので案内する
    if (item.is_checked && !showChecked) {
      setNotice("戻しました。チェック済みにあります。");
    }
  }

  function handleDragStart({ active }: DragStartEvent) {
    if (isSectionId(active.id)) return;
    setDraggingItemId(Number(active.id));
    setItemDropAllowed(true);
  }

  // F-24・D-98：別グループへ入った時点で空行を移し、その中では通常の並べ替えで周りをずらす。
  // API-19、09_バリデーション16・32行Jメモ（V-10・V-17）と38〜45行Jメモ（C-01〜08）を確認。
  function handleDragOver({ active, over, activatorEvent }: DragOverEvent) {
    if (isSectionId(active.id)) return;
    const current = applyItemDragPreview(items, itemPreviewRef.current);
    const activeItem = current.find((item) => item.id === active.id);
    const to =
      over && activeItem
        ? active.id === over.id
          ? activeItem.group_id
          : targetGroupOf(over)
        : undefined;
    // 保存に使う移動先の判定を、そのまま点線枠の表示にも使う。
    setItemDropAllowed(to !== undefined);
    if (!over || !activeItem) return;
    if (to === undefined || to === activeItem.group_id) return;

    const overItem = current.find((item) => item.id === over.id);
    const before = dropsBefore(active, over, activatorEvent);
    const firstUngrouped = current.find(
      (item) =>
        item.group_id === null &&
        item.id !== activeItem.id &&
        (showChecked || !item.is_checked || delayedIds.has(item.id)),
    );
    setUngroupedStartLimit(
      to === null &&
        overItem !== undefined &&
        firstUngrouped !== undefined &&
        overItem.id === firstUngrouped.id &&
        before
        ? over.rect.top + over.rect.height / 2 + window.scrollY
        : null,
    );
    const moved = moveItemToGroup(
      current,
      activeItem.id,
      to,
      overItem ? { id: overItem.id, before } : null,
    );
    const preview = {
      itemId: activeItem.id,
      groupId: to,
      itemIds: moved.map((item) => item.id),
    };
    itemPreviewRef.current = preview;
    setItemPreview(preview);
  }

  function clearDragState() {
    setItemDropAllowed(false);
    setUngroupedStartLimit(null);
    itemPreviewRef.current = null;
    setItemPreview(null);
    setDraggingItemId(null);
  }

  // 仮表示は保存済みitemsと分け、Esc・対象外へのドロップでは通信せず元へ戻す。
  async function handleDragEnd({ active, over, activatorEvent }: DragEndEvent) {
    const current = applyItemDragPreview(items, itemPreviewRef.current);
    clearDragState();
    if (!over) return;

    if (isSectionId(active.id)) {
      if (active.id !== over.id) await saveGroupOrder(active.id, over.id);
      return;
    }

    const original = items.find((item) => item.id === active.id);
    const activeItem = current.find((item) => item.id === active.id);
    if (!original || !activeItem) return;
    const targetGroupId =
      active.id === over.id ? activeItem.group_id : targetGroupOf(over);
    if (targetGroupId === undefined) return;
    const overItem = current.find((item) => item.id === over.id);

    let moved = current;
    if (targetGroupId !== activeItem.group_id) {
      moved = moveItemToGroup(
        current,
        activeItem.id,
        targetGroupId,
        overItem
          ? {
              id: overItem.id,
              before: dropsBefore(active, over, activatorEvent),
            }
          : null,
      );
    } else if (overItem && active.id !== over.id) {
      moved = reorderVisibleItems(
        current,
        current.filter(
          (item) =>
            item.group_id === targetGroupId &&
            (showChecked || !item.is_checked || delayedIds.has(item.id)),
        ),
        activeItem.id,
        overItem.id,
      );
    }

    const changedGroup = original.group_id !== targetGroupId;
    if (!changedGroup) {
      // D-95：別グループから戻った場合も、隠れた持ち物と他グループの位置は元のままにする。
      const inGroup = visibleItems.filter(
        (item) => item.group_id === targetGroupId,
      );
      const previewGroup = moved.filter(
        (item) =>
          item.group_id === targetGroupId &&
          (showChecked || !item.is_checked || delayedIds.has(item.id)),
      );
      const newIndex = previewGroup.findIndex(
        (item) => item.id === activeItem.id,
      );
      const anchor = inGroup[newIndex];
      if (!anchor) return;
      moved = reorderVisibleItems(items, inGroup, activeItem.id, anchor.id);
    }
    if (
      !changedGroup &&
      moved.every((item, index) => item.id === items[index]?.id)
    ) {
      return;
    }
    await saveItemOrder(
      moved.map((item, index) => ({ ...item, sort_order: index + 1 })),
      changedGroup
        ? { item_id: activeItem.id, group_id: targetGroupId }
        : undefined,
    );
  }

  // D-98：グループの見出しを動かして、中の持ち物ごとグループの順番を変える（API-36）。
  // D-101：表示中のグループが占める位置だけを入れ替え、隠したグループの位置は保つ。API-36 には全グループのIDを送る
  async function saveGroupOrder(activeId: string, overId: string | number) {
    const activeGroup = visibleGroups.find(
      (group) => sectionId(group.id) === activeId,
    );
    const overGroup = visibleGroups.find(
      (group) => sectionId(group.id) === overId,
    );
    if (!activeGroup || !overGroup || activeGroup === overGroup) return;

    const before = groups;
    const next = reorderVisibleGroups(
      groups,
      visibleGroups,
      activeGroup.id,
      overGroup.id,
    );
    setGroups(next);
    setReordering(true);
    setReorderError(null);
    try {
      await clientApi<void>(`/lists/${list.id}/groups/order`, {
        method: "PATCH",
        body: { group_ids: next.map((group) => group.id) },
      });
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      if (isNotFound(failure)) {
        router.refresh();
        return;
      }
      setGroups(before);
      setReorderError(groupOrderErrorMessage(failure));
    } finally {
      setReordering(false);
    }
  }

  async function saveItemOrder(
    moved: PackingListItem[],
    move?: { item_id: number; group_id: number | null },
  ) {
    const before = items;
    setItems(moved);
    setReordering(true);
    setReorderError(null);
    try {
      await clientApi<void>(`/lists/${list.id}/items/order`, {
        method: "PATCH",
        body: { item_ids: moved.map((item) => item.id), ...(move && { move }) },
      });
      if (move) clearEmptyGroupCheck(move.group_id);
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      if (isNotFound(failure)) {
        router.refresh();
        return;
      }
      setItems(before);
      setReorderError(reorderErrorMessage(failure));
    } finally {
      setReordering(false);
    }
  }

  // 名前付きグループの中だけ1段下げ、末尾の持ち物は見出しと同じ列にそろえる（利用者の指示）。
  // pl-7 はチェック欄（size-5）と見出しとのすき間（gap-2）を合わせた幅
  function renderItems(sectionItems: PackingListItem[], indented = false) {
    return (
      <SortableContext
        items={sectionItems}
        strategy={verticalListSortingStrategy}
      >
        <ul className={`flex flex-col ${indented ? "pl-7" : ""}`}>
          {sectionItems.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onChanged={handleChanged}
              onDeleted={handleDeleted}
              onSaveAsFavorite={setSavingItem}
              sortDisabled={reordering}
              dropAllowed={itemDropAllowed}
              {...swipeProps(`item-${item.id}`)}
            />
          ))}
        </ul>
      </SortableContext>
    );
  }

  // D-106：持ち物が入ったグループに、空だったときのチェックを残さない。
  function clearEmptyGroupCheck(groupId: number | null) {
    if (groupId === null) return;
    emptyGroupCheckVersions.current.set(
      groupId,
      (emptyGroupCheckVersions.current.get(groupId) ?? 0) + 1,
    );
    cancelGroupHide(groupId);
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId ? { ...group, is_checked: false } : group,
      ),
    );
  }

  // API-42・V-23（46行Jメモ）・C-01〜08。取り消し中は非表示を止める。
  async function handleEmptyGroupCheck(groupId: number) {
    const group = groups.find((existing) => existing.id === groupId);
    if (!group || groupCheckInFlight.current) return;
    const checked = !group.is_checked;
    const version = emptyGroupCheckVersions.current.get(groupId) ?? 0;
    const undoing = group.is_checked && isGroupWaitingToHide(groupId);
    if (group.is_checked && !showChecked && !undoing) return;
    groupCheckInFlight.current = true;
    setGroupChecking(groupId);
    setGroupCheckError(null);
    if (undoing) pauseGroupHide(groupId);
    try {
      await clientApi<void>(`/groups/${groupId}/check`, {
        method: "PATCH",
        body: { is_checked: checked },
      });
      if ((emptyGroupCheckVersions.current.get(groupId) ?? 0) !== version)
        return;
      if (!checked) cancelGroupHide(groupId);
      else if (!showChecked) hideGroupLater(groupId);
      setGroups((current) =>
        current.map((existing) =>
          existing.id === groupId
            ? { ...existing, is_checked: checked }
            : existing,
        ),
      );
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      if (isNotFound(failure)) {
        router.refresh();
        return;
      }
      if (undoing) hideGroupLater(groupId);
      setGroupCheckError(groupCheckErrorMessage(failure));
    } finally {
      groupCheckInFlight.current = false;
      setGroupChecking(undefined);
    }
  }

  // F-25・D-99：全件チェック後、隠れるまでの1秒間だけ直前の状態へ戻せる（利用者の指示）。
  // API-37、09_バリデーション15・34行Jメモ（V-09・V-19）と38〜45行Jメモ（C-01〜08）を確認。
  async function handleGroupCheck(groupId: number | null) {
    const groupItems = items.filter((item) => item.group_id === groupId);
    if (groupItems.length === 0) {
      if (groupId !== null) await handleEmptyGroupCheck(groupId);
      return;
    }
    if (groupCheckInFlight.current) return;

    const allChecked = groupItems.every((item) => item.is_checked);
    const previousIds = groupCheckUndo.current.get(groupId);
    const undoItems = groupItems.filter(
      (item) => previousIds?.has(item.id) && isWaitingToHide(item.id),
    );
    const undoing = !showChecked && allChecked && undoItems.length > 0;
    // D-99：表示中は全件解除し、非表示中は猶予内の取り消しだけにする。
    const uncheckingAll = allChecked && !undoing && showChecked;
    if (allChecked && !undoing && !uncheckingAll) return;

    const targets = undoing ? undoItems : groupItems;
    const targetIds = new Set(targets.map((item) => item.id));
    const checked = !undoing && !uncheckingAll;
    const changedItems = targets.filter((item) => item.is_checked !== checked);
    groupCheckInFlight.current = true;
    setGroupChecking(groupId);
    setGroupCheckError(null);
    if (undoing) {
      for (const item of targets) pauseHide(item.id);
    }
    try {
      await clientApi<void>(`/lists/${list.id}/items/checks`, {
        method: "PATCH",
        body: { item_ids: [...targetIds], is_checked: checked },
      });
      if (undoing) {
        groupCheckUndo.current.delete(groupId);
        for (const item of targets) cancelHide(item.id);
      } else if (!showChecked) {
        groupCheckUndo.current.set(
          groupId,
          new Set(changedItems.map((item) => item.id)),
        );
        for (const item of changedItems) hideLater(item.id);
      } else {
        groupCheckUndo.current.delete(groupId);
      }
      setItems((current) =>
        current.map((item) =>
          targetIds.has(item.id) ? { ...item, is_checked: checked } : item,
        ),
      );
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      if (isNotFound(failure)) {
        router.refresh();
        return;
      }
      // 取り消しに失敗したらチェック済みのまま待ち直す。通信は自動再送しない。
      if (undoing) {
        for (const item of targets) hideLater(item.id);
      }
      setGroupCheckError(groupCheckErrorMessage(failure));
    } finally {
      groupCheckInFlight.current = false;
      setGroupChecking(undefined);
    }
  }

  // SC-07-18：選ぶ表示を始める・やめる。やめたら選んだものを消す。削除した持ち物の候補は消さない
  function setSelectingMode(on: boolean) {
    setSelecting(on);
    setSelectedItemIds(new Set());
    setSelectedGroupIds(new Set());
    setBulkDeleteError(null);
    // D-105：「選んで削除」の間は左スワイプを使わない。戻ったときに「削除」を開いたまま残さない
    setSwipeOpenKey(null);
  }

  function toggleInSet(
    set: ReadonlySet<number>,
    id: number,
  ): ReadonlySet<number> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  // 削除する持ち物：1件ずつ選んだものと、選んだグループの中の全有効持ち物（隠れたチェック済みも含む）
  const deleteTargetIds = items
    .filter(
      (item) =>
        selectedItemIds.has(item.id) ||
        (item.group_id !== null && selectedGroupIds.has(item.group_id)),
    )
    .map((item) => item.id);

  // SC-07-19：確認文。グループを選んだときは、グループも消えることを添える
  function bulkDeleteMessage(): string {
    const itemCount = deleteTargetIds.length;
    const groupCount = selectedGroupIds.size;
    if (itemCount === 0) {
      return `選んだグループ（${groupCount}件）を削除しますか？元に戻せません。`;
    }
    const groupNote =
      groupCount > 0 ? `グループ（${groupCount}件）も削除します。` : "";
    return `選んだ持ち物（${itemCount}件）を削除しますか？元に戻せません。${groupNote}`;
  }

  // F-26・D-100：持ち物とグループをまとめて削除する（API-38）。確認してから消すので、戻す候補には入れない。
  // 「選んで削除」と、見出しの左スワイプ（D-105）の両方で使う。消せたら true
  async function deleteItemsAndGroups(
    itemIds: number[],
    groupIds: number[],
  ): Promise<boolean> {
    setBulkDeleting(true);
    setBulkDeleteError(null);
    try {
      const result = await clientApi<ItemDeleteResult>(
        `/lists/${list.id}/items/bulk-delete`,
        { method: "POST", body: { item_ids: itemIds, group_ids: groupIds } },
      );
      const removedItems = new Set(itemIds);
      const removedGroups = new Set(groupIds);
      setItems((current) =>
        current.filter((item) => !removedItems.has(item.id)),
      );
      setGroups((current) =>
        current.filter((group) => !removedGroups.has(group.id)),
      );
      // D-51：公開中のリストで持ち物が0件になると、自動で非公開になる
      if (isPublic && !result.is_public) {
        setNotice("持ち物がなくなったため、リストを非公開にしました。");
      }
      setIsPublic(result.is_public);
      return true;
    } catch (failure) {
      if (redirectIfAuthError(failure)) return false;
      if (isNotFound(failure)) {
        router.refresh();
        return false;
      }
      // 失敗したときは選んだものを残し、確認の中に理由を出す
      setBulkDeleteError(bulkDeleteErrorMessage(failure));
      return false;
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleBulkDelete() {
    if (await deleteItemsAndGroups(deleteTargetIds, [...selectedGroupIds])) {
      setConfirmingDelete(false);
      setSelectingMode(false);
    }
  }

  // D-105：左スワイプで「削除」を出せるのは1行だけ。別の行を引いたら前の行は閉じる
  function swipeProps(key: string) {
    return {
      swipeOpen: swipeOpenKey === key,
      onSwipeOpenChange: (open: boolean) =>
        setSwipeOpenKey((current) =>
          open ? key : current === key ? null : current,
        ),
    };
  }

  // D-105（利用者の指示）：見出しの左スワイプで消すグループは、中の全有効持ち物（隠れたチェック済みも含む）ごと消す。
  // 「選んで削除」でグループを選んだときと同じで、元に戻せない（D-100）
  const swipeDeleteItemIds = swipeDeleteGroup
    ? items
        .filter((item) => item.group_id === swipeDeleteGroup.id)
        .map((item) => item.id)
    : [];

  function swipeDeleteMessage(): string {
    if (!swipeDeleteGroup) return "";
    const count = swipeDeleteItemIds.length;
    return count === 0
      ? `「${swipeDeleteGroup.name}」を削除しますか？元に戻せません。`
      : `「${swipeDeleteGroup.name}」と中の持ち物（${count}件）を削除しますか？元に戻せません。`;
  }

  async function handleSwipeGroupDelete() {
    if (!swipeDeleteGroup) return;
    if (await deleteItemsAndGroups(swipeDeleteItemIds, [swipeDeleteGroup.id])) {
      setSwipeDeleteGroup(null);
    }
  }

  function renderSection(groupId: number | null, title: string) {
    const sectionItems = sortableItems.filter(
      (item) => item.group_id === groupId,
    );
    const groupItems = items.filter((item) => item.group_id === groupId);
    const total = groupItems.length;
    // 隠れたチェック済みも含め、全件チェック済みのときだけ印を付ける（利用者の指示、D-99を変更）。
    const allChecked =
      total > 0
        ? groupItems.every((item) => item.is_checked)
        : groups.some((group) => group.id === groupId && group.is_checked);

    return (
      // SC-07-6：件数は画面に出している持ち物だけを数え、チェック済みを隠しているときは含めない
      // （D-95、利用者の指示）。空のグループは「0件」
      <GroupSection
        key={sectionId(groupId)}
        groupId={groupId}
        title={title}
        count={sectionItems.length}
        sortDisabled={reordering}
        allChecked={allChecked}
        // 全件チェック済みでも持ち物と同じ色を保ち、猶予中は取り消せる（利用者の指示）。
        checkDisabled={groupChecking !== undefined || reordering}
        onToggleCheck={() => void handleGroupCheck(groupId)}
        // D-105：名前付きグループの見出しだけ。未分類には見出しがないので使わない
        {...swipeProps(`group-${groupId}`)}
        swipeDisabled={bulkDeleting || groupChecking !== undefined}
        onSwipeDelete={() => {
          if (groupId === null) return;
          setBulkDeleteError(null);
          setSwipeDeleteGroup({ id: groupId, name: title });
        }}
      >
        {renderItems(sectionItems, groupId !== null)}
        {groupId === null && (
          // 利用者の指示で、空の未分類にも入力行を残す。未保存の行は件数に含めない。
          <div>
            <AddItemRow listId={list.id} onAdded={handleAdded} />
          </div>
        )}
      </GroupSection>
    );
  }

  const footerVisible = selecting || notice || reorderError || groupCheckError;

  return (
    <>
      {/* 選ぶ表示の操作や通知を出している間は、最後の行が固定表示に隠れないよう余白をとる。 */}
      <div
        className={`flex flex-col gap-6 ${footerVisible ? "pb-40" : "pb-8"}`}
      >
        {/* SC-07-2・4 */}
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-2xl font-medium wrap-break-word">
              {list.title}
            </h1>
            {/* 利用者の指示で、持ち物の件数は出さない（D-95） */}
            <p className="flex flex-wrap gap-2">
              <span className="tag">{list.category.name}</span>
              <span className={isPublic ? "tag" : "tag-muted"}>
                {isPublic ? "公開" : "非公開"}
              </span>
            </p>
          </div>
          {/* 選ぶ表示の間は、ほかの操作をしない（D-100） */}
          {!selecting && (
            <ListMenu
              listId={list.id}
              title={list.title}
              isPublic={isPublic}
              moderated={moderated}
              onVisibilityChanged={(value) => {
                setIsPublic(value);
                setNotice(
                  value
                    ? "リストを公開しました。"
                    : "リストを非公開にしました。",
                );
              }}
              onVisibilityError={setVisibilityError}
              onModerated={() => {
                setModerated(true);
                setIsPublic(false);
                setVisibilityError(null);
              }}
              showChecked={showChecked}
              checkedCount={checkedCount}
              onToggleChecked={() => setShowChecked((shown) => !shown)}
              onChecksReset={handleChecksReset}
              hasDeletedItems={deletedItems.length > 0}
              saving={reordering || groupChecking !== undefined}
              canSelectToDelete={items.length > 0 || groups.length > 0}
              onSelectToDelete={() => setSelectingMode(true)}
            />
          )}
        </header>

        {visibilityError && (
          <p role="alert" className="text-danger">
            {visibilityError}
          </p>
        )}
        {moderated && (
          <p
            id="list-moderated-notice"
            role="alert"
            className="text-sm text-muted"
          >
            このリストは運営により非公開になっています。 お問い合わせ：
            <a
              href="mailto:simasyam@gmail.com"
              className="text-link tap-target"
            >
              simasyam@gmail.com
            </a>
          </p>
        )}

        {/* SC-07-3：説明文があるときだけ。途中の改行はそのまま見せる */}
        {list.description && (
          <p className="whitespace-pre-wrap">{list.description}</p>
        )}

        {/* SC-07-5 */}
        {!selecting && (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="self-start btn-outline btn-sm"
          >
            よく使う項目から追加
          </button>
        )}

        {selecting && (
          // SC-07-18：「選んで削除」の選ぶ表示。隠したグループは出さない（D-101）
          <SelectionList
            groups={groups}
            hiddenGroupIds={hiddenSectionIds}
            visibleItems={visibleItems}
            selectedItemIds={selectedItemIds}
            selectedGroupIds={selectedGroupIds}
            disabled={bulkDeleting}
            onToggleItem={(itemId) =>
              setSelectedItemIds((current) => toggleInSet(current, itemId))
            }
            onToggleGroup={(groupId) =>
              setSelectedGroupIds((current) => toggleInSet(current, groupId))
            }
          />
        )}

        {/* 空のリストや選ぶ表示へ変わっても同じ入力行を残し、下書きと連続入力のカーソルを保つ。 */}
        <div className={selecting ? "hidden" : "flex flex-col gap-6"}>
          {/* SC-07-11・D-106：持ち物やチェック済みの空グループがすべて隠れた場合に案内する。
              未チェックの空リストは追加行で分かるので、案内文を出さない。 */}
          {(items.length > 0 || groups.some((group) => group.is_checked)) &&
            visibleItems.length === 0 &&
            visibleGroups.length === 0 && (
              <p>
                すべてチェック済みです。右上の「…」の『チェック済みを表示』から確認できます。
              </p>
            )}
          <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={(args) =>
              detectSortTarget(args, ungroupedStartLimit)
            }
            // 表示件数が変わった未分類も、持ち物の移動先として測り直す（D-98）。
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
            modifiers={[restrictToVerticalAxis]}
            accessibility={{
              announcements: itemSortAnnouncements(sortableItems, groups),
              screenReaderInstructions,
            }}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={(event) => void handleDragEnd(event)}
            onDragCancel={clearDragState}
          >
            {/* D-98・D-101：表示中のグループだけを並べ替え、未分類は最後に置く。 */}
            <SortableContext
              items={visibleGroups.map((group) => sectionId(group.id))}
              strategy={verticalListSortingStrategy}
            >
              {visibleGroups.map((group) =>
                renderSection(group.id, group.name),
              )}
            </SortableContext>
            {renderSection(null, "未分類")}
            <DragOverlay adjustScale={false}>
              {draggingItem && (
                <div
                  aria-hidden="true"
                  className="flex items-center gap-2 border-b border-line-soft bg-background py-2 shadow-md"
                >
                  <input
                    type="checkbox"
                    checked={draggingItem.is_checked}
                    readOnly
                    tabIndex={-1}
                    className="size-5 shrink-0"
                  />
                  <span className="min-w-0 flex-1 wrap-break-word">
                    {draggingItem.name}
                  </span>
                  {/* 元の行と同じ寸法で動かす（D-98）ので、行の「…」と同じ大きさにする */}
                  <span className="flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-muted">
                    …
                  </span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>

        <DeletedItems
          deletedItems={deletedItems}
          onRestored={handleRestored}
          // D-103：確定は画面の候補から消すだけで、APIは呼ばない（持ち物は定期処理で完全に消える、D-35）
          onConfirm={(itemId) =>
            setDeletedItems((current) =>
              current.filter((deleted) => deleted.item.id !== itemId),
            )
          }
          onConfirmAll={() => setDeletedItems([])}
        />

        {panelOpen && (
          <SavedItemPanel
            listId={list.id}
            listCategoryId={list.category.id}
            categories={categories}
            onClose={() => setPanelOpen(false)}
            onAdded={(added) => {
              // API-34：選んだ順に末尾へ入った。SC-08-6：成功したらパネルを閉じて SC-07 に足す
              setItems((current) => [...current, ...added]);
              setPanelOpen(false);
            }}
            onListReloaded={(latest) => {
              // SC-08-6：409 で読み直した最新の持ち物を表示する。削除した持ち物の候補と表示切替は残す
              setItems(latest);
            }}
          />
        )}

        {savingItem && (
          <SaveItemDialog
            key={savingItem.id}
            item={savingItem}
            categories={categories}
            defaultCategoryId={list.category.id}
            onClose={() => setSavingItem(null)}
            onSaved={() => {
              setSavingItem(null);
              // SC-07-17・共通4：保存できたら知らせる。保存した持ち物そのものは変わらない（D-66）
              setNotice("保存しました");
            }}
          />
        )}
      </div>

      {footerVisible && (
        <div className="fixed bottom-0 left-1/2 w-full max-w-[640px] -translate-x-1/2 border-t border-line bg-background sm:border-x">
          <div className="flex flex-col gap-2 px-5 py-3">
            {notice && (
              <p role="status" className="text-sm">
                {notice}
              </p>
            )}
            {reorderError && (
              <p role="alert" className="text-sm text-danger">
                {reorderError}
              </p>
            )}
            {groupCheckError && (
              <p role="alert" className="text-sm text-danger">
                {groupCheckError}
              </p>
            )}
            {selecting ? (
              // SC-07-18：選ぶ表示の間は、追加欄の代わりに選んだ件数と「削除」「やめる」を出す
              <div className="flex items-center justify-between gap-3">
                <p role="status">
                  {deleteTargetIds.length}件選択中
                  {selectedGroupIds.size > 0 &&
                    `（グループ${selectedGroupIds.size}件）`}
                </p>
                <div className="flex shrink-0 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectingMode(false)}
                    disabled={bulkDeleting}
                    className="btn-outline"
                  >
                    やめる
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkDeleteError(null);
                      setConfirmingDelete(true);
                    }}
                    disabled={
                      bulkDeleting ||
                      (deleteTargetIds.length === 0 &&
                        selectedGroupIds.size === 0)
                    }
                    className="btn-danger"
                  >
                    削除
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* SC-07-19：まとめて削除の確認。元に戻せないことを伝える（D-100） */}
      <ConfirmDialog
        open={confirmingDelete}
        message={bulkDeleteMessage()}
        confirmLabel="削除する"
        cancelLabel="やめる"
        busy={bulkDeleting}
        destructive
        error={bulkDeleteError}
        onConfirm={() => void handleBulkDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />

      {/* D-105：見出しを左スワイプしたグループの削除の確認。中の持ち物も消え、元に戻せないことを伝える */}
      <ConfirmDialog
        open={swipeDeleteGroup !== null}
        message={swipeDeleteMessage()}
        confirmLabel="削除する"
        cancelLabel="やめる"
        busy={bulkDeleting}
        destructive
        error={bulkDeleteError}
        onConfirm={() => void handleSwipeGroupDelete()}
        onCancel={() => {
          setSwipeDeleteGroup(null);
          setBulkDeleteError(null);
        }}
      />
    </>
  );
}

// V-20：まとめて削除の送信が正しくないのは、ほかの画面で持ち物やグループが変わったときなので、読み直しを案内する
function bulkDeleteErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === "validation_error") {
    return "削除する持ち物の情報が正しくありません。リストを読み直してください。";
  }

  return NETWORK_ERROR_MESSAGE;
}

// V-10・V-17：並べ替えの送信が正しくないのは、ほかの画面で持ち物やグループが変わったときなので、読み直しを案内する
function reorderErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === "validation_error") {
    return "並べ替える持ち物の情報が正しくありません。リストを読み直してください。";
  }

  return NETWORK_ERROR_MESSAGE;
}

// V-18：グループの順番の送信が正しくないのは、ほかの画面でグループが増減したときなので、読み直しを案内する
function groupOrderErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === "validation_error") {
    return "リストの情報を読み直してください。";
  }

  return NETWORK_ERROR_MESSAGE;
}

// V-19：まとめてチェックの送信が正しくないのは、ほかの画面で持ち物が増減したときなので、読み直しを案内する
function groupCheckErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === "validation_error") {
    // V-23：空グループに持ち物が入った場合は、確定した項目別の文言を保つ。
    return (
      error.errors.is_checked?.[0] ??
      "チェックする持ち物の情報が正しくありません。リストを読み直してください。"
    );
  }

  return NETWORK_ERROR_MESSAGE;
}
