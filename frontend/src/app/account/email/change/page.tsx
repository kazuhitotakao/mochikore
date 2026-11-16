import { redirect } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { EmailChangeForm } from "@/features/auth/EmailChangeForm";
import { requireUser } from "@/features/auth/requireUser";
import { fromPath, pathWithFrom } from "@/lib/backPath";

// SC-17 メールアドレスの変更。SC-12のリンクから開き、送った後はSC-13へ進む（D-108）
export default async function EmailChangeInputPage(
  props: PageProps<"/account/email/change">,
) {
  const { from } = await props.searchParams;
  // 共通2：SC-12へ戻る。SC-12の「←」の戻り先（SC-16から開いたときなど）も保つ
  const back = fromPath(from, ["/account"]);
  const currentPath = pathWithFrom("/account/email/change", back);
  const user = await requireUser(currentPath);
  // API-27はメール認証済みの本人だけ使えるので、未認証ならSC-04へ（共通8）
  if (!user.email_verified_at) redirect("/verify-email");

  return (
    <main className="flex flex-col gap-6 py-8">
      <BackLink href={back ?? "/account"} />
      <h1 className="text-2xl font-medium">メールアドレスの変更</h1>

      <div className="flex flex-col gap-1">
        {/* SC-12の表示から離れても、今のアドレスと別のものを入れやすくする */}
        <p className="break-all">現在：{user.email}</p>
        {/* API-27は確認中の変更先を置き換え、前の確認リンクを無効にする（D-72） */}
        {user.pending_email && (
          <p className="card-sunken mt-2 px-4 py-3 text-sm break-all text-muted">
            確認中：{user.pending_email}（別のアドレスを送ると置き換わります）
          </p>
        )}
      </div>

      <p className="text-sm">
        新しいアドレスに届くリンクで変更を確定します。確定するまでは、現在のアドレスを使います。
      </p>
      <EmailChangeForm currentEmail={user.email} />
    </main>
  );
}
