import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { DeleteAccountDialog } from "@/features/auth/DeleteAccountDialog";
import { EmailChangeForm } from "@/features/auth/EmailChangeForm";
import { LogoutButton } from "@/features/auth/LogoutButton";
import { requireUser } from "@/features/auth/requireUser";
import { fromPath, pathWithFrom, withFrom } from "@/lib/backPath";

// SC-12 アカウント設定
export default async function AccountPage(props: PageProps<"/account">) {
  const { from } = await props.searchParams;
  // 共通2：SC-16から開いたときはSC-16へ戻る。それ以外はSC-05へ（利用者の指示）
  const back = fromPath(from, ["/privacy"]);
  // ログインし直した後・SC-14・SC-16から戻った後も、「←」の戻り先を保つ
  const currentPath = pathWithFrom("/account", back);
  const user = await requireUser(currentPath);

  return (
    <main className="flex flex-col gap-6 py-8">
      {/* メール未認証ならSC-05を開いたときにSC-04へ移る（共通8） */}
      <BackLink href={back ?? "/lists"} />
      <h1 className="text-2xl font-bold">アカウント設定</h1>

      <section className="flex flex-col gap-1">
        <h2 className="font-medium">メールアドレス</h2>
        <p className="break-all">{user.email}</p>
        {user.pending_email && (
          <p className="break-all">確認中：{user.pending_email}</p>
        )}
      </section>

      {user.email_verified_at && (
        <section
          className="flex flex-col gap-4"
          aria-labelledby="email-change-heading"
        >
          <h2 id="email-change-heading" className="font-medium">
            メールアドレスの変更
          </h2>
          <p className="text-sm">
            新しいアドレスに届くリンクで変更を確定します。確定するまでは、現在のアドレスを使います。
          </p>
          <EmailChangeForm currentEmail={user.email} />
          {user.pending_email && (
            <Link href="/account/email" prefetch={false} className="underline">
              確認メールの案内を開く
            </Link>
          )}
        </section>
      )}

      {/* SC-12-5・F-13：ログイン中の専用の変更機能は作らず、再設定メールで変える */}
      <Link
        href={withFrom("/forgot-password", currentPath)}
        className="underline"
      >
        パスワードを変更
      </Link>

      <Link
        href={withFrom("/privacy", currentPath)}
        prefetch={false}
        className="underline"
      >
        プライバシーポリシー・お問い合わせ
      </Link>

      <LogoutButton />
      <DeleteAccountDialog />
    </main>
  );
}
