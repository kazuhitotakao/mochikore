"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { ItemImportResult, PublicPackingListDetail } from "@/types/api";
import { CopyPublicListButton } from "./CopyPublicListButton";
import { PublicListContent } from "./PublicListContent";
import { TransferItemsDialog } from "./TransferItemsDialog";
import { useVerifiedUserGate } from "./useVerifiedUserGate";

// 02_画面配置 共通4：結果の通知は数秒で消す
const NOTICE_DURATION_MS = 5000;

type Props = {
  list: PublicPackingListDetail;
  // 自分用にコピー（API-17・49）と、選んで取り込む（API-53・54）の送り先
  copyPath: string;
  importPath: string;
  loggedIn: boolean;
  emailVerified: boolean;
  // 本文の上（SC-11 の「←」）と下（SC-11 の「通報する」）。SC-18 には置かない（D-114）
  before?: ReactNode;
  after?: ReactNode;
};

/**
 * 公開リスト詳細（SC-11）と限定公開のリスト（SC-18）の本文と画面下（F-33、D-118）。
 * ふだんは「選んで取り込む」と「自分用にコピー」。選んでいる間は「n件選択中」「やめる」「自分のリストへ」。
 */
export function PublicListView({
  list,
  copyPath,
  importPath,
  loggedIn,
  emailVerified,
  before,
  after,
}: Props) {
  const requireVerifiedUser = useVerifiedUserGate(loggedIn, emailVerified);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(
    new Set(),
  );
  // 取り込み先を選んでいる間。開いたときに選んでいた持ち物を保つ
  const [importing, setImporting] = useState<number[] | null>(null);
  const [notice, setNotice] = useState<{ text: string; href: string } | null>(
    null,
  );

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // 選んだ持ち物のID。取り込み先では Laravel が元の並び順（sort_order）に並べ直して入れる（D-118）
  const orderedIds = list.items
    .map((item) => item.id)
    .filter((id) => selectedIds.has(id));

  function stopSelecting() {
    setSelecting(false);
    setSelectedIds(new Set());
  }

  function toggle(itemIds: number[]) {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = itemIds.every((id) => current.has(id));
      for (const id of itemIds) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function handleImported(result: ItemImportResult) {
    setImporting(null);
    stopSelecting();
    // D-118：今の画面に残り、取り込み先を「開く」リンクを添える
    setNotice({
      text: `${result.count}件を「${result.list.title}」に取り込みました。`,
      href: `/lists/${result.list.id}`,
    });
  }

  return (
    <>
      <main className="flex flex-col gap-6 pt-8 pb-44">
        {before}
        <PublicListContent
          list={list}
          selection={selecting ? { selectedIds, onToggle: toggle } : undefined}
        />
        {after}
      </main>

      <div className="fixed bottom-0 left-1/2 w-full max-w-[640px] -translate-x-1/2 border-t border-line bg-background sm:border-x">
        <div className="flex flex-col gap-2 px-5 py-3">
          {notice && (
            <p role="status" className="text-sm">
              {notice.text}
              <Link
                href={notice.href}
                prefetch={false}
                className="tap-target ml-2 text-link"
              >
                開く
              </Link>
            </p>
          )}
          {selecting ? (
            // SC-11-8：選んだ件数と「やめる」「自分のリストへ」。0件のときは先へ進めない
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p role="status">{orderedIds.length}件選択中</p>
              <div className="ml-auto flex shrink-0 gap-3">
                <button
                  type="button"
                  onClick={stopSelecting}
                  disabled={importing !== null}
                  className="btn-outline"
                >
                  やめる
                </button>
                <button
                  type="button"
                  onClick={() => setImporting(orderedIds)}
                  disabled={importing !== null || orderedIds.length === 0}
                  className="btn-primary"
                >
                  自分のリストへ
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* D-118：「自分用にコピー」の上に置く。押した時点でログイン・メール認証を確かめる */}
              <button
                type="button"
                onClick={() => {
                  if (!requireVerifiedUser()) return;
                  setNotice(null);
                  setSelecting(true);
                }}
                className="btn-outline"
              >
                選んで取り込む
              </button>
              <CopyPublicListButton
                copyPath={copyPath}
                loggedIn={loggedIn}
                emailVerified={emailVerified}
              />
            </>
          )}
        </div>
      </div>

      {/* SC-11-9：取り込み先を選ぶ。このダイアログが確認を兼ねる */}
      {importing && (
        <TransferItemsDialog<ItemImportResult>
          listId={list.id}
          listTitle={list.title}
          itemIds={importing}
          mode="import"
          submitPath={importPath}
          onDone={handleImported}
          onCancel={() => setImporting(null)}
        />
      )}
    </>
  );
}
