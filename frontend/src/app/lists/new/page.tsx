import { redirect } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { requireUser } from "@/features/auth/requireUser";
import { ListForm } from "@/features/lists/ListForm";
import { serverApi } from "@/lib/api/server";
import type { Category } from "@/types/api";

// SC-06 リスト作成・編集（新規）
export default async function NewListPage() {
  const user = await requireUser("/lists/new");

  // D-19：メール認証が済むまで自分のリストは使えない
  if (!user.email_verified_at) redirect("/verify-email");

  // API-18 はログイン不要。画面を開いた分の期限の延長は API-04 で済んでいる
  const categories = await serverApi<Category[]>("/categories");

  return (
    <main className="flex flex-col gap-6 py-8">
      <BackLink href="/lists" />
      <h1 className="text-2xl font-bold">新しいリスト</h1>
      <ListForm categories={categories} />
    </main>
  );
}
