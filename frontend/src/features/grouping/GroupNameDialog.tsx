"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { FieldError } from "@/components/FieldError";
import { useBackdropDismiss } from "@/components/useBackdropDismiss";
import { trimLikeLaravel } from "@/features/auth/validation";
import type { GroupCheckMode } from "@/types/api";
import { CheckModeField } from "./CheckModeField";
import { validateGroupName } from "./validation";

type Props = {
  title: string;
  submitLabel: string;
  initialName: string;
  // D-122：チェックの動き。新しいグループは「通常」から始める
  initialCheckMode: GroupCheckMode;
  // 同じリストのほかのグループの名前。同名を確かめる（D-57）
  otherNames: readonly string[];
  onSubmit: (name: string, checkMode: GroupCheckMode) => void;
  // 「キャンセル」・Esc・外枠を押したとき（外枠は利用者の指示）
  onCancel: () => void;
  // SC-09-11：「グループを追加」のときだけ、入力欄の下によく使うグループの候補を出す（D-102）
  children?: ReactNode;
};

// SC-09-3・5：グループ名とチェックの動き（D-122）の入力。下書きに入れるだけで、まだ保存しない（画面を離れるときにまとめて保存する、D-59・D-113）。
// 開くたびに作り直すので、親は開いている間だけ表示する
export function GroupNameDialog({
  title,
  submitLabel,
  initialName,
  initialCheckMode,
  otherNames,
  onSubmit,
  onCancel,
  children,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const inputId = useId();
  const errorId = useId();
  const checkModeName = useId();
  const [name, setName] = useState(initialName);
  const [checkMode, setCheckMode] = useState(initialCheckMode);
  const [error, setError] = useState<string | null>(null);
  const backdrop = useBackdropDismiss(onCancel);

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
    onSubmit(trimLikeLaravel(name), checkMode);
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      {...backdrop}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl bg-background p-6 text-foreground backdrop:bg-overlay/50"
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <h2 id={titleId} className="text-lg font-bold">
          {title}
        </h2>
        <div>
          <label htmlFor={inputId} className="mb-1 block font-bold">
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
            className="field w-full"
          />
          <FieldError id={errorId} message={error ?? undefined} />
        </div>
        <CheckModeField
          name={checkModeName}
          value={checkMode}
          onChange={setCheckMode}
        />
        {children}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="btn-outline">
            キャンセル
          </button>
          <button type="submit" className="btn-primary">
            {submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
