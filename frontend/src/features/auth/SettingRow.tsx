import type { ReactNode } from "react";

type Props = {
  title: string;
  // 入力欄の名前として見出しを使うとき（aria-labelledby）に渡す
  titleId?: string;
  // 今の内容。見出しのすぐ下に出す
  value?: ReactNode;
  // 行の右に置く操作（「変更」など）
  action?: ReactNode;
  // 補足・状態・入力欄。行の幅いっぱいに出す
  children?: ReactNode;
};

/**
 * SC-12 アカウント設定の1行（D-73）。左に見出しと今の内容、右に操作を並べ、
 * メールアドレス・表示名・パスワードを同じ形にそろえる。
 */
export function SettingRow({ title, titleId, value, action, children }: Props) {
  return (
    <section className="flex flex-col gap-1 px-4 py-4">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id={titleId} className="font-bold">
            {title}
          </h2>
          {value}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// 行の右に置く「変更」などの小さいボタン・リンクの形
export const SETTING_ACTION = "shrink-0 btn-outline btn-sm tap-target";
