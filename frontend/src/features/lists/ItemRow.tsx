"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type KeyboardEvent } from "react";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { trimLikeLaravel } from "@/features/auth/validation";
import { clientApi } from "@/lib/api/client";
import type { ItemDeleteResult, PackingListItem } from "@/types/api";
import { isNotFound, itemErrorMessage } from "./itemErrors";
import { validateItemName } from "./validation";

type Props = {
  item: PackingListItem;
  onChanged: (item: PackingListItem) => void;
  onDeleted: (item: PackingListItem, result: ItemDeleteResult) => void;
};

// SC-07-7・8・10 持ち物の行。「≡」（順番6）は、その機能を作るときに足す
export function ItemRow({ item, onChanged, onDeleted }: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const menuId = useId();
  const errorId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 404・401などで画面を移動・読み直ししたら true
  function handleMovingError(failure: unknown): boolean {
    if (redirectIfAuthError(failure)) return true;
    if (isNotFound(failure)) {
      router.refresh();
      return true;
    }
    return false;
  }

  // SC-07-8：入力を確定したら保存する（API-11）
  async function saveName() {
    if (busy) return;

    // 変わっていなければ送らずに戻す
    if (trimLikeLaravel(draft) === item.name) {
      setEditing(false);
      setError(null);
      return;
    }

    const invalid = validateItemName(draft);
    if (invalid) {
      setError(invalid);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const saved = await clientApi<PackingListItem>(`/items/${item.id}`, {
        method: "PATCH",
        body: { name: draft },
      });
      onChanged(saved);
      setEditing(false);
    } catch (failure) {
      if (handleMovingError(failure)) return;
      // 共通10：失敗しても入力中の名前は残す
      setError(itemErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // 日本語の変換を確定する Enter では保存しない
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void saveName();
    }
    if (event.key === "Escape") {
      setDraft(item.name);
      setError(null);
      setEditing(false);
    }
  }

  // SC-07-7・F-06：チェックを押したら保存し、保存できた値で表示する。
  // 保存が終わるまで表示を変えないので、失敗したときは元の状態のまま（02_画面配置 SC-07-7）
  async function toggleChecked() {
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      const saved = await clientApi<PackingListItem>(`/items/${item.id}`, {
        method: "PATCH",
        body: { is_checked: !item.is_checked },
      });
      onChanged(saved);
    } catch (failure) {
      if (handleMovingError(failure)) return;
      setError(itemErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  // SC-07-10：確認なしで削除する（API-12、D-27）
  async function deleteItem() {
    setMenuOpen(false);
    setBusy(true);
    setError(null);
    try {
      const result = await clientApi<ItemDeleteResult>(`/items/${item.id}`, {
        method: "DELETE",
      });
      onDeleted(item, result);
    } catch (failure) {
      if (handleMovingError(failure)) return;
      setError(itemErrorMessage(failure));
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-1 border-b border-zinc-200 py-2">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={item.is_checked}
          disabled={busy}
          aria-label={item.name}
          aria-describedby={errorId}
          onChange={() => void toggleChecked()}
          className="size-5 shrink-0"
        />
        {editing ? (
          <input
            type="text"
            value={draft}
            autoFocus
            aria-label="持ち物名"
            aria-invalid={Boolean(error)}
            aria-describedby={errorId}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            // エラーを出している間は、ほかを押しただけでは送り直さない
            onBlur={() => {
              if (!error) void saveName();
            }}
            className="min-w-0 flex-1 rounded border border-zinc-400 px-2 py-1"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(item.name);
              setEditing(true);
            }}
            className="min-w-0 flex-1 text-left wrap-break-word"
          >
            {item.name}
          </button>
        )}

        <div className="relative">
          <button
            type="button"
            aria-label={`${item.name}の操作`}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            disabled={busy}
            onClick={() => setMenuOpen((open) => !open)}
            className="rounded px-2 py-1 disabled:opacity-50"
          >
            …
          </button>
          {/* SC-07-10：「よく使う項目に保存」は手順書第14章で足す */}
          {menuOpen && (
            <ul
              id={menuId}
              className="absolute right-0 z-10 mt-1 w-32 rounded border border-zinc-300 bg-background py-1 shadow"
            >
              <li>
                <button
                  type="button"
                  onClick={() => void deleteItem()}
                  className="block w-full px-4 py-2 text-left text-red-700"
                >
                  削除
                </button>
              </li>
            </ul>
          )}
        </div>
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </li>
  );
}
