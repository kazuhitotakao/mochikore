"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useAuthErrorRedirect } from "@/features/auth/useAuthErrorRedirect";
import { trimLikeLaravel } from "@/features/auth/validation";
import { clientApi } from "@/lib/api/client";
import type { PackingListItem } from "@/types/api";
import { isNotFound, itemErrorMessage } from "./itemErrors";
import { validateItemName } from "./validation";

type Props = {
  listId: number;
  onAdded: (item: PackingListItem) => void;
};

// F-05・SC-07-13：利用者の指示でD-73の下部固定を末尾の空行へ変え、Enterと欄外移動で保存する。
// API-10・D-34・D-92、09_バリデーション13行Jメモ（V-08）と38〜45行Jメモ（C-01〜08）を確認。
export function AddItemRow({ listId, onAdded }: Props) {
  const router = useRouter();
  const redirectIfAuthError = useAuthErrorRedirect();
  const inputRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef("");
  const inFlight = useRef(false);
  const composing = useRef(false);
  const blurredWhileComposing = useRef(false);
  const pendingBlur = useRef<string | null>(null);
  const failedDraft = useRef<string | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function blurOutside(event: PointerEvent) {
      const input = inputRef.current;
      // 欄外のタップをブラウザの標準フォーカス移動だけに任せず、onBlurでの保存につなぐ。
      if (
        input &&
        document.activeElement === input &&
        event.target instanceof Node &&
        !input.contains(event.target)
      ) {
        input.blur();
      }
    }
    document.addEventListener("pointerdown", blurOutside, true);
    return () => document.removeEventListener("pointerdown", blurOutside, true);
  }, []);

  async function save(reason: "enter" | "blur") {
    if (composing.current) {
      if (reason === "blur") blurredWhileComposing.current = true;
      return;
    }
    if (inFlight.current) {
      if (reason === "blur") pendingBlur.current = draftRef.current;
      return;
    }

    const submitted = draftRef.current;
    // 未入力の空行から離れただけでは、空の持ち物を送信しない。
    if (reason === "blur" && trimLikeLaravel(submitted) === "") {
      draftRef.current = "";
      setName("");
      setError(null);
      failedDraft.current = null;
      return;
    }
    // 通信失敗では保存済みか分からない場合もあるため、欄外へ移っただけで送り直さない（C-04）。
    if (reason === "blur" && failedDraft.current === submitted) return;

    const invalid = validateItemName(submitted);
    if (invalid) {
      failedDraft.current = submitted;
      setError(invalid);
      if (reason === "enter") inputRef.current?.focus();
      return;
    }

    // stateの反映前にEnterとblurが続いても、同じ入力を二重に送らない。
    inFlight.current = true;
    pendingBlur.current = null;
    setSubmitting(true);
    setError(null);
    let saved = false;

    try {
      const item = await clientApi<PackingListItem>(`/lists/${listId}/items`, {
        method: "POST",
        // 前後空白の削除はLaravelに任せる（V-08・C-01・D-92）。
        body: { name: submitted },
      });
      // 送信中に書き換えた次の入力は消さない。
      if (draftRef.current === submitted) {
        draftRef.current = "";
        setName("");
      }
      failedDraft.current = null;
      onAdded(item);
      saved = true;
    } catch (failure) {
      failedDraft.current = submitted;
      if (redirectIfAuthError(failure)) return;
      if (isNotFound(failure)) {
        router.refresh();
        return;
      }
      setError(itemErrorMessage(failure));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }

    const blurredDraft = pendingBlur.current;
    pendingBlur.current = null;
    if (!saved) return;

    if (document.activeElement === inputRef.current) {
      // 同じinputを残すのでキーボードを閉じず、増えた行の下でも入力位置が見えるようにする。
      requestAnimationFrame(() => {
        if (document.activeElement === inputRef.current) {
          inputRef.current?.scrollIntoView({ block: "nearest" });
        }
      });
    } else if (blurredDraft !== null && draftRef.current === blurredDraft) {
      // 前の保存中に次の名前を書いて欄外へ移った場合も、失敗時は自動再送せず、成功後だけ保存する。
      void save("blur");
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    // 変換確定のEnterを追加として扱わない。formを使わず、暗黙のsubmitも起こさない。
    if (
      composing.current ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    ) {
      return;
    }
    event.preventDefault();
    void save("enter");
  }

  return (
    <div
      className="flex flex-col gap-1 border-b border-zinc-200 py-2"
      role="group"
      aria-label="持ち物の追加"
    >
      <label htmlFor="new-item-name" className="sr-only">
        持ち物名
      </label>
      <p id="new-item-hint" className="sr-only">
        Enter、または入力欄の外を押すと保存します。
      </p>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          disabled
          checked={false}
          aria-label="新しい持ち物（保存前）"
          className="size-5 shrink-0"
        />
        <input
          ref={inputRef}
          id="new-item-name"
          type="text"
          value={name}
          placeholder="持ち物を追加…"
          enterKeyHint="enter"
          aria-invalid={Boolean(error)}
          aria-busy={submitting}
          aria-describedby={`new-item-hint${error ? " new-item-error" : ""}`}
          onChange={(event) => {
            draftRef.current = event.target.value;
            setName(event.target.value);
            failedDraft.current = null;
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => void save("blur")}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            draftRef.current = event.currentTarget.value;
            setName(event.currentTarget.value);
            if (blurredWhileComposing.current) {
              blurredWhileComposing.current = false;
              queueMicrotask(() => {
                if (document.activeElement !== inputRef.current)
                  void save("blur");
              });
            }
          }}
          className="min-h-6 min-w-0 flex-1 scroll-mb-24 bg-transparent pr-2 text-base outline-none placeholder:text-zinc-400 focus-visible:outline-1 focus-visible:outline-zinc-400"
        />
      </div>
      {error && (
        <p
          id="new-item-error"
          role="alert"
          className="pl-7 text-sm text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}
