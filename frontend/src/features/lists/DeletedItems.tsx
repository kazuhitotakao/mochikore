"use client";

import { useState } from "react";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import type { PackingListItem } from "@/types/api";
import { isNotFound, itemErrorMessage } from "./itemErrors";

// 削除した持ち物の候補。削除したときの値と、その時点で上から何番目だったか
export type DeletedItem = {
  item: PackingListItem;
  position: number;
  // D-31：削除した後に並べ替えたら、戻すと元の位置ではなく一番下に入る
  movesToBottom?: boolean;
};

type Props = {
  deletedItems: DeletedItem[];
  onRestored: (item: PackingListItem) => void;
};

// SC-07-12「削除した持ち物」。候補は画面の状態にだけ置き、ブラウザへ保存しない。
// 別の画面へ移る・再読み込みする・タブを閉じると消える（D-28）
export function DeletedItems({ deletedItems, onRestored }: Props) {
  if (deletedItems.length === 0) return null;

  return (
    <section
      aria-labelledby="deleted-items-heading"
      className="flex flex-col gap-2"
    >
      <h2 id="deleted-items-heading" className="font-medium">
        削除した持ち物
      </h2>
      <ul className="flex flex-col gap-2">
        {deletedItems.map((deleted) => (
          <DeletedItemRow
            key={deleted.item.id}
            deleted={deleted}
            onRestored={onRestored}
          />
        ))}
      </ul>
    </section>
  );
}

function DeletedItemRow({
  deleted,
  onRestored,
}: {
  deleted: DeletedItem;
  onRestored: (item: PackingListItem) => void;
}) {
  const redirectIfAuthError = useAuthErrorRedirect();
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { item, position, movesToBottom } = deleted;

  // API-25：1件ずつ戻す。D-35：送信中は押せない
  async function restore() {
    setRestoring(true);
    setError(null);
    try {
      const restored = await clientApi<PackingListItem>(
        `/items/${item.id}/restore`,
        { method: "POST" },
      );
      onRestored(restored);
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      // SC-07-12：戻せなかったときは理由を出し、候補は残す
      setError(
        isNotFound(failure) ? "戻せませんでした" : itemErrorMessage(failure),
      );
      setRestoring(false);
    }
  }

  return (
    <li className="flex flex-col gap-1 rounded border border-zinc-300 px-3 py-2">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="wrap-break-word">{item.name}</span>
          <span className="text-sm text-zinc-600">
            元の位置：{position}番目・
            {item.is_checked ? "チェック済み" : "未チェック"}
          </span>
          {movesToBottom && (
            <span className="text-sm text-zinc-600">
              並べ替えたため、戻すと一番下に入ります
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void restore()}
          disabled={restoring}
          className="shrink-0 rounded border border-zinc-400 px-3 py-1 disabled:opacity-50"
        >
          元に戻す
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </li>
  );
}
