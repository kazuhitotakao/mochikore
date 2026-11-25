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
  const searchParams = await props.searchParams;
  const link = readVerificationLink(searchParams);
  // 別の端末で未ログインのときは、ログイン後に同じリンクへ戻る（SC-04-6）
  const currentPath = link
    ? `/verify-email?${new URLSearchParams(link)}`
    : "/verify-email";

  const user = await requireUser(currentPath);

  // SC-04：認証後は自分のリスト一覧へ
  if (user.email_verified_at) redirect("/lists");

  return (
    <main className="flex flex-col gap-6 py-8">
      <h1 className="text-2xl font-medium">メールを確認してください</h1>

      {link && <EmailVerificationLink link={link} currentPath={currentPath} />}

      <div className="flex flex-col gap-2">
        <p>
          送信先：<span className="font-medium">{user.email}</span>
        </p>
        <p>メールに届いたリンクを開いてください。リンクは60分間有効です。</p>
        <p>登録から7日以内に認証しないと、アカウントは削除されます。</p>
        {/* D-121：共同編集の招待リンクから登録した直後だけ、認証の後の行き先を伝える */}
        {searchParams.invited === "1" && (
          <p>メール認証が済むと、招待されたリストへ進みます。</p>
        )}
      </div>

      <ResendVerificationButton />

      <Link
        href="/account"
        prefetch={false}
        className="self-start text-link tap-target"
      >
        アカウント設定
      </Link>
    </main>
  );
}
