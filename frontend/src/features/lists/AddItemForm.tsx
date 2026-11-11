"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { clientApi } from "@/lib/api/client";
import type { PackingListItem } from "@/types/api";
import { isNotFound, itemErrorMessage } from "./itemErrors";
import { validateItemName } from "./validation";

type Props = {
  listId: number;
  onAdded: (item: PackingListItem) => void;
};

// SC-07-13 持ち物の追加欄（API-10）。画面下に固定し、追加した後も続けて入力できる。件数の上限はない（D-34）
export function AddItemForm({ listId, onAdded }: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const invalid = validateItemName(name);
    if (invalid) {
      setError(invalid);
      inputRef.current?.focus();
      return;
    }

    const submitted = name;
    setSubmitting(true);
    setError(null);

    try {
      // 前後空白の削除は Laravel が行うので、入力のまま送る（D-92）
      const item = await clientApi<PackingListItem>(`/lists/${listId}/items`, {
        method: "POST",
        body: { name: submitted },
      });
      onAdded(item);
      // 送信中に続けて打った文字は消さない
      setName((current) => (current === submitted ? "" : current));
    } catch (failure) {
      if (redirectIfAuthError(failure)) return;
      if (isNotFound(failure)) {
        router.refresh();
        return;
      }
      setError(itemErrorMessage(failure));
    } finally {
      setSubmitting(false);
      inputRef.current?.focus();
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-1">
      <div className="flex gap-2">
        <label htmlFor="new-item-name" className="sr-only">
          持ち物名
        </label>
        <input
          ref={inputRef}
          id="new-item-name"
          type="text"
          value={name}
          placeholder="持ち物を追加"
          aria-invalid={Boolean(error)}
          aria-describedby="new-item-error"
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          className="min-w-0 flex-1 rounded border border-zinc-400 px-3 py-2"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
        >
          追加
        </button>
      </div>
      {error && (
        <p id="new-item-error" role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
