import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { optionalUser } from "@/features/auth/optionalUser";
import { PublicListView } from "@/features/lists/PublicListView";
import { ApiError } from "@/lib/api/errors";
import { serverApi } from "@/lib/api/server";
import type { PublicPackingListDetail } from "@/types/api";

// SC-18-1・D-114：リンクを知っている人だけに見せるので、検索エンジンに載せない
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// SC-18 限定公開のリスト（F-29、D-114）。リンクを知っている人は、ログインなしで見られる
export default async function SharedListPage(
  props: PageProps<"/shared/[token]">,
) {
  const { token } = await props.params;
  // URLの値をそのまま Laravel のパスへ入れないよう、32文字の英数字だけを通す
  if (!/^[A-Za-z0-9]{32}$/.test(token)) notFound();
  const [list, user] = await Promise.all([
    readSharedList(token),
    optionalUser(),
  ]);

  // 共通2：リンクから直接開くので「←」は置かない。公開一覧には出さないので「通報する」も置かない（D-114）
  return (
    <PublicListView
      list={list}
      copyPath={`/shared/lists/${token}/copy`}
      importPath={`/shared/lists/${token}/items/import`}
      loggedIn={user !== null}
      emailVerified={Boolean(user?.email_verified_at)}
    />
  );
}

// API-48：止めたリンク・運営が非公開にしたリストは「ページが見つかりません」（共通9、D-43・D-48）
async function readSharedList(token: string): Promise<PublicPackingListDetail> {
  try {
    return await serverApi<PublicPackingListDetail>(`/shared/lists/${token}`);
  } catch (error) {
    if (error instanceof ApiError && error.code === "not_found") notFound();
    throw error;
  }
}
