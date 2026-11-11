"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { FieldError } from "@/components/FieldError";
import { trimLikeLaravel } from "@/features/auth/validation";
import { validateGroupName } from "./validation";

type Props = {
  title: string;
  submitLabel: string;
  initialName: string;
  // 同じリストのほかのグループの名前。同名を確かめる（D-57）
  otherNames: readonly string[];
  onSubmit: (name: string) => void;
  onCancel: () => void;
};

// SC-09-3・5：グループ名の入力。下書きに入れるだけで、まだ保存しない（OK でまとめて保存する、D-59）。
// 開くたびに作り直すので、親は開いている間だけ表示する
export function GroupNameDialog({
  title,
  submitLabel,
  initialName,
  otherNames,
  onSubmit,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const inputId = useId();
  const errorId = useId();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = validateGroupName(name, otherNames);
    if (invalid) {
      setError(invalid);
      return;
    }
    // 表示と比べやすいよう、Laravel と同じく前後の空白を削った名前を下書きに入れる
    onSubmit(trimLikeLaravel(name));
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded bg-background p-6 text-foreground backdrop:bg-black/40"
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <h2 id={titleId} className="font-bold">
          {title}
        </h2>
        <div>
          <label htmlFor={inputId} className="block font-medium">
            グループ名
          </label>
          <input
            id={inputId}
            type="text"
            value={name}
            autoFocus
            aria-invalid={Boolean(error)}
            aria-describedby={errorId}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            className="w-full rounded border border-zinc-400 px-3 py-2"
          />
          <FieldError id={errorId} message={error ?? undefined} />
        </div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-zinc-400 px-4 py-2"
          >
            やめる
          </button>
          <button
            type="submit"
            className="rounded bg-zinc-900 px-4 py-2 text-white"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
