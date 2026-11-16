import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
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
      <main className="flex flex-col gap-6 pt-8 pb-40">
        <BackLink href={publicListBackHref(params.from)} />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-medium wrap-break-word">{list.title}</h1>
          <p>
            <span className="tag">{list.category.name}</span>
          </p>
          {list.description && (
            <p className="whitespace-pre-wrap wrap-break-word">
              {list.description}
            </p>
          )}
        </div>
        {/* D-61・95：作成者の非表示設定と切り離し、チェック済みも名前だけで表示する */}
        {list.groups.length === 0 ? (
          <PublicItems items={list.items} indented={false} />
        ) : (
          <>
            {sections.map((section) => (
              <section
                key={section.id}
                aria-label={section.name}
                className="flex flex-col gap-1"
              >
                {/* D-73：SC-07と同じく、見出しを薄い緑の背景と太字にし、中の持ち物を1段右に下げる */}
                <h2 className="rounded-lg bg-brand-soft px-3 py-3 font-bold wrap-break-word">
                  {section.name}
                  <span className="text-sm font-normal whitespace-nowrap text-muted">
                    （{section.items.length}件）
                  </span>
                </h2>
                <PublicItems items={section.items} indented />
              </section>
            ))}
            {unclassified.length > 0 && (
              <section aria-label="未分類" className="flex flex-col gap-1">
                {/* 名前付きグループと見分けられるよう、未分類の見出しは控えめな生成りの背景にする */}
                <h2 className="rounded-lg bg-sand px-3 py-3 font-bold">
                  未分類
                  <span className="text-sm font-normal whitespace-nowrap text-muted">
                    （{unclassified.length}件）
                  </span>
                </h2>
                <PublicItems items={unclassified} indented />
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

function PublicItems({
  items,
  indented,
}: {
  items: PublicPackingListDetail["items"];
  // グループの見出しの下に並べるときは、1段右に下げる
  indented: boolean;
}) {
  return (
    <ul className={`flex flex-col ${indented ? "pl-6" : ""}`}>
      {items.map((item) => (
        <li
          key={item.id}
          className="border-b border-line-soft px-2 py-3 wrap-break-word"
        >
          {item.name}
        </li>
      ))}
    </ul>
  );
}
