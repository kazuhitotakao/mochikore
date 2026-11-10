import Link from "next/link";
import { ResetPasswordForm } from "@/features/auth/ResetPasswordForm";

// SC-15 新しいパスワードを設定する。ログインは不要
export default async function ResetPasswordPage(
  props: PageProps<"/reset-password">,
) {
  // SC-15-1：URLのtokenとemailを持っておく。開いただけではAPIを呼ばず、リンクを無効にしない
  const { token, email } = await props.searchParams;
  const hasLink =
    typeof token === "string" &&
    token !== "" &&
    typeof email === "string" &&
    email !== "";

  return (
    <main className="flex flex-col gap-6 py-8">
      <h1 className="text-2xl font-bold">新しいパスワードを設定</h1>

      {hasLink ? (
        <ResetPasswordForm token={token} email={email} />
      ) : (
        // C-04：tokenがないときの文言。入力しても保存できないので、入力欄は出さない
        <div role="alert" className="flex flex-col gap-2 text-red-700">
          <p>再設定用のリンクを開き直してください。</p>
          <Link href="/forgot-password" className="underline">
            再設定メールを送る
          </Link>
        </div>
      )}
    </main>
  );
}
