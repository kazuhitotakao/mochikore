import Link from "next/link";
import { DeleteAccountDialog } from "@/features/auth/DeleteAccountDialog";
import { EmailChangeForm } from "@/features/auth/EmailChangeForm";
import { LogoutButton } from "@/features/auth/LogoutButton";
import { requireUser } from "@/features/auth/requireUser";

// SC-12 アカウント設定
export default async function AccountPage() {
  const user = await requireUser("/account");

  return (
    <main className="flex flex-col gap-6 py-8">
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
      <Link href="/forgot-password" className="underline">
        パスワードを変更
      </Link>

      <Link href="/privacy" prefetch={false} className="underline">
        プライバシーポリシー・お問い合わせ
      </Link>

      <LogoutButton />
      <DeleteAccountDialog />
    </main>
  );
}
