"use client";

import { useRouter } from "next/navigation";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { BackLink } from "@/components/BackLink";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Icon } from "@/components/Icon";
import { useDismiss } from "@/components/useDismiss";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { ListDetail } from "@/features/lists/ListDetail";
import { MENU_ITEM, MenuLabel, MenuSection } from "@/features/lists/ListMenu";
import { useCollapsedLists } from "@/features/lists/useCollapsedGroups";
import { clientApi } from "@/lib/api/client";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import type { RealtimeConfig } from "@/lib/realtime/types";
import type { Category, CombinedView, PackingListDetail } from "@/types/api";
import { CombinedViewDialog } from "./CombinedViewDialog";
import { SplitDivider } from "./SplitDivider";
import {
  SPLIT_LIST_COUNT,
  useCombinedLayout,
  useSplitCapable,
} from "./useCombinedLayout";
import { useKeyboardFit } from "./useKeyboardFit";
import { usePaneHead } from "./usePaneHead";
import { useSplitScrollMemory } from "./useSplitScrollMemory";

type MenuItemKey = "edit" | "delete";

type Props = {
  view: CombinedView;
  // 今見られるリストの中身（API-07）。まとめ表示の順に並んでいる
  lists: PackingListDetail[];
  categories: Category[];
  realtime: RealtimeConfig | null;
};

/**
 * SC-20 まとめ表示（F-37、D-124）。選んだ複数のリストを1つの画面に並べ、切り替えずに見て操作する。
 * 各リストの中身は SC-07 と同じ部品（ListDetail）で、操作はすべて元のリストに保存する（権限もリストごと、D-119）。
 * スマホは縦に1列、画面幅が広いときは横に並べる。画面下の通知・エラーは画面に1つの欄へまとめる。
 * D-125：リストが2件のスマホでは、上下に分けてそれぞれをスクロールできる（分割表示）。形は CSS（split:）で決め、
 * 開いたときから分割表示で描く。表示方法と比率はこの端末のブラウザに覚え、画面の大きさ・キーボードで一時的に変えても上書きしない。
 * 分割表示でもリストをたためる（見出しだけ残し、もう一方が残りを使う）。上下のスクロール位置はアプリを開いている間だけ覚える。
 * 2件のときは「…」から上下（横に並べる幅では左右）を入れ替えられる。
 */
