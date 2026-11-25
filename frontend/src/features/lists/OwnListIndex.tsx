"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PackingListSummary } from "@/types/api";
import { OwnListCard, type RemovedReason } from "./OwnListCard";

// 02_画面配置 共通4：ほかの結果通知と同じく、5秒で消す
const NOTICE_DURATION_MS = 5000;

type Props = {
  lists: PackingListSummary[];
  // 一覧の下に置くもの（「新しいリスト」とリンク）。画面下の通知と重ならないよう、この後ろに余白を足す
  children: ReactNode;
};

/**
 * SC-05 自分のリストのカードの並びと、削除・複製・共同編集から抜けた結果の通知（D-120・D-119）。
 * 件数（○/100件）と「新しいリスト」は Server Component が出すので、削除・複製の後は読み直す。
 */
export function OwnListIndex({ lists, children }: Props) {
  const router = useRouter();
  // 削除したリスト。読み直しが届く前でも、すぐ一覧から外す
  const [removedIds, setRemovedIds] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const [swipeOpenId, setSwipeOpenId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const emptyRef = useRef<HTMLParagraphElement>(null);
  // 外したカードの位置。外した後に、同じ位置のカード（なければ1つ上）へカーソルを移す
  const focusAfterRemoval = useRef<number | null>(null);
  const shownLists = lists.filter((list) => !removedIds.has(list.id));

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

  function handleRemoved(listId: number, index: number, reason: RemovedReason) {
    focusAfterRemoval.current = index;
    setRemovedIds((current) => new Set(current).add(listId));
    // 共通4：この画面で削除できた・抜けたときだけ知らせる。ほかの画面で先に消えていたときは外すだけ
    if (reason === "deleted") setNotice("リストを削除しました。");
    if (reason === "left") setNotice("リストから抜けました。");
    // 件数と、100件のときに押せない「新しいリスト」を読み直す
    router.refresh();
  }

  function handleDuplicated() {
    setNotice("リストを複製しました。");
    // D-24・D-120：複製したリストは更新が一番新しいので、読み直すと一覧の一番上に出る
    router.refresh();
  }

  return (
    <>
      {shownLists.length === 0 ? (
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
            />
          ))}
        </ul>
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
