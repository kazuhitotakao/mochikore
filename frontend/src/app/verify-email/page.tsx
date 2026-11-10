import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/features/auth/requireUser";

// SC-04 メール認証の案内・結果。確認メールの再送とリンクでの認証は、手順書第11章の手順6で足す
export default async function VerifyEmailPage() {
  const user = await requireUser("/verify-email");

  // SC-04：認証後は自分のリスト一覧へ
  if (user.email_verified_at) redirect("/lists");

  return (
    <main className="flex flex-col gap-6 py-8">
      <h1 className="text-2xl font-bold">メールを確認してください</h1>

      <div className="flex flex-col gap-2">
        <p>
          送信先：<span className="font-medium">{user.email}</span>
        </p>
        <p>メールに届いたリンクを開いてください。リンクは60分間有効です。</p>
        <p>登録から7日以内に認証しないと、アカウントは削除されます。</p>
      </div>

      <Link href="/account" prefetch={false} className="underline">
        アカウント設定
      </Link>
    </main>
  );
}