export function CombinedViewDetail({
  view,
  lists,
  categories,
  realtime,
}: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainer = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useDismiss(menuContainer, menuOpen, closeMenu);
  const focusAfterReopen = useRef<MenuItemKey | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  // 画面下の欄。各リストの通知・エラーはここへ出す（ListDetail の CombinedFrame.footer）
  const [footer, setFooter] = useState<HTMLDivElement | null>(null);
  // D-110 と同じく、たたんだリストはこの端末のブラウザにまとめ表示ごとに覚える
  const collapsedLists = useCollapsedLists(
    view.id,
    lists.map((list) => list.id),
  );
  // D-125：分割表示。split は利用者が選んでいる表示、splitActive は今の画面で実際に分けているか
  const { layout, save: saveLayout } = useCombinedLayout(view.id);
  const splittable = lists.length === SPLIT_LIST_COUNT;
  const split = splittable && layout.split;
  const splitActive = useSplitCapable() && split;
  const rootRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const expandedPane = useKeyboardFit(splitActive, rootRef, areaRef);
  const topPaneId = useId();
  // D-125：分割表示でたたんだリストは見出しだけにし、空いた分をもう一方が使う（境界線は残し、引けば開く。両方たたんだら隠す）
  const collapsedPanes = lists.map((list) =>
    collapsedLists.collapsed.has(list.id),
  );
  const bothCollapsed = splittable && collapsedPanes.every(Boolean);
  // ドラッグ中は SplitDivider が直接書き換える（ドラッグでたたむ・開くときも、ここの値は変えないので上書きしない）。
  // キーボードで入力中のリストだけを広げるときは、そのリストに残りを全部使う（覚えた比率は変えないので、戻すと元の高さになる）。
  // たたんだリストは見出しの高さで止まり、空いた分はもう一方へ配られる（伸びる割合を比率×1000にしているため）
  const fillOpenPane = expandedPane !== null;
  const areaStyle = {
    "--split-top": fillOpenPane ? 1 : layout.ratio,
    "--split-bottom": fillOpenPane ? 1 : 1 - layout.ratio,
  } as CSSProperties;
  // 上下に出しているものが変わったら、覚えたスクロール位置へ戻し直し、見出しの高さを測り直す
  const shown = [
    ...lists.map(paneKey),
    [...collapsedLists.collapsed].join("."),
    String(expandedPane),
  ].join("|");
  useSplitScrollMemory(splitActive, areaRef, view.id, shown);
  usePaneHead(splitActive, areaRef, shown);
  const swappable = splittable && view.lists.length === SPLIT_LIST_COUNT;

  useEffect(() => {
    const item = focusAfterReopen.current;
    if (!menuOpen || !item) return;
    focusAfterReopen.current = null;
    menuContainer.current
      ?.querySelector<HTMLElement>(`[data-menu-item="${item}"]`)
      ?.focus();
  }, [menuOpen]);

  function reopenMenu(item: MenuItemKey) {
    focusAfterReopen.current = item;
    setMenuOpen(true);
  }

  // API-69：まとめ表示だけを消す。リストと持ち物は残るので、自分のリスト一覧（SC-05）へ戻る
  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await clientApi<void>(`/combined-views/${view.id}`, { method: "DELETE" });
      router.replace("/lists");
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      // ほかの画面で先に削除されていたときも、一覧へ戻る（D-43）
      if (failure instanceof ApiError && failure.status === 404) {
        router.replace("/lists");
        return;
      }
      setDeleteError(NETWORK_ERROR_MESSAGE);
      setDeleting(false);
    }
  }

  // D-125：2件の順番を入れ替えて保存し（API-68。編集の「上へ」「下へ」と同じ）、保存できてから読み直す。
  // 比率は場所のまま（上の高さを変えない）。たたんだ状態とスクロール位置はリストIDで覚えているので、リストについて動く
  async function handleSwap() {
    setSwapping(true);
    setSwapError(null);
    try {
      // C-03：変える項目（並べるリストと順番）だけを送る
      await clientApi<CombinedView>(`/combined-views/${view.id}`, {
        method: "PATCH",
        body: { list_ids: view.lists.map((list) => list.id).reverse() },
      });
      router.refresh();
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      if (failure instanceof ApiError && failure.code === "not_found") {
        // ほかの画面でまとめ表示が消えていた。読み直すと「ページが見つかりません」になる（D-43）
        router.refresh();
        return;
      }
      setSwapError(swapErrorMessage(failure));
    } finally {
      setSwapping(false);
    }
  }

  return (
    // 画面下の欄に何か出ている間は、最後の行が隠れないよう余白をとる（SC-07 と同じ）。
    // D-125：分割表示では画面の高さに収めて固定し、画面全体はスクロールしない（キーボードが出ている間は見えている範囲に合わせる）
    <div
      ref={rootRef}
      data-split={split ? "" : undefined}
      // D-125：リストが2件のスマホでは、分割表示・通常表示のどちらでも行・見出し・余白を詰める（dense:、利用者の指示）
      data-dense={splittable ? "" : undefined}
      className="flex flex-col gap-4 pb-8 has-[[data-combined-footer]:not(:empty)]:pb-40 split:fixed split:inset-x-0 split:top-[var(--split-viewport-top,0px)] split:mx-auto split:h-[var(--split-viewport-height,100dvh)] split:w-full split:max-w-[640px] split:gap-2 split:bg-background split:px-5 split:pt-3 split:pb-0! split:sm:border-x split:sm:border-line"
    >
      {/* SC-07 と同じく、「←」と同じ行の右端に「…」を置く。まとめ表示の名前は次の行に大きく出す。
          D-125：分割表示では、上下のリストを広く使うため、名前を「←」の行に小さく出す（2行まで） */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-6 split:flex-nowrap split:items-center">
        <BackLink href="/lists" />
        <h1 className="order-last basis-full text-2xl font-medium wrap-break-word split:order-none split:line-clamp-2 split:min-w-0 split:flex-1 split:basis-auto split:text-base split:leading-snug">
          {view.name}
        </h1>
        <div className="-mt-1 -mb-2 ml-auto flex shrink-0 items-center split:my-0">
          {splittable && (
            // D-125：文字を出さずアイコンだけにし、分割表示の間は薄い緑の地で示す（利用者の指示）。
            // 分割表示を使える画面の大きさのときだけ出す
            <button
              type="button"
              role="switch"
              aria-checked={split}
              aria-label="上下に分けて表示"
              onClick={() => saveLayout({ ...layout, split: !layout.split })}
              className="group hidden min-h-11 min-w-11 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand can-split:flex"
            >
              <span
                className={`flex size-9 items-center justify-center rounded-lg transition-colors ${split ? "bg-brand-soft text-brand-deep" : "text-muted group-hover:bg-sunken"}`}
              >
                <Icon name="split" className="size-5" />
              </span>
            </button>
          )}
          <div ref={menuContainer} className="relative">
            <button
              ref={menuButton}
              type="button"
              aria-label="まとめ表示の操作"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              disabled={deleting}
              onClick={() => setMenuOpen((open) => !open)}
              className="-mr-2 flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3 text-xl text-muted hover:bg-sunken disabled:opacity-50"
            >
              …
            </button>
            {menuOpen && (
              // リストの見出し（z-20）と、分割表示の境界線（z-30）より手前に重ねる
              <div
                id={menuId}
                className="absolute right-0 z-40 mt-1 flex w-64 flex-col menu py-1"
              >
                <MenuSection>
                  <li>
                    <button
                      type="button"
                      data-menu-item="edit"
                      onClick={() => {
                        setMenuOpen(false);
                        setEditing(true);
                      }}
                      className={MENU_ITEM}
                    >
                      <MenuLabel icon="edit">まとめ表示を編集</MenuLabel>
                    </button>
                  </li>
                  {swappable && (
                    <li>
                      <button
                        type="button"
                        disabled={swapping}
                        onClick={() => {
                          setMenuOpen(false);
                          menuButton.current?.focus();
                          void handleSwap();
                        }}
                        className={MENU_ITEM}
                      >
                        <MenuLabel icon="swap">
                          {/* 横に並べる幅（1024px以上、D-124）では左右に並ぶので、言葉を変える */}
                          <span className="lg:hidden">上下を入れ替える</span>
                          <span className="hidden lg:inline">
                            左右を入れ替える
                          </span>
                        </MenuLabel>
                      </button>
                    </li>
                  )}
                </MenuSection>
                <MenuSection divided>
                  <li>
                    <button
                      type="button"
                      data-menu-item="delete"
                      onClick={() => {
                        setMenuOpen(false);
                        setDeleteError(null);
                        setConfirmingDelete(true);
                      }}
                      className={`${MENU_ITEM} text-danger`}
                    >
                      <MenuLabel icon="trash" danger>
                        まとめ表示を削除
                      </MenuLabel>
                    </button>
                  </li>
                </MenuSection>
              </div>
            )}
          </div>
        </div>
      </div>

      {lists.length === 0 ? (
        // D-124：入れていたリストが全部見られなくなった（削除された・共同編集から外れた）とき
        <p>
          表示できるリストがありません。「…」の「まとめ表示を編集」から、リストを選んでください。
        </p>
      ) : (
        // スマホは縦に1列。画面幅が広いときは、1列320px以上で横に並べ、入りきらない分は次の段へ（D-124）。
        // D-125：分割表示では上下に分け、高さの割合を CSS 変数で渡す（各リストは最小160px）
        <div
          ref={areaRef}
          style={split ? areaStyle : undefined}
          className="group/split flex flex-col gap-8 dense:gap-6 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(20rem,1fr))] lg:items-start lg:gap-x-6 split:min-h-0 split:flex-1 split:gap-0"
        >
          {lists.flatMap((list, index) => {
            // D-125：キーボードの表示中に入力中のリストだけを広げるときは、もう一方を一時的に隠す（外さないので入力などは残る）
            const concealed = expandedPane !== null && expandedPane !== index;
            // たたんだリストは見出しの高さだけにし、空いた分はもう一方が使う。開いているリストは比率（CSS 変数）の
            // とおりの高さにし、持ち物が少なくても縮めない（境界線を指どおりに動かすため、利用者の指示）。
            // 境界線で見出しの近くまで小さくできるので、最小は見出しの高さ（--pane-head、usePaneHead）にする。
            // 片方をたたんだときに残りを全部もう一方へ配るよう、伸びる割合は1以上の数（比率×1000）にする。
            // 境界線のダブルタップ・矢印キーで高さを一度に変えるとき（data-settling）だけ、伸びる割合を短く滑らかに変える
            const sizing = collapsedPanes[index]
              ? "split:flex-none"
              : `split:min-h-[var(--pane-head,2.5rem)] split:basis-0 split:motion-safe:group-data-settling/split:transition-[flex-grow] split:motion-safe:group-data-settling/split:duration-150 split:motion-safe:group-data-settling/split:ease-out ${index === 0 ? "split:grow-[calc(var(--split-top)*1000)]" : "split:grow-[calc(var(--split-bottom)*1000)]"}`;
            const pane = (
              // 通常表示では入れ物を作らない（contents）ので、並び方は今までと同じ
              <div
                // SC-07 と同じく、持ち物の構造が変わって読み直したときは、そのリストの状態を作り直す（D-59）
                key={paneKey(list)}
                id={index === 0 ? topPaneId : undefined}
                data-split-pane={splittable ? index : undefined}
                data-list-id={splittable ? list.id : undefined}
                data-collapsed={collapsedPanes[index] ? "" : undefined}
                className={`contents ${concealed ? "split:hidden" : "split:flex"} split:flex-col ${sizing}`}
              >
                <CombinedPane
                  list={list}
                  categories={categories}
                  realtime={realtime}
                  viewId={view.id}
                  collapsed={collapsedLists.collapsed.has(list.id)}
                  onToggleCollapsed={collapsedLists.toggle}
                  footer={footer}
                  split={splitActive}
                />
              </div>
            );
            return splittable && index === 1
              ? [
                  <SplitDivider
                    key="divider"
                    ratio={layout.ratio}
                    onCommit={(ratio) => saveLayout({ ...layout, ratio })}
                    collapsed={[
                      collapsedPanes[0] ?? false,
                      collapsedPanes[1] ?? false,
                    ]}
                    onCollapse={(pane, value) => {
                      const target = lists[pane];
                      if (target) collapsedLists.set(target.id, value);
                    }}
                    area={areaRef}
                    controls={topPaneId}
                    concealed={expandedPane !== null || bothCollapsed}
                  />,
                  pane,
                ]
              : [pane];
          })}
        </div>
      )}

      {/* 各リストの通知・エラーを、画面下の1つの欄に重ねて出す。何もないときは隠す。
          D-125：分割表示では画面の一番下に並べ、上下のリストを比率のまま縮める（重ねない） */}
      <div
        ref={setFooter}
        data-combined-footer
        className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-[640px] -translate-x-1/2 flex-col divide-y divide-line-soft border-t border-line bg-background empty:hidden sm:border-x split:static split:-mx-5 split:w-auto split:max-w-none split:shrink-0 split:translate-x-0 split:sm:border-x-0"
      />

      {/* 入れ替えの失敗は、各リストの通知と同じ画面下の欄に出す */}
      {swapError &&
        footer &&
        createPortal(
          <div className="px-5 py-3">
            <p role="alert" className="text-sm text-danger">
              {swapError}
            </p>
          </div>,
          footer,
        )}

      {editing && (
        <CombinedViewDialog
          view={view}
          initialListIds={view.lists.map((list) => list.id)}
          onCancel={() => {
            setEditing(false);
            reopenMenu("edit");
          }}
          onSaved={() => {
            setEditing(false);
            // 名前・並べるリストが変わったので、まとめ表示と各リストを読み直す
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={confirmingDelete}
        message={`「${view.name}」を削除しますか？リストと持ち物は消えません。`}
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        busy={deleting}
        destructive
        error={deleteError}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          setConfirmingDelete(false);
          reopenMenu("delete");
        }}
      />
    </div>
  );
}

// 上下（横に並べる幅では左右）の入れ物の key。持ち物の構造が変わって読み直したときは作り直す（D-59）
function paneKey(list: PackingListDetail): string {
  return `${list.id}-${list.grouping_revision}-${list.updated_at}`;
}

// V-31：見られなくなったリストがあるときは、Laravel の文（読み直しの案内）を出す
function swapErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === "validation_error") {
    return Object.values(error.errors)[0]?.[0] ?? error.message;
  }
  return NETWORK_ERROR_MESSAGE;
}

