import Link from "next/link";
import { redirect } from "next/navigation";
import { BackLink } from "@/components/BackLink";
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
      {/* 共通2：SC-13はSC-12から進む画面なので、SC-12へ戻る */}
      <BackLink href="/account" />
      <h1 className="text-2xl font-medium">メールを確認してください</h1>
      <EmailChangeResult
        key={currentPath}
        currentEmail={user.email}
        pendingEmail={user.pending_email}
        link={link}
        hasLink={hasLink}
        currentPath={currentPath}
        initialWaitSeconds={searchParams.sent === "1" ? 60 : 0}
      />
      <Link
        href="/account"
        prefetch={false}
        className="self-start text-link tap-target"
      >
        アカウント設定へ戻る
      </Link>
    </main>
  );
}
