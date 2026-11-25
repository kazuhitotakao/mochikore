import { FieldError } from "@/components/FieldError";
import { DISPLAY_NAME_MAX_LENGTH } from "./validation";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error: string | undefined;
  disabled: boolean;
  // 入力欄の下に出す説明。だれに見えるかを伝える
  hint?: string;
};

/**
 * D-119・V-27：共同編集のメンバーに見せる表示名の入力欄。
 * 招待リンクを作るとき（SC-07-23）・参加するとき（SC-19）・アカウント設定（SC-12）で同じ形にする。
 */
export function DisplayNameField({
  id,
  value,
  onChange,
  error,
  disabled,
  hint = "同じリストのメンバーに見える名前です。メールアドレスは見えません。",
}: Props) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-bold">
        表示名
      </label>
      <input
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        autoComplete="nickname"
        enterKeyHint="done"
        aria-invalid={error ? true : undefined}
        aria-describedby={`${error ? `${errorId} ` : ""}${hintId}`}
        onChange={(event) => onChange(event.target.value)}
        className="field w-full"
      />
      <FieldError id={errorId} message={error} />
      <p id={hintId} className="mt-1 text-sm text-muted">
        {hint}（{DISPLAY_NAME_MAX_LENGTH}文字まで）
      </p>
    </div>
  );
}