type CombinedPaneProps = {
  list: PackingListDetail;
  categories: Category[];
  realtime: RealtimeConfig | null;
  viewId: number;
  collapsed: boolean;
  // 描くたびに変わるが、今覚えている値から作る（useCollapsedLists）ので、前に描いたときの関数のままでよい
  onToggleCollapsed: (listId: number) => void;
  footer: HTMLDivElement | null;
  split: boolean;
};

/**
 * まとめ表示の1つのリスト（SC-07 と同じ ListDetail）。D-125：境界線で比率を覚えたとき・もう一方のリストを
 * たたんだときなど、このリストに関係のない変化では持ち物まで描き直さない（描き直しの間、境界線の動きが止まるため）
 */
const CombinedPane = memo(
  function CombinedPane({
    list,
    categories,
    realtime,
    viewId,
    collapsed,
    onToggleCollapsed,
    footer,
    split,
  }: CombinedPaneProps) {
    return (
      <ListDetail
        list={list}
        categories={categories}
        initialShowChecked={false}
        realtime={realtime}
        combined={{
          viewId,
          collapsed,
          onToggleCollapsed: () => onToggleCollapsed(list.id),
          footer,
          split,
        }}
      />
    );
  },
  (prev, next) =>
    prev.list === next.list &&
    prev.categories === next.categories &&
    prev.realtime === next.realtime &&
    prev.viewId === next.viewId &&
    prev.collapsed === next.collapsed &&
    prev.footer === next.footer &&
    prev.split === next.split,
);
