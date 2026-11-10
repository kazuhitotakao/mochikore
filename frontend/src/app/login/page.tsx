import Link from "next/link";
import { LoginForm } from "@/features/auth/LoginForm";
import { safeNextPath } from "@/features/auth/nextPath";

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const next = safeNextPath(searchParams.next);

  return (
    <main className="flex flex-col gap-6 py-8">
      <h1 className="text-2xl font-bold">ログイン</h1>

      {/* 02_画面配置 共通7：ログインが必要な画面で401になったとき */}
      {searchParams.expired === "1" && (
        <p role="status">
          ログインの期限が切れました。もう一度ログインしてください。
        </p>
      )}

      <LoginForm next={next} />

      <Link href="/register" className="underline">
        新規会員登録
      </Link>
    </main>
  );
}
