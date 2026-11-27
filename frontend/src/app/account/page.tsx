import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { AvatarSetting } from "@/features/auth/AvatarSetting";
import { CompactDisplaySetting } from "@/features/auth/CompactDisplaySetting";
import { DeleteAccountDialog } from "@/features/auth/DeleteAccountDialog";
import { DisplayNameSetting } from "@/features/auth/DisplayNameSetting";
import { LogoutButton } from "@/features/auth/LogoutButton";
import { PendingEmailStatus } from "@/features/auth/PendingEmailStatus";
import { readAsUser, requireUser } from "@/features/auth/requireUser";
import { SETTING_ACTION, SettingRow } from "@/features/auth/SettingRow";
import { fromPath, pathWithFrom, withFrom } from "@/lib/backPath";
import type { MyAvatar } from "@/types/api";

// SC-12 アカウント設定
export default async function AccountPage(props: PageProps<"/account">) {
  const { from } = await props.searchParams;
  // 共通2：SC-16から開いたときはSC-16へ戻る。それ以外はSC-05へ（利用者の指示）
  const back = fromPath(from, ["/privacy"]);
  // ログインし直した後・SC-14・SC-16・SC-17から戻った後も、「←」の戻り先を保つ
  const currentPath = pathWithFrom("/account", back);
  const user = await requireUser(currentPath);
  // D-128：写真はメール認証が済んでから読める。未認証の人に読みに行くと SC-04 へ移ってしまうので、読まない
  const avatar = user.email_verified_at
    ? (await readAsUser<MyAvatar>("/me/avatar", currentPath)).avatar
    : undefined;

  return (
    <main className="flex flex-col gap-5 py-8">
      {/* メール未認証ならSC-05を開いたときにSC-04へ移る（共通8） */}
      <BackLink href={back ?? "/lists"} />
      <h1 className="text-2xl font-medium">アカウント設定</h1>

      {/* D-73：本人の設定は1つの枠にまとめ、行ごとに今の内容と右の「変更」を並べる */}
      <div className="card divide-y divide-line-soft">
        <SettingRow
          title="メールアドレス"
          value={<p className="break-all">{user.email}</p>}
          action={
            // SC-12-4：入力はSC-17で行い、この画面はほかの設定と同じく入口だけにする（D-108）
            user.email_verified_at && (
              <Link
                href={withFrom("/account/email/change", currentPath)}
                prefetch={false}
                aria-label="メールアドレスを変更"
                className={SETTING_ACTION}
              >
                変更
              </Link>
            )
          }
        >
          {/* 取り消した後の案内を残すため、確認中がなくても置いておく（D-107） */}
          <PendingEmailStatus pendingEmail={user.pending_email} />
          {user.email_verified_at && user.pending_email && (
            <Link
              href="/account/email"
              prefetch={false}
              className="mt-1 self-start text-sm text-link tap-target"
            >
              確認メールの案内を開く
            </Link>
          )}
        </SettingRow>

        {/* SC-12-10・D-119：共同編集のメンバーに見せる表示名。リストを使えるメール認証済みの人にだけ出す */}
        {user.email_verified_at && (
          <DisplayNameSetting displayName={user.display_name} />
        )}

        {/* SC-12-12・D-128：写真。表示名と同じく、メール認証済みの人にだけ出す（API-70 もメール認証が要る） */}
        {avatar !== undefined && <AvatarSetting avatar={avatar} />}

        {/* SC-12-5・F-13：ログイン中の専用の変更機能は作らず、再設定メールで変える。
            説明の文は置かない（「変更」で開く再設定メールの画面（SC-14）で分かるため、利用者の指示） */}
        <SettingRow
          title="パスワード"
          action={
            <Link
              href={withFrom("/forgot-password", currentPath)}
              aria-label="パスワードを変更"
              className={SETTING_ACTION}
            >
              変更
            </Link>
          }
        />
      </div>

      {/* SC-12-11・D-126：持ち物の行を詰める表示。リストを使えるメール認証済みの人にだけ出す。
          アカウントではなく、この端末のブラウザに覚える */}
      {user.email_verified_at && (
        <div className="card">
          <CompactDisplaySetting />
        </div>
      )}

      <Link
        href={withFrom("/privacy", currentPath)}
        prefetch={false}
        className="card flex min-h-13 items-center justify-between gap-2 px-4 py-3 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {/* 幅の狭いスマホで折り返すときも、言葉の途中ではなく「・」の後で分ける */}
        <span>
          <span className="whitespace-nowrap">プライバシーポリシー・</span>
          <wbr />
          <span className="whitespace-nowrap">お問い合わせ</span>
        </span>
        {/* 下向きの矢印を右へ回し、別の画面へ進む行だと分かるようにする */}
        <Icon name="chevron" className="size-5 -rotate-90 text-muted" />
      </Link>

      {/* SC-12-9・D-115：iPhone は自動で案内が出ないので、追加の仕方をここに書く。
          ホーム画面から開いているとき（standalone）は追加済みなので出さない。保存するものはない */}
      <section className="card-sunken flex flex-col gap-2 px-4 py-4 [@media(display-mode:standalone)]:hidden">
        <h2 className="font-bold">ホーム画面に追加</h2>
        <p>スマホのホーム画面に置くと、アプリのように開けます。</p>
        <ul className="flex flex-col gap-1">
          <li>iPhone：Safariの共有ボタンから「ホーム画面に追加」</li>
          <li>
            Android：Chromeの右上のメニューから「ホーム画面に追加」または「アプリをインストール」
          </li>
        </ul>
        {/* iPhone はホーム画面から開いた分と Safari でログインの記録が別になる */}
        <p className="text-sm text-muted">
          iPhoneでは、ホーム画面から開いたときに一度ログインし直します。
        </p>
      </section>

      <LogoutButton />
      <DeleteAccountDialog />
    </main>
  );
}
