// 09_バリデーション V-01・V-02・V-03・C-01・C-04（D-92）。Laravel の lang/ja/validation.php と同じ文言にする

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

const EMAIL_MAX_LENGTH = 255;

// C-01：導入版 Laravel 13.40 の標準（TrimStrings が使う Str::trim）が前後から削る65文字。
// JavaScript の trim() とは範囲が違う（ゼロ幅スペースなどを削り、U+0000 も削る）ので、
// 導入版で全文字を試した結果をそのまま使う。Laravel を更新したら、同じ入力例で照合し直す
const LARAVEL_TRIM_CODE_POINTS = new Set([
  0x0000, 0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x0085, 0x00a0,
  0x00ad, 0x034f, 0x061c, 0x115f, 0x1160, 0x1680, 0x17b4, 0x17b5, 0x180e,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008,
  0x2009, 0x200a, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029,
  0x202f, 0x205f, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0x2065, 0x206a,
  0x206b, 0x206c, 0x206d, 0x206e, 0x206f, 0x2800, 0x3000, 0x3164, 0xfeff,
  0xffa0, 0x1d159, 0x1d173, 0x1d174, 0x1d175, 0x1d176, 0x1d177, 0x1d178,
  0x1d179, 0x1d17a, 0xe0020,
]);

function isTrimmed(char: string | undefined): boolean {
  return (
    char !== undefined &&
    LARAVEL_TRIM_CODE_POINTS.has(char.codePointAt(0) ?? -1)
  );
}

/**
 * Laravel 標準の前後空白削除と同じ結果にする（C-01）。パスワードには使わない。
 */
export function trimLikeLaravel(value: string): string {
  const chars = [...value];
  let start = 0;
  let end = chars.length;
  while (start < end && isTrimmed(chars[start])) start++;
  while (end > start && isTrimmed(chars[end - 1])) end--;

  return chars.slice(start, end).join("");
}

/**
 * V-01：必須→長さ→形式の順に、最初の違反だけを返す（C-04）。
 * 形式の細かな判定（email:rfc）は Laravel が行う。Laravel が受け付けるアドレスを画面だけで
 * 拒否しないよう、画面では「@の前後に文字があるか」だけを確かめる。
 */
export function validateEmail(value: string): string | undefined {
  const email = trimLikeLaravel(value);

  // Laravel では空文字が null になり、必須のエラーになる
  if (email === "") return "メールアドレスを入力してください。";
  // C-01：文字数はコードポイントで数える
  if ([...email].length > EMAIL_MAX_LENGTH) {
    return "メールアドレスは255文字以内で入力してください。";
  }
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) {
    return "正しいメールアドレスを入力してください。";
  }

  return undefined;
}

// Laravel 標準の required は、文字列を PHP の trim()（この6文字）で確かめてから未入力と判定する
const PHP_TRIM_CHARS = new Set([" ", "\t", "\n", "\r", "\0", "\v"]);

/**
 * V-02：空白を含めず、ASCIIの0x21〜0x7Eで8〜72文字。パスワードは空白を削らず、変換もしない。
 */
export function validatePassword(value: string): string | undefined {
  // パスワードは削らずに送るが、半角スペース・タブ・改行などだけなら Laravel は未入力として扱う
  if ([...value].every((char) => PHP_TRIM_CHARS.has(char))) {
    return "パスワードを入力してください。";
  }
  if (!/^[!-~]{8,72}$/.test(value)) {
    return "パスワードは空白を含めず、半角の英字・数字・記号で8〜72文字にしてください。";
  }

  return undefined;
}

/**
 * Laravel の errors（項目ごとの配列）から、画面に出す1文を取り出す（C-04）。
 */
export function firstErrors<K extends string>(
  errors: Record<string, string[]>,
  fields: readonly K[],
): FieldErrors<K> {
  const result: FieldErrors<K> = {};
  for (const field of fields) {
    const message = errors[field]?.[0];
    if (message) result[field] = message;
  }

  return result;
}

/**
 * C-04：画面の上から見て最初にエラーがある欄へカーソルを移す。
 */
export function focusFirstError<K extends string>(
  errors: FieldErrors<K>,
  fields: readonly K[],
): void {
  const first = fields.find((field) => errors[field]);
  if (first) document.getElementById(first)?.focus();
}
