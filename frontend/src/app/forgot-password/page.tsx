import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { ForgotPasswordForm } from "@/features/auth/ForgotPasswordForm";
import { fromPath } from "@/lib/backPath";

// SC-14 再設定メールを送る。ログインしていてもいなくても使える（SC-12からも来る）
export default async function ForgotPasswordPage(
  props: PageProps<"/forgot-password">,
) {
  const { from } = await props.searchParams;
  // 共通2：SC-02・SC-03・SC-12から来たときはその画面へ、それ以外はSC-02へ戻る（利用者の指示）
  const back = fromPath(from, ["/login", "/register", "/account"]) ?? "/login";

  return (
    <main className="flex flex-col gap-6 py-8">
      <BackLink href={back} />
      <h1 className="text-2xl font-bold">パスワードの再設定</h1>

      <ForgotPasswordForm />

      <Link href="/login" className="self-start underline tap-target">
        ログイン画面へ戻る
      </Link>
    </main>
  );
}
