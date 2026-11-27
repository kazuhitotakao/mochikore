import { FieldError } from "@/components/FieldError";
import { DISPLAY_NAME_MAX_LENGTH } from "./validation";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error: string | undefined;
  disabled: boolean;
  // 入力欄の上の見出し。初めて入れる会員登録（SC-03）だけ「表示名（ニックネーム）」にする（D-127）
  label?: string;
  // 入力欄の下に出す説明。だれに見えるかを伝える
  hint?: string;
  // すぐ上に「表示名」の見出しがある画面（SC-12）では、その見出しのIDを渡す。
  // 同じ言葉が2つ並ばないよう、この部品のラベルは出さずに見出しを入力欄の名前にする
  labelledBy?: string;
  // 「変更」を押して開いた入力欄は、すぐ打てるようにする
  autoFocus?: boolean;
};

/**
 * D-119・V-27：共同編集のメンバーに見せる表示名の入力欄。
 * 会員登録（SC-03）とアカウント設定（SC-12）で同じ形にする（D-127）。
 */
export function DisplayNameField({
  id,
  value,
  onChange,
  error,
  disabled,
  label = "表示名",
  hint = "同じリストのメンバーに見える名前です。メールアドレスは見えません。",
  labelledBy,
  autoFocus,
}: Props) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div>
      {!labelledBy && (
        <label htmlFor={id} className="mb-1 block font-bold">
          {label}
        </label>
      )}
      <input
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        autoComplete="nickname"
        enterKeyHint="done"
        autoFocus={autoFocus}
        aria-labelledby={labelledBy}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${error ? `${errorId} ` : ""}${hintId}`}
        onChange={(event) => onChange(event.target.value)}
        className="field w-full"
      />
      <FieldError id={errorId} message={error} />
      <p id={hintId} className="mt-1 text-sm text-muted">
        {hint}
        {/* 「（20」と「文字まで）」に分かれないよう、途中で改行しない */}
        <span className="whitespace-nowrap">
          （{DISPLAY_NAME_MAX_LENGTH}文字まで）
        </span>
      </p>
    </div>
  );
}
