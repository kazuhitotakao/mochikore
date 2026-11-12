"use client";

import {
  DndContext,
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
import { AddItemForm } from "./AddItemForm";
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
const detectSortTarget: CollisionDetection = (args) => {
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
      return inSection.length > 0
        ? closestCenter({ ...args, droppableContainers: inSection })
        : [section];
    }
  }
  return closestCenter({ ...args, droppableContainers: itemTargets });
};

// 離した相手がどのグループか（未分類は null）。分からなければ undefined
function targetGroupOf(over: Over): number | null | undefined {
  if (isSectionId(over.id)) return groupIdOfSection(over.id);
  return (over.data.current as ItemSortData | undefined)?.groupId;
}

// 動かした持ち物を、相手の持ち物の前に入れるか（指の位置が相手の真ん中より上なら前）
function dropsBefore(active: Active, over: Over): boolean {
  const dragged = active.rect.current.translated;
  if (!dragged) return true;
  return (
    dragged.top + dragged.height / 2 < over.rect.top + over.rect.height / 2
  );
}

// API-07 と同じ並び（全体の sort_order、同じならid の小さい順）
function byListOrder(a: PackingListItem, b: PackingListItem): number {
  return a.sort_order - b.sort_order || a.id - b.id;
}

type Props = {
  list: PackingListDetail;
  // SC-07-17：よく使う項目に保存するときのカテゴリーの選択肢（API-18）
  categories: Category[];
};

