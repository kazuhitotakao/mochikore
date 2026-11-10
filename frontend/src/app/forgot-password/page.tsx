import Link from "next/link";
import { ForgotPasswordForm } from "@/features/auth/ForgotPasswordForm";

// SC-14 再設定メールを送る。ログインしていてもいなくても使える（SC-12からも来る）
export default function ForgotPasswordPage() {
  return (
    <main className="flex flex-col gap-6 py-8">
      <h1 className="text-2xl font-bold">パスワードの再設定</h1>

      <ForgotPasswordForm />

      <Link href="/login" className="underline">
        ログイン画面へ戻る
      </Link>
    </main>
  );
}
