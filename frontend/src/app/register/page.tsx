import Link from "next/link";
import { RegisterForm } from "@/features/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <main className="flex flex-col gap-6 py-8">
      <h1 className="text-2xl font-bold">新規会員登録</h1>

      <RegisterForm />

      <Link href="/login" className="underline">
        ログイン
      </Link>
    </main>
  );
}