// SC-07 自分のリストの内容（通常画面）。持ち物の追加・削除で件数や公開の表示が変わるので、
// 画面の状態として持ち、保存できた値（D-71）で表示を更新する
export function ListDetail({ list, categories }: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  // サーバーとブラウザで同じ値になるIDを渡し、読み上げ用の要素のIDをそろえる
  const dndId = useId();
  const sensors = useItemSortSensors();
  const [items, setItems] = useState(list.items);
  // D-98：グループの順番は見出しを動かして変えるので、画面の状態として持つ
  const [groups, setGroups] = useState(list.groups);
  // 持ち物を動かしている間は、空の未分類も置き場所として見せる
  const [draggingItemId, setDraggingItemId] = useState<number | null>(null);
  // 持ち物を別のグループへ動かそうとしているときの、移す先（undefined は別のグループの上にいない）
  const [dropGroupId, setDropGroupId] = useState<number | null | undefined>(
    undefined,
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
  // D-94：チェック済みは初めは隠す。画面の中だけの状態で、開き直すと隠した状態から始まる
  const [showChecked, setShowChecked] = useState(false);
  // SC-07-17：よく使う項目に保存しようとしている持ち物。null なら保存のダイアログを出さない
  const [savingItem, setSavingItem] = useState<PackingListItem | null>(null);
  // SC-07-5・SC-08：よく使う項目の選択パネル。この画面の中で開くので、削除した持ち物の候補と
  // チェック済みの表示切替は、開け閉めしても消えない（D-94）
  const [panelOpen, setPanelOpen] = useState(false);
  // 行が隠れた後にカーソルを移す先。表示が変わってから移すので、描画に使わない ref に置く
  const pendingFocusId = useRef<string | null>(null);
  const { delayedIds, hideLater, cancelHide } =
    useDelayedHide(handleHideDelayEnd);

  // D-95：画面は隠れたチェック済みも含む全件（items）を持ち、表示だけを絞る。
  // 隠している間にチェックを付けた持ち物は、少しの間だけ表示に残す（delayedIds）
  const visibleItems = showChecked
    ? items
    : items.filter((item) => !item.is_checked || delayedIds.has(item.id));
  const checkedCount = items.filter((item) => item.is_checked).length;
  // D-101：チェック済みを隠しているときは、中の全有効持ち物がチェック済みのグループ（未分類を含む）を
  // 見出しごと隠す。1秒おいて隠す持ち物（delayedIds）が残っている間は、まだ出しておく。0件のグループは隠さない
  const hiddenSectionIds = new Set<number | null>(
    showChecked
      ? []
      : [...groups.map((group) => group.id), null].filter(
          (groupId) =>
            items.some((item) => item.group_id === groupId) &&
            !visibleItems.some((item) => item.group_id === groupId),
        ),
  );
  const visibleGroups = groups.filter(
    (group) => !hiddenSectionIds.has(group.id),
  );

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
  }, [items, delayedIds]);

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
    setItems((current) =>
      current.map((item) => ({ ...item, is_checked: false })),
    );
  }

  function handleDeleted(item: PackingListItem, result: ItemDeleteResult) {
    const position = items.findIndex((existing) => existing.id === item.id) + 1;
    setItems((current) =>
      current.filter((existing) => existing.id !== item.id),
    );
    // 削除した持ち物は候補に移し、新しく削除したものを上に出す
    setDeletedItems((current) => [
      { item, position },
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
    if (!isSectionId(active.id)) setDraggingItemId(Number(active.id));
  }

  // D-98：持ち物を別のグループの上へ動かしている間は、移す先のグループを枠で示す
  function handleDragOver({ active, over }: DragOverEvent) {
    if (isSectionId(active.id) || !over) {
      setDropGroupId(undefined);
      return;
    }
    const from = (active.data.current as ItemSortData | undefined)?.groupId;
    const to = targetGroupOf(over);
    setDropGroupId(to !== undefined && to !== from ? to : undefined);
  }

  function clearDragState() {
    setDraggingItemId(null);
    setDropGroupId(undefined);
  }

  // SC-07-9・F-15：離したら自動で保存する（API-19）。動かした順に先に表示し、失敗したら元の順に戻す
  async function handleDragEnd({ active, over }: DragEndEvent) {
    clearDragState();
    if (!over || active.id === over.id) return;

    if (isSectionId(active.id)) {
      await saveGroupOrder(active.id, over.id);
      return;
    }

    const activeItem = items.find((item) => item.id === active.id);
    if (!activeItem) return;
    const targetGroupId = targetGroupOf(over);
    if (targetGroupId === undefined) return;
    const overItem = isSectionId(over.id)
      ? undefined
      : items.find((item) => item.id === over.id);

    if (targetGroupId === activeItem.group_id) {
      // 同じグループの見出しで離したときは動かさない
      if (!overItem) return;
      // D-95：そのグループで表示中の持ち物が占める位置だけを入れ替え、ほかのグループと
      // 隠れているチェック済みの位置は保つ。API-19 には全有効IDを送る
      const moved = reorderVisibleItems(
        items,
        visibleItems.filter((item) => item.group_id === activeItem.group_id),
        activeItem.id,
        overItem.id,
      );
      await saveItemOrder(moved);
      return;
    }

    // D-98：別のグループ（または未分類）へ動かしたときは、所属と全体の順番を一緒に保存する
    const moved = moveItemToGroup(
      items,
      activeItem.id,
      targetGroupId,
      overItem ? { id: overItem.id, before: dropsBefore(active, over) } : null,
    );
    await saveItemOrder(moved, {
      item_id: activeItem.id,
      group_id: targetGroupId,
    });
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
      // D-31：並べ替えた後は、削除した持ち物を戻すと一番下に入る
      setDeletedItems((current) =>
        current.map((deleted) => ({ ...deleted, movesToBottom: true })),
      );
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

  // indented：グループの中の持ち物は、見出しのチェック欄と同じ列に並ばないよう1段右に下げる（利用者の指示）。
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
            />
          ))}
        </ul>
      </SortableContext>
    );
  }

  // F-25・D-99：見出しのチェックで、そのグループの全有効持ち物（隠れたチェック済みも含む）を
  // まとめてチェックする。全部チェック済みなら全部外す（API-37）。成功してから表示を変える
  async function handleGroupCheck(groupId: number | null) {
    const targets = items.filter((item) => item.group_id === groupId);
    if (targets.length === 0 || groupChecking !== undefined) return;

    const checked = !targets.every((item) => item.is_checked);
    const targetIds = new Set(targets.map((item) => item.id));
    setGroupChecking(groupId);
    setGroupCheckError(null);
    try {
      await clientApi<void>(`/lists/${list.id}/items/checks`, {
        method: "PATCH",
        body: { item_ids: [...targetIds], is_checked: checked },
      });
      // D-94：隠している間は、新しくチェックを付けた持ち物を1秒おいて隠す。外したものは隠さない
      for (const item of targets) {
        if (checked && !item.is_checked && !showChecked) hideLater(item.id);
        if (!checked) cancelHide(item.id);
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
      // 失敗したときは、チェックも表示も元のまま
      setGroupCheckError(groupCheckErrorMessage(failure));
    } finally {
      setGroupChecking(undefined);
    }
  }

  // SC-07-18：選ぶ表示を始める・やめる。やめたら選んだものを消す。削除した持ち物の候補は消さない
  function setSelectingMode(on: boolean) {
    setSelecting(on);
    setSelectedItemIds(new Set());
    setSelectedGroupIds(new Set());
    setBulkDeleteError(null);
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

  // F-26・D-100：選んだ持ち物とグループをまとめて削除する（API-38）。確認してから消すので、戻す候補には入れない
  async function handleBulkDelete() {
    const itemIds = deleteTargetIds;
    const groupIds = [...selectedGroupIds];
    setBulkDeleting(true);
    setBulkDeleteError(null);
    try {
      const result = await clientApi<ItemDeleteResult>(
        `/lists/${list.id}/items/bulk-delete`,
        { method: "POST", body: { item_ids: itemIds, group_ids: groupIds } },
      );
      const removed = new Set(itemIds);
      setItems((current) => current.filter((item) => !removed.has(item.id)));
      setGroups((current) =>
        current.filter((group) => !selectedGroupIds.has(group.id)),
      );
      // D-51：公開中のリストで持ち物が0件になると、自動で非公開になる
      if (isPublic && !result.is_public) {
        setNotice("持ち物がなくなったため、リストを非公開にしました。");
      }
      setIsPublic(result.is_public);
      setConfirmingDelete(false);
      setSelectingMode(false);
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      if (isNotFound(failure)) {
        router.refresh();
        return;
      }
      // 失敗したときは選んだものを残し、確認の中に理由を出す
      setBulkDeleteError(bulkDeleteErrorMessage(failure));
    } finally {
      setBulkDeleting(false);
    }
  }

  function renderSection(groupId: number | null, title: string) {
    const sectionItems = visibleItems.filter(
      (item) => item.group_id === groupId,
    );
    const groupItems = items.filter((item) => item.group_id === groupId);
    const total = groupItems.length;
    // SC-07-6：未分類は、全有効件数が0なら見出しごと出さない。全部チェック済みで隠しているときも出さない（D-101）。
    // D-98：ただし持ち物を動かしている間は、未分類へ移せるよう出す
    if (
      groupId === null &&
      (total === 0 || hiddenSectionIds.has(null)) &&
      draggingItemId === null
    ) {
      return null;
    }
    // D-99：隠れたチェック済みも含めて、全部・一部・なしを判定する
    const checkedInGroup = groupItems.filter((item) => item.is_checked).length;
    const checkState =
      total > 0 && checkedInGroup === total
        ? "all"
        : checkedInGroup > 0
          ? "some"
          : "none";

    return (
      // SC-07-6：件数は画面に出している持ち物だけを数え、チェック済みを隠しているときは含めない
      // （D-95、利用者の指示）。空のグループは「0件」
      <GroupSection
        key={sectionId(groupId)}
        groupId={groupId}
        title={title}
        count={sectionItems.length}
        highlighted={dropGroupId === groupId}
        sortDisabled={reordering}
        checkState={checkState}
        checkDisabled={total === 0 || groupChecking !== undefined || reordering}
        onToggleCheck={() => void handleGroupCheck(groupId)}
      >
        {renderItems(sectionItems, true)}
      </GroupSection>
    );
  }

  return (
    <>
      {/* 画面下に固定した追加欄に、最後の持ち物が隠れないよう余白をとる */}
      <div className="flex flex-col gap-6 pb-40">
        {/* SC-07-2・4 */}
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-bold wrap-break-word">{list.title}</h1>
            {/* 利用者の指示で、持ち物の件数は出さない（D-95） */}
            <p className="flex flex-wrap gap-x-3 text-sm text-zinc-600">
              <span>{list.category.name}</span>
              <span>{isPublic ? "公開" : "非公開"}</span>
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
          <p role="alert" className="text-red-700">
            {visibilityError}
          </p>
        )}
        {moderated && (
          <p
            id="list-moderated-notice"
            role="alert"
            className="text-sm text-zinc-700"
          >
            このリストは運営により非公開になっています。 お問い合わせ：
            <a href="mailto:simasyam@gmail.com" className="underline">
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
            className="self-start rounded border border-zinc-400 px-3 py-1"
          >
            よく使う項目から追加
          </button>
        )}

        {/* SC-07-11：持ち物0件と、全部チェック済みで隠しているときを分ける。
            グループがあるときは、全部チェック済みのグループを見出しごと隠し、表示するグループ・未分類が
            1つも残らないときだけ案内を出す。0件のグループが残っていれば出さない（利用者の指示、D-101） */}
        {selecting ? (
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
        ) : items.length === 0 ? (
          <p>持ち物はまだありません。</p>
        ) : visibleItems.length === 0 && visibleGroups.length === 0 ? (
          <p>
            すべてチェック済みです。右上の「…」の『チェック済みを表示』から確認できます。
          </p>
        ) : (
          <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={detectSortTarget}
            // 持ち物を動かし始めてから出す空の未分類も、置き場所として測る
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
            modifiers={[restrictToVerticalAxis]}
            accessibility={{
              announcements: itemSortAnnouncements(visibleItems, groups),
              screenReaderInstructions,
            }}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={(event) => void handleDragEnd(event)}
            onDragCancel={clearDragState}
          >
            {groups.length === 0 ? (
              // SC-07-6：グループがなければ見出しのない1本のリスト
              <section className="flex flex-col gap-1">
                {renderItems(visibleItems)}
              </section>
            ) : (
              <>
                {/* SC-07-6・F-20：グループ順に見出しを付け、未分類を最後に置く。各グループの中は全体の持ち物順（D-60）。
                    D-98：見出しを動かすと、中の持ち物ごとグループの順番が変わる。
                    D-101：全部チェック済みで隠したグループは出さず、並べ替えの相手にもしない */}
                <SortableContext
                  items={visibleGroups.map((group) => sectionId(group.id))}
                  strategy={verticalListSortingStrategy}
                >
                  {visibleGroups.map((group) =>
                    renderSection(group.id, group.name),
                  )}
                </SortableContext>
                {renderSection(null, "未分類")}
              </>
            )}
          </DndContext>
        )}

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

      {/* SC-07-13：持ち物の追加欄は画面下に固定する（D-73） */}
      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-300 bg-background">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-2 px-4 py-3">
          {notice && (
            <p role="status" className="text-sm">
              {notice}
            </p>
          )}
          {reorderError && (
            <p role="alert" className="text-sm text-red-700">
              {reorderError}
            </p>
          )}
          {groupCheckError && (
            <p role="alert" className="text-sm text-red-700">
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
                  className="rounded border border-zinc-400 px-4 py-2 disabled:opacity-50"
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
                  className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50"
                >
                  削除
                </button>
              </div>
            </div>
          ) : (
            <AddItemForm listId={list.id} onAdded={handleAdded} />
          )}
        </div>
      </div>

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
    return "チェックする持ち物の情報が正しくありません。リストを読み直してください。";
  }

  return NETWORK_ERROR_MESSAGE;
}
