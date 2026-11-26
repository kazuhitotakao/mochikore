"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  CombinedViewCard,
  type CombinedViewRemovedReason,
} from "@/features/combined-views/CombinedViewCard";
import {
  MAX_COMBINED_VIEWS,
  MIN_COMBINED_LISTS,
} from "@/features/combined-views/validation";
import type { CombinedView, PackingListSummary } from "@/types/api";
import { OwnListCard, type RemovedReason } from "./OwnListCard";

// 02_画面配置 共通4：ほかの結果通知と同じく、5秒で消す
const NOTICE_DURATION_MS = 5000;

type Props = {
  lists: PackingListSummary[];
  // D-124：本人のまとめ表示（更新が新しい順）。0件なら一覧の上に何も足さない
  combinedViews: CombinedView[];
  // 一覧の下に置くもの（「新しいリスト」とリンク）。画面下の通知と重ならないよう、この後ろに余白を足す
  children: ReactNode;
};

/**
 * SC-05 自分のリストのカードの並びと、削除・複製・共同編集から抜けた結果の通知（D-120・D-119）。
 * まとめ表示（D-124）が1件以上あるときだけ、リストの上に「まとめ表示」、リストの上に「リスト」の見出しを出す。
 * 件数（○/100件）と「新しいリスト」は Server Component が出すので、削除・複製の後は読み直す。
 */
