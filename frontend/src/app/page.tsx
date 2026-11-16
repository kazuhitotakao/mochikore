import Link from "next/link";
import { redirect } from "next/navigation";
import { optionalUser } from "@/features/auth/optionalUser";

export default async function Home() {
  const user = await optionalUser();
  if (user) redirect(user.email_verified_at ? "/lists" : "/verify-email");

  return (
    <main className="flex flex-col gap-6 py-12">
      <h1 className="text-3xl font-bold text-brand-deep">もちこれ</h1>
      <p>
        用途ごとに持ち物・買い物のリストを作り、チェックして使えます。
        必要なら公開して、ほかの人にも見てもらえます。
      </p>
      {/* 画面の絵と同じく、2つのボタンは近づけて並べる */}
      <div className="flex flex-col gap-3">
        <Link href="/register" prefetch={false} className="btn-primary">
          新規会員登録
        </Link>
        <Link href="/login" prefetch={false} className="btn-outline">
          ログイン
        </Link>
      </div>
      <Link
        href="/public/lists"
        prefetch={false}
        className="self-start text-link tap-target"
      >
        公開リストを見る
      </Link>
      <Link
        href="/privacy"
        prefetch={false}
        className="self-start text-link tap-target"
      >
        プライバシーポリシー・お問い合わせ
      </Link>
    </main>
  );
}
