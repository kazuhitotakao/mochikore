import Link from "next/link";
import { redirect } from "next/navigation";
import { EmailChangeResult } from "@/features/auth/EmailChangeResult";
import { readEmailChangeLink } from "@/features/auth/emailChangeLink";
import { requireUser } from "@/features/auth/requireUser";

export default async function EmailChangePage(
  props: PageProps<"/account/email">,
) {
  const searchParams = await props.searchParams;
  const { link, hasLink, currentPath } = readEmailChangeLink(searchParams);
  const user = await requireUser(currentPath);
  if (!user.email_verified_at) redirect("/verify-email");
  if (!hasLink && !user.pending_email) redirect("/account");

  return (
    <main className="flex flex-col gap-6 py-8">
      <h1 className="text-2xl font-bold">メールを確認してください</h1>
      <EmailChangeResult
        key={currentPath}
        currentEmail={user.email}
        pendingEmail={user.pending_email}
        link={link}
        hasLink={hasLink}
        currentPath={currentPath}
        initialWaitSeconds={searchParams.sent === "1" ? 60 : 0}
      />
      <Link href="/account" prefetch={false} className="underline">
        アカウント設定へ戻る
      </Link>
    </main>
  );
}
