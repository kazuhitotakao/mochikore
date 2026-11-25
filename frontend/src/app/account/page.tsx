import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { DeleteAccountDialog } from "@/features/auth/DeleteAccountDialog";
import { DisplayNameSetting } from "@/features/auth/DisplayNameSetting";
import { LogoutButton } from "@/features/auth/LogoutButton";
import { PendingEmailStatus } from "@/features/auth/PendingEmailStatus";
import { requireUser } from "@/features/auth/requireUser";
import { fromPath, pathWithFrom, withFrom } from "@/lib/backPath";

// SC-12 アカウント設定
export default async function AccountPage(props: PageProps<"/account">) {
  const { from } = await props.searchParams;
  // 共通2：SC-16から開いたときはSC-16へ戻る。それ以外はSC-05へ（利用者の指示）
  const back = fromPath(from, ["/privacy"]);
  // ログインし直した後・SC-14・SC-16・SC-17から戻った後も、「←」の戻り先を保つ
  const currentPath = pathWithFrom("/account", back);
  const user = await requireUser(currentPath);

  return (
    <main className="flex flex-col gap-6 py-8">
      {/* メール未認証ならSC-05を開いたときにSC-04へ移る（共通8） */}
      <BackLink href={back ?? "/lists"} />
      <h1 className="text-2xl font-medium">アカウント設定</h1>

      <section className="flex flex-col gap-1">
        <h2 className="font-bold">メールアドレス</h2>
        <p className="break-all">{user.email}</p>
        {/* 取り消した後の案内を残すため、確認中がなくても置いておく（D-107） */}
        <PendingEmailStatus pendingEmail={user.pending_email} />
        {/* SC-12-4：入力はSC-17で行い、この画面はほかの設定と同じくリンクだけにする（D-108） */}
        {user.email_verified_at && (
          <Link
            href={withFrom("/account/email/change", currentPath)}
            prefetch={false}
            className="self-start text-link tap-target"
          >
            メールアドレスを変更
          </Link>
        )}
        {user.email_verified_at && user.pending_email && (
          <Link
            href="/account/email"
            prefetch={false}
            className="self-start text-link tap-target"
          >
            確認メールの案内を開く
          </Link>
        )}
      </section>

      {/* SC-12-10・D-119：共同編集のメンバーに見せる表示名。リストを使えるメール認証済みの人にだけ出す */}
      {user.email_verified_at && (
        <section className="flex flex-col gap-1">
          <h2 className="font-bold">表示名</h2>
          <DisplayNameSetting displayName={user.display_name} />
        </section>
      )}

      {/* SC-12-5・F-13：ログイン中の専用の変更機能は作らず、再設定メールで変える */}
      <Link
        href={withFrom("/forgot-password", currentPath)}
        className="self-start text-link tap-target"
      >
        パスワードを変更
      </Link>

      <Link
        href={withFrom("/privacy", currentPath)}
        prefetch={false}
        className="self-start text-link tap-target"
      >
        プライバシーポリシー・お問い合わせ
      </Link>

      {/* SC-12-9・D-115：iPhone は自動で案内が出ないので、追加の仕方をここに書く。
          ホーム画面から開いているとき（standalone）は追加済みなので出さない。保存するものはない */}
      <section className="flex flex-col gap-1 [@media(display-mode:standalone)]:hidden">
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