export function OwnListIndex({ lists, combinedViews, children }: Props) {
  const router = useRouter();
  const combinedHeadingId = useId();
  const listsHeadingId = useId();
  // 削除したリスト。読み直しが届く前でも、すぐ一覧から外す
  const [removedIds, setRemovedIds] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const [removedViewIds, setRemovedViewIds] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const [swipeOpenId, setSwipeOpenId] = useState<number | null>(null);
  const [swipeOpenViewId, setSwipeOpenViewId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const emptyRef = useRef<HTMLParagraphElement>(null);
  const viewListRef = useRef<HTMLUListElement>(null);
  // 外したカードの位置。外した後に、同じ位置のカード（なければ1つ上）へカーソルを移す
  const focusAfterRemoval = useRef<number | null>(null);
  const focusAfterViewRemoval = useRef<number | null>(null);
  const shownLists = lists.filter((list) => !removedIds.has(list.id));
  const shownViews = combinedViews.filter(
    (view) => !removedViewIds.has(view.id),
  );
  // D-124：まとめ表示は2件以上のリストを並べるので、見られるリストが1件以下なら「まとめ表示を作る」を出さない
  const combineChoices =
    shownLists.length >= MIN_COMBINED_LISTS ? shownLists : null;
  const combinedLimitReached = shownViews.length >= MAX_COMBINED_VIEWS;

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // 消したカードにあったカーソルを、次に操作できるカードへ移す。0件になったら空の表示へ
  useEffect(() => {
    const index = focusAfterRemoval.current;
    if (index === null) return;
    focusAfterRemoval.current = null;
    const links =
      listRef.current?.querySelectorAll<HTMLElement>("[data-list-link]") ?? [];
    const target =
      links.length > 0
        ? links[Math.min(index, links.length - 1)]
        : emptyRef.current;
    target?.focus();
  }, [removedIds]);

  // D-124：消したまとめ表示のカードにあったカーソルを、次のまとめ表示へ移す。なくなったら最初のリストへ
  useEffect(() => {
    const index = focusAfterViewRemoval.current;
    if (index === null) return;
    focusAfterViewRemoval.current = null;
    const links =
      viewListRef.current?.querySelectorAll<HTMLElement>(
        "[data-combined-view-link]",
      ) ?? [];
    const target =
      links.length > 0
        ? links[Math.min(index, links.length - 1)]
        : (listRef.current?.querySelector<HTMLElement>("[data-list-link]") ??
          emptyRef.current);
    target?.focus();
  }, [removedViewIds]);

  function handleRemoved(listId: number, index: number, reason: RemovedReason) {
    focusAfterRemoval.current = index;
    setRemovedIds((current) => new Set(current).add(listId));
    // 共通4：この画面で削除できた・抜けたときだけ知らせる。ほかの画面で先に消えていたときは外すだけ
    if (reason === "deleted") setNotice("リストを削除しました。");
    if (reason === "left") setNotice("リストから抜けました。");
    // 件数と、100件のときに押せない「新しいリスト」を読み直す。
    // まとめ表示に入れていたリストも外れる（D-124）ので、まとめ表示のカードも読み直す
    router.refresh();
  }

  function handleViewRemoved(
    viewId: number,
    index: number,
    reason: CombinedViewRemovedReason,
  ) {
    focusAfterViewRemoval.current = index;
    setRemovedViewIds((current) => new Set(current).add(viewId));
    if (reason === "deleted") setNotice("まとめ表示を削除しました。");
    router.refresh();
  }

  function handleDuplicated() {
    setNotice("リストを複製しました。");
    // D-24・D-120：複製したリストは更新が一番新しいので、読み直すと一覧の一番上に出る
    router.refresh();
  }

  const listCards =
    shownLists.length === 0 ? (
      // 最後の1件を消したときは、ここへカーソルを移す
      <p ref={emptyRef} tabIndex={-1}>
        リストはまだありません。
      </p>
    ) : (
      // D-24：更新が新しい順で届く。同じ名前のリストも1件ずつ出す
      <ul ref={listRef} className="flex flex-col gap-3">
        {shownLists.map((list, index) => (
          <OwnListCard
            key={list.id}
            list={list}
            swipeOpen={swipeOpenId === list.id}
            onSwipeOpenChange={(open) =>
              setSwipeOpenId((current) =>
                open ? list.id : current === list.id ? null : current,
              )
            }
            onRemoved={(reason) => handleRemoved(list.id, index, reason)}
            onDuplicated={handleDuplicated}
            combineChoices={combineChoices}
            combinedLimitReached={combinedLimitReached}
          />
        ))}
      </ul>
    );

  return (
    <>
      {shownViews.length > 0 ? (
        <>
          {/* SC-05-9・D-124：まとめ表示があるときだけ、一覧の上に区切りを出す。0件なら今までどおり */}
          <section
            aria-labelledby={combinedHeadingId}
            className="flex flex-col gap-3"
          >
            <h2
              id={combinedHeadingId}
              className="text-sm font-medium text-muted"
            >
              まとめ表示
            </h2>
            <ul ref={viewListRef} className="flex flex-col gap-3">
              {shownViews.map((view, index) => (
                <CombinedViewCard
                  key={view.id}
                  view={view}
                  lists={shownLists}
                  swipeOpen={swipeOpenViewId === view.id}
                  onSwipeOpenChange={(open) =>
                    setSwipeOpenViewId((current) =>
                      open ? view.id : current === view.id ? null : current,
                    )
                  }
                  onRemoved={(reason) =>
                    handleViewRemoved(view.id, index, reason)
                  }
                  onSaved={() => {
                    setNotice("まとめ表示を保存しました。");
                    // D-24 と同じく、変えたまとめ表示が一番上に来る
                    router.refresh();
                  }}
                />
              ))}
            </ul>
          </section>
          <section
            aria-labelledby={listsHeadingId}
            className="flex flex-col gap-3"
          >
            <h2 id={listsHeadingId} className="text-sm font-medium text-muted">
              リスト
            </h2>
            {listCards}
          </section>
        </>
      ) : (
        listCards
      )}

      {children}

      {notice && (
        <>
          {/* 画面下の通知が、一番下のリンクに重ならないようにする */}
          <div aria-hidden="true" className="h-4" />
          <div className="fixed bottom-0 left-1/2 w-full max-w-[640px] -translate-x-1/2 border-t border-line bg-background sm:border-x">
            <p role="status" className="px-5 py-3 text-sm">
              {notice}
            </p>
          </div>
        </>
      )}
    </>
  );
}
