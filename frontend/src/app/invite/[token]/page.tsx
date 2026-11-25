import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { readAsUser, requireUser } from "@/features/auth/requireUser";
import { JoinInvitation } from "@/features/lists/JoinInvitation";
import type { Invitation } from "@/types/api";

// SC-19-1・D-119：招待された人だけに見せるので、検索エンジンに載せない
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// SC-19 共同編集への招待（F-34、D-119）。招待リンクを開いた人が、内容を見てから参加する
export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;
  // URLの値をそのまま Laravel のパスへ入れないよう、32文字の英数字だけを通す
  if (!/^[A-Za-z0-9]{32}$/.test(token)) notFound();

  const currentPath = `/invite/${token}`;
  // ログイン前は SC-02 へ移り、ログイン後はこの画面へ戻る。メール未認証は SC-04 へ（共通7・8）。
  // 止めた・期限切れのリンクは「ページが見つかりません」（共通9）
  const [user, invitation] = await Promise.all([
    requireUser(currentPath),
    readAsUser<Invitation>(`/invites/${token}`, currentPath),
  ]);

  // 所有者・参加済みの人は、そのままリストの内容（SC-07）を開く
  if (invitation.status === "owner" || invitation.status === "member") {
    redirect(`/lists/${invitation.list.id}`);
  }

  return (
    <main className="flex flex-col gap-6 py-8">
      <h1 className="text-2xl font-medium">リストへの招待</h1>
      <JoinInvitation
        token={token}
        invitation={invitation}
        displayName={user.display_name}
      />
    </main>
  );
}
