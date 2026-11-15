import Link from "next/link";
import { BackLink } from "@/components/BackLink";
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
      {/* 共通2：メールのリンクから開くので前の画面がない。再設定をやめる人向けにSC-02へ戻し、
          直接来た人にも行き先が分かるよう矢印の横に書く（利用者の指示） */}
      <BackLink href="/login" label="ログインへ" />

      {hasLink ? (
        <ResetPasswordForm token={token} email={email} />
      ) : (
        // C-04：tokenがないときの文言。入力しても保存できないので、入力欄は出さない
        <div role="alert" className="flex flex-col gap-2 text-red-700">
          <p>再設定用のリンクを開き直してください。</p>
          {/* リンクが使えないときは、エラーの近くでメールの送り直しを案内する（利用者の指示、SC-15-5と同じ文言） */}
          <Link
            href="/forgot-password"
            className="self-start underline tap-target"
          >
            再設定メールを送り直す
          </Link>
        </div>
      )}
    </main>
  );
}
