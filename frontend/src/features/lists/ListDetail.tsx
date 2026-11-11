"use client";

import { useEffect, useState } from "react";
import type {
  ItemDeleteResult,
  PackingListDetail,
  PackingListItem,
} from "@/types/api";
import { AddItemForm } from "./AddItemForm";
import { ItemRow } from "./ItemRow";
import { ListMenu } from "./ListMenu";
import { MAX_ITEMS } from "./validation";

// 02_画面配置 共通4：結果の通知は数秒で消す
const NOTICE_DURATION_MS = 5000;

type Props = {
  list: PackingListDetail;
};

// SC-07 自分のリストの内容（通常画面）。持ち物の追加・削除で件数や公開の表示が変わるので、
// 画面の状態として持ち、保存できた値（D-71）で表示を更新する
export function ListDetail({ list }: Props) {
  const [items, setItems] = useState(list.items);
  const [isPublic, setIsPublic] = useState(list.is_public);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  function handleAdded(item: PackingListItem) {
    // API-10：新しい持ち物は全体の末尾に入る
    setItems((current) => [...current, item]);
  }

  function handleChanged(item: PackingListItem) {
    setItems((current) =>
      current.map((existing) => (existing.id === item.id ? item : existing)),
    );
  }

  function handleDeleted(item: PackingListItem, result: ItemDeleteResult) {
    setItems((current) =>
      current.filter((existing) => existing.id !== item.id),
    );
    // D-51：公開中のリストで最後の持ち物を削除すると、自動で非公開になる
    if (isPublic && !result.is_public) {
      setNotice("持ち物がなくなったため、リストを非公開にしました。");
    }
    setIsPublic(result.is_public);
  }

  return (
    <>
      {/* 画面下に固定した追加欄に、最後の持ち物が隠れないよう余白をとる */}
      <div className="flex flex-col gap-6 pb-40">
        {/* SC-07-2・4 */}
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-bold wrap-break-word">{list.title}</h1>
            <p className="flex flex-wrap gap-x-3 text-sm text-zinc-600">
              <span>{list.category.name}</span>
              <span>{isPublic ? "公開" : "非公開"}</span>
              <span>
                {items.length}/{MAX_ITEMS}件
              </span>
            </p>
          </div>
          <ListMenu listId={list.id} title={list.title} />
        </header>

        {/* SC-07-3：説明文があるときだけ。途中の改行はそのまま見せる */}
        {list.description && (
          <p className="whitespace-pre-wrap">{list.description}</p>
        )}

        {/* SC-07-11：0件のときだけ。グループの見出し（SC-07-6）は手順書第15章で足す */}
        {items.length === 0 ? (
          <p>持ち物はまだありません。</p>
        ) : (
          <ul className="flex flex-col">
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onChanged={handleChanged}
                onDeleted={handleDeleted}
              />
            ))}
          </ul>
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
          <AddItemForm
            listId={list.id}
            isFull={items.length >= MAX_ITEMS}
            onAdded={handleAdded}
          />
        </div>
      </div>
    </>
  );
}
