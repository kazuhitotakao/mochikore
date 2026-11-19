import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { optionalUser } from "@/features/auth/optionalUser";
import { CopyPublicListButton } from "@/features/lists/CopyPublicListButton";
import { PublicListContent } from "@/features/lists/PublicListContent";
import { publicListBackHref } from "@/features/lists/publicSearch";
import { ReportListDialog } from "@/features/lists/ReportListDialog";
import { ApiError } from "@/lib/api/errors";
import { serverApi } from "@/lib/api/server";
import type { PublicPackingListDetail } from "@/types/api";

export default async function PublicListPage(
  props: PageProps<"/public/lists/[listId]">,
) {
  const { listId } = await props.params;
  if (!/^[1-9][0-9]*$/.test(listId)) notFound();
  const params = await props.searchParams;
  const [list, user] = await Promise.all([
    readPublicList(listId),
    optionalUser(),
  ]);

  return (
    <>
      <main className="flex flex-col gap-6 pt-8 pb-40">
        <BackLink href={publicListBackHref(params.from)} />
        <PublicListContent list={list} />
        <ReportListDialog listId={list.id} />
      </main>
      <CopyPublicListButton
        copyPath={`/public/lists/${list.id}/copy`}
        loggedIn={user !== null}
        emailVerified={Boolean(user?.email_verified_at)}
      />
    </>
  );
}

async function readPublicList(id: string): Promise<PublicPackingListDetail> {
  try {
    return await serverApi<PublicPackingListDetail>(`/public/lists/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.code === "not_found") notFound();
    throw error;
  }
}
