import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { PublicHeader } from "@/components/PublicHeader";
import { optionalUser } from "@/features/auth/optionalUser";
import { CopyPublicListButton } from "@/features/lists/CopyPublicListButton";
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
  const sections = list.groups.map((group) => ({
    id: group.id,
    name: group.name,
    items: list.items.filter((item) => item.group_id === group.id),
  }));
  const unclassified = list.items.filter((item) => item.group_id === null);

  return (
    <>
      <PublicHeader user={user} />
      <main className="flex flex-col gap-6 pt-4 pb-40">
        <BackLink href={publicListBackHref(params.from)} />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold wrap-break-word">{list.title}</h1>
          <p className="text-sm text-zinc-600">{list.category.name}</p>
          {list.description && (
            <p className="whitespace-pre-wrap wrap-break-word">
              {list.description}
            </p>
          )}
        </div>
        {/* D-61・95：作成者の非表示設定と切り離し、チェック済みも名前だけで表示する */}
        {list.groups.length === 0 ? (
          <PublicItems items={list.items} />
        ) : (
          <>
            {sections.map((section) => (
              <section
                key={section.id}
                aria-label={section.name}
                className="flex flex-col gap-1"
              >
                <h2 className="font-medium wrap-break-word">
                  {section.name}（{section.items.length}件）
                </h2>
                <PublicItems items={section.items} />
              </section>
            ))}
            {unclassified.length > 0 && (
              <section aria-label="未分類" className="flex flex-col gap-1">
                <h2 className="font-medium">
                  未分類（{unclassified.length}件）
                </h2>
                <PublicItems items={unclassified} />
              </section>
            )}
          </>
        )}
        <ReportListDialog listId={list.id} />
      </main>
      <CopyPublicListButton
        listId={list.id}
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

function PublicItems({ items }: { items: PublicPackingListDetail["items"] }) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li
          key={item.id}
          className="border-b border-zinc-200 px-2 py-3 wrap-break-word"
        >
          {item.name}
        </li>
      ))}
    </ul>
  );
}
