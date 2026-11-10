import Link from "next/link";
import { redirect } from "next/navigation";
import { EmailVerificationLink } from "@/features/auth/EmailVerificationLink";
import { ResendVerificationButton } from "@/features/auth/ResendVerificationButton";
import { requireUser } from "@/features/auth/requireUser";
import { readVerificationLink } from "@/features/auth/verificationLink";

// SC-04 メール認証の案内・結果
export default async function VerifyEmailPage(
  props: PageProps<"/verify-email">,
) {
  const link = readVerificationLink(await props.searchParams);
  // 別の端末で未ログインのときは、ログイン後に同じリンクへ戻る（SC-04-6）
  const currentPath = link
    ? `/verify-email?${new URLSearchParams(link)}`
    : "/verify-email";

  const user = await requireUser(currentPath);

  // SC-04：認証後は自分のリスト一覧へ
  if (user.email_verified_at) redirect("/lists");

  return (
    <main className="flex flex-col gap-6 py-8">
      <h1 className="text-2xl font-bold">メールを確認してください</h1>

      {link && <EmailVerificationLink link={link} currentPath={currentPath} />}

      <div className="flex flex-col gap-2">
        <p>
          送信先：<span className="font-medium">{user.email}</span>
        </p>
        <p>メールに届いたリンクを開いてください。リンクは60分間有効です。</p>
        <p>登録から7日以内に認証しないと、アカウントは削除されます。</p>
      </div>

      <ResendVerificationButton />

      <Link href="/account" prefetch={false} className="underline">
        アカウント設定
      </Link>
    </main>
  );
}
