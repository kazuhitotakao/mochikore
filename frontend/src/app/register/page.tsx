import Link from "next/link";
import { RegisterForm } from "@/features/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <main className="flex flex-col gap-6 py-8">
      <h1 className="text-2xl font-bold">新規会員登録</h1>

      <p className="text-sm">
        <Link href="/privacy" prefetch={false} className="underline">
          プライバシーポリシー・お問い合わせ
        </Link>
        で、預かる情報と利用目的をご確認いただけます。
      </p>

      <RegisterForm />

      <Link href="/login" className="underline">
        ログイン
      </Link>
    </main>
  );
}
