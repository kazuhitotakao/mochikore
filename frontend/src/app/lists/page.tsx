import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/features/auth/requireUser";

// SC-05 自分のリスト一覧。一覧は手順書第13章で作る。今はログイン後の移動先として見出しだけ置く
export default async function ListsPage(props: PageProps<"/lists">) {
  const user = await requireUser("/lists");

  // D-19：メール認証が済むまで自分のリストは使えない
  if (!user.email_verified_at) redirect("/verify-email");

  const searchParams = await props.searchParams;

  return (
    <main className="flex flex-col gap-6 py-8">
      <h1 className="text-2xl font-bold">自分のリスト</h1>

      {/* 02_画面配置 SC-04-6：確認メールのリンクで認証が済んだ後 */}
      {searchParams.verified === "1" && (
        <p role="status">メール認証が完了しました。</p>
      )}

      <Link href="/account" prefetch={false} className="underline">
        アカウント設定
      </Link>
    </main>
  );
}
