import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { optionalUser } from "@/features/auth/optionalUser";
import { PublicListView } from "@/features/lists/PublicListView";
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
    <PublicListView
      list={list}
      copyPath={`/public/lists/${list.id}/copy`}
      importPath={`/public/lists/${list.id}/items/import`}
      loggedIn={user !== null}
      emailVerified={Boolean(user?.email_verified_at)}
      before={<BackLink href={publicListBackHref(params.from)} />}
      after={<ReportListDialog listId={list.id} />}
    />
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
