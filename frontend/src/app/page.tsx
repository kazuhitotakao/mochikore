import Link from "next/link";
import { redirect } from "next/navigation";
import { optionalUser } from "@/features/auth/optionalUser";

export default async function Home() {
  const user = await optionalUser();
  if (user) redirect(user.email_verified_at ? "/lists" : "/verify-email");

  return (
    <main className="flex flex-col gap-6 py-12">
      <h1 className="text-3xl font-bold">もちこれ</h1>
      <p>
        用途ごとに持ち物・買い物のリストを作り、チェックして使えます。
        必要なら公開して、ほかの人にも見てもらえます。
      </p>
      <Link
        href="/register"
        prefetch={false}
        className="rounded bg-zinc-900 px-4 py-3 text-center text-white"
      >
        新規会員登録
      </Link>
      <Link
        href="/login"
        prefetch={false}
        className="rounded border border-zinc-400 px-4 py-3 text-center"
      >
        ログイン
      </Link>
      <Link href="/public/lists" prefetch={false} className="underline">
        公開リストを見る
      </Link>
      <Link href="/privacy" prefetch={false} className="underline">
        プライバシーポリシー・お問い合わせ
      </Link>
    </main>
  );
}
