"use client";

import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Icon } from "@/components/Icon";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { trimLikeLaravel } from "@/features/auth/validation";
import { validateGroupName } from "@/features/grouping/validation";
import { clientApi } from "@/lib/api/client";
import type { GroupCheckMode, PackingListGroup } from "@/types/api";
import { isNotFound, itemErrorMessage } from "./itemErrors";
import { ITEM_NAME_FIELD } from "./ItemRow";
import { sectionId } from "./itemSorting";
import { SwipeDeleteLayer } from "./SwipeDeleteLayer";
import { useSwipeToDelete } from "./useSwipeToDelete";

type Props = {
  // null は未分類
  groupId: number | null;
  title: string;
  // SC-07-6：画面に出している持ち物の数（D-95）
  count: number;
  // 並べ替えの保存中は動かさない
  sortDisabled: boolean;
  allChecked: boolean;
  // D-106：空のグループも押せる。送信中は押せない
  checkDisabled: boolean;
  onToggleCheck: () => void;
  // D-105：名前付きグループの見出しを左スワイプで削除する。開けるのは1行だけなので、開閉は親が持つ。
  // 削除は確認してから、中の持ち物ごと消す（親が確認を出す）
  swipeOpen?: boolean;
  onSwipeOpenChange?: (open: boolean) => void;
  swipeDisabled?: boolean;
  onSwipeDelete?: () => void;
  // D-109：見出しの名前を押して変える。同じリストのほかのグループ名は、同名の確認（V-14）に使う
  otherGroupNames?: readonly string[];
  onRenamed?: (group: PackingListGroup) => void;
  // D-122：チェックの動き。たたむ矢印の左のボタン（通常は「…」、繰り返し利用はくり返しの矢印）から、
  // 「チェックの動き」のダイアログ（SC-07-25）を開く
  checkMode?: GroupCheckMode;
  onOpenCheckMode?: () => void;
  // D-110：見出しの右端の矢印でたたむ・開く。たたんだときに出さない持ち物は、親が children から外す
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  children: ReactNode;
};

const HEADING = "font-bold wrap-break-word";

/**
 * SC-07-6：グループの見出しと、その中の持ち物。
 * グループは見出しをつかんで動かし、中の持ち物ごと順番を変える（D-98）。未分類は最後のまま動かさない。
 * 利用者の指示で、一部チェックの横線は出さず、全件チェック直後の猶予中だけ元に戻せる（D-99を変更）。
 */
export function GroupSection(props: Props) {
  return props.groupId === null ? (
    <UngroupedSection {...props} />
  ) : (
    <SortableGroupSection {...props} groupId={props.groupId} />
  );
}

function SortableGroupSection({
  groupId,
  title,
  count,
  sortDisabled,
  allChecked,
  checkDisabled,
  onToggleCheck,
  swipeOpen = false,
  onSwipeOpenChange = () => {},
  swipeDisabled = false,
  onSwipeDelete = () => {},
  otherGroupNames = [],
  onRenamed = () => {},
  checkMode = "normal",
  onOpenCheckMode = () => {},
  collapsed = false,
  onToggleCollapsed = () => {},
  children,
}: Props & { groupId: number }) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const errorId = useId();
  const contentId = useId();
  const nameButton = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [nameError, setNameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  // 入力欄が消えるときの blur や、Enter と欄外の重なりで二重に送らないよう、状態の反映を待たずに判定する（D-73）
  const editingNow = useRef(false);
  const renameInFlight = useRef(false);
  // Enter・Esc で入力を終えたときだけ名前のボタンへカーソルを戻す。欄外を押したときは移った先を保つ
  const focusNameAfterEdit = useRef(false);

  useEffect(() => {
    if (editing || !focusNameAfterEdit.current) return;
    focusNameAfterEdit.current = false;
    nameButton.current?.focus();
  }, [editing]);

  function startEditing() {
    editingNow.current = true;
    setDraft(title);
    setNameError(null);
    setEditing(true);
  }

  function finishEditing(restoreFocus: boolean) {
    editingNow.current = false;
    focusNameAfterEdit.current = restoreFocus;
    setNameError(null);
    setEditing(false);
  }

  // D-109・SC-07-6：入力を確定したら API-44 で保存する。持ち物の名前（SC-07-8）と同じ流れ
  async function saveName(restoreFocus: boolean) {
    if (!editingNow.current || renameInFlight.current) return;

    // 変わっていなければ送らずに戻す
    if (trimLikeLaravel(draft) === title) {
      finishEditing(restoreFocus);
      return;
    }

    const invalid = validateGroupName(draft, otherGroupNames);
    if (invalid) {
      setNameError(invalid);
      return;
    }

    renameInFlight.current = true;
    setRenaming(true);
    setNameError(null);
    try {
      const saved = await clientApi<PackingListGroup>(`/groups/${groupId}`, {
        method: "PATCH",
        body: { name: draft },
      });
      onRenamed(saved);
      finishEditing(restoreFocus);
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      // ほかの画面でグループが消えていたら、最新の内容を読み直す
      if (isNotFound(failure)) {
        router.refresh();
        return;
      }
      // 共通10：失敗しても入力中の名前は残す。同名などは V-14 の文を出す
      setNameError(itemErrorMessage(failure));
    } finally {
      renameInFlight.current = false;
      setRenaming(false);
    }
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // 日本語の変換を確定する Enter では保存しない
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void saveName(true);
    }
    if (event.key === "Escape" && !renameInFlight.current) {
      event.preventDefault();
      finishEditing(true);
    }
  }

  const {
    active,
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sectionId(groupId),
    data: { groupId },
    // 名前を入力している間は並べ替えない
    disabled: sortDisabled || editing,
    attributes: { role: "heading", roleDescription: "並べ替えできるグループ" },
  });
  // ドラッグ中・並べ替えの保存中・送信中は横に引かない
  const swipeContainer = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToDelete({
    container: swipeContainer,
    disabled: swipeDisabled || sortDisabled || editing || active !== null,
    open: swipeOpen,
    onOpenChange: onSwipeOpenChange,
    onDelete: onSwipeDelete,
  });

  return (
    <section
      ref={setNodeRef}
      id={sectionId(groupId)}
      aria-label={title}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex flex-col gap-1 rounded bg-background ${isDragging ? "relative z-10 shadow-md" : ""}`}
    >
      {/* 横の動きは左スワイプ（D-105）に使うので、ブラウザには縦のスクロールと拡大だけを任せる。
          赤い「削除」を見出しの薄い背景と同じ幅・角丸にそろえる */}
      <div
        ref={swipeContainer}
        className={`relative -mx-2 touch-pan-y touch-pinch-zoom rounded-lg ${swipe.offset < 0 ? "overflow-hidden" : ""}`}
      >
        <SwipeDeleteLayer
          visible={swipe.offset < 0}
          open={swipe.isOpen}
          label={`${title}と中の持ち物を削除`}
          // 確認を出す前に閉じる。確認で「やめる」を押したときに、開いたまま残さない
          onDelete={() => {
            onSwipeOpenChange(false);
            onSwipeDelete();
          }}
        />
        {/* 見出しだけを薄く塗り、持ち物の行と見分けられるようにする（利用者の指示）。
            持ち物の行と同じ高さ（44px）にし、赤い「削除」の縦幅もそろえる（D-105） */}
        <div
          {...swipe.handlers}
          style={
            swipe.offset < 0
              ? { transform: `translateX(${swipe.offset}px)` }
              : undefined
          }
          className={`relative flex min-h-11 items-center gap-2 rounded-lg bg-brand-soft px-2 ${swipe.swiping ? "" : "transition-transform duration-200"}`}
        >
          <GroupCheckbox
            title={title}
            checked={allChecked}
            disabled={checkDisabled}
            onToggle={onToggleCheck}
          />
          {/* 見出しそのものを持ち手にする。持ち手のマークは出さない（D-03） */}
          <h2
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-level={2}
            className={`flex min-w-0 flex-1 cursor-grab touch-pan-y touch-pinch-zoom items-center gap-1 select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${HEADING}`}
          >
            {editing ? (
              <input
                type="text"
                value={draft}
                autoFocus
                // 送信中は書き換えさせず、保存した名前と入力がずれないようにする
                readOnly={renaming}
                aria-label="グループ名"
                aria-invalid={Boolean(nameError)}
                aria-describedby={errorId}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setNameError(null);
                }}
                onKeyDown={handleNameKeyDown}
                // エラーを出している間は、ほかを押しただけでは送り直さない
                onBlur={() => {
                  if (!nameError) void saveName(false);
                }}
                className={`${ITEM_NAME_FIELD} font-bold`}
              />
            ) : (
              // D-109：持ち物の名前（SC-07-8）と同じく、押すと入力欄になる。押したまま動かすと並べ替え
              <button
                ref={nameButton}
                type="button"
                onClick={startEditing}
                className="min-w-0 cursor-grab text-left font-bold wrap-break-word"
              >
                {title}
                <span className="sr-only">（名前を変更）</span>
              </button>
            )}
            <span className="shrink-0 text-sm font-normal whitespace-nowrap text-muted">
              （{count}件）
            </span>
          </h2>
          {/* D-122（利用者の指示）：たたむ矢印の左に、チェックの動きを変えるボタンを置く。
              通常のグループは「…」、繰り返し利用のグループは、くり返しの矢印を白い丸に入れた印にする
              （色だけでなく形でも見分けられる）。押すと「チェックの動き」のダイアログ（SC-07-25）を開く */}
          <button
            type="button"
            aria-label={`${title}のチェックの動きを変える（今は${checkMode === "repeat" ? "繰り返し利用" : "通常"}）`}
            onClick={onOpenCheckMode}
            className="-mr-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-background/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {checkMode === "repeat" ? (
              <span className="flex size-8 items-center justify-center rounded-full bg-background text-brand-deep ring-1 ring-line-soft">
                <Icon name="repeat" className="size-4.5" />
              </span>
            ) : (
              "…"
            )}
          </button>
          {/* D-110（利用者の指示）：名前を押すと名前の編集になるので、たたむ操作は右端の矢印に分ける。
              持ち物の行の「…」と同じ列・大きさ（44px）。開いているときは下向き、たたんだときは右向き */}
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls={contentId}
            aria-label={collapsed ? `${title}を開く` : `${title}をたたむ`}
            onClick={onToggleCollapsed}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-brand hover:bg-background/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <Icon
              name="chevron"
              className={`size-5 transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
            />
          </button>
        </div>
      </div>
      {nameError && (
        <p id={errorId} role="alert" className="px-2 text-sm text-danger">
          {nameError}
        </p>
      )}
      <div id={contentId} className="flex flex-col">
        {children}
      </div>
    </section>
  );
}

// 見出しは置かず、先頭直前の余白も移動先に含める。負の余白と内側の余白で表示位置は保つ。
function UngroupedSection({ children }: Pick<Props, "children">) {
  const { setNodeRef } = useDroppable({
    id: sectionId(null),
    data: { groupId: null },
  });

  return (
    <section
      ref={setNodeRef}
      aria-label="グループに入っていない持ち物"
      className="-mt-3 flex flex-col gap-1 rounded pt-3"
    >
      {children}
    </section>
  );
}

function GroupCheckbox({
  title,
  checked,
  disabled,
  onToggle,
}: {
  title: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={`${title}の持ち物をまとめてチェック`}
      onChange={onToggle}
      className="size-5 shrink-0"
    />
  );
}
