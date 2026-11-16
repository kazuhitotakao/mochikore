import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { optionalUser } from "@/features/auth/optionalUser";
import { trimLikeLaravel } from "@/features/auth/validation";
import { PublicListSearch } from "@/features/lists/PublicListSearch";
import {
  publicListDetailHref,
  publicListHref,
  publicListQuery,
} from "@/features/lists/publicSearch";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api/errors";
import { serverApi } from "@/lib/api/server";
import type {
  Category,
  PaginatedResponse,
  PublicPackingListSummary,
} from "@/types/api";

export default async function PublicListsPage(
  props: PageProps<"/public/lists">,
) {
  const params = await props.searchParams;
  const query = publicListQuery(params);
  const user = await optionalUser();
  const [categoryRead, listRead] = await Promise.allSettled([
    serverApi<Category[]>("/categories"),
    serverApi<PaginatedResponse<PublicPackingListSummary>>(
      `/public/lists${query.size ? `?${query}` : ""}`,
      { includePagination: true },
    ),
  ]);
  const categories =
    categoryRead.status === "fulfilled" ? categoryRead.value : [];
  const result = listRead.status === "fulfilled" ? listRead.value : undefined;
  let failure: ApiError | undefined;

  for (const response of [categoryRead, listRead]) {
    if (response.status === "rejected") {
      if (!(response.reason instanceof ApiError)) throw response.reason;
      failure ??= response.reason;
    }
  }

  const serverErrors =
    failure?.code === "validation_error" ? failure.errors : {};
  const serverMessage =
    failure && failure.code !== "validation_error"
      ? NETWORK_ERROR_MESSAGE
      : null;
  const keyword = Array.isArray(params.keyword)
    ? (params.keyword.at(-1) ?? "")
    : (params.keyword ?? "");
  const rawCategory = Array.isArray(params.category_id)
    ? params.category_id.at(-1)
    : params.category_id;
  const selectedCategory = trimLikeLaravel(rawCategory ?? "");
  // D-81：APIには元のURLを渡す。不正なIDで開いた後は、入力欄の「すべて」で条件を解除できるようにする
  const category =
    categoryRead.status === "rejected" ||
    categories.some((entry) => String(entry.id) === selectedCategory)
      ? selectedCategory
      : "";

  return (
    <>
      <main className="flex flex-col gap-6 py-8">
        <BackLink href={user ? "/lists" : "/"} />
        <h1 className="text-2xl font-medium">公開リスト</h1>
        <PublicListSearch
          key={
            query.toString() +
            JSON.stringify(serverErrors) +
            (failure?.code ?? "ok")
          }
          categories={categories}
          initialKeyword={keyword}
          initialCategory={category}
          serverErrors={serverErrors}
          serverMessage={serverMessage}
        />
        {result && !failure && (
          <>
            {result.data.length === 0 ? (
              <p>見つかりませんでした。</p>
            ) : (
              <ul aria-label="検索結果" className="flex flex-col gap-3">
                {result.data.map((list) => (
                  <li key={list.id}>
                    <Link
                      href={publicListDetailHref(list.id, query)}
                      prefetch={false}
                      className="card flex flex-col gap-1 px-4 py-3 hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      <h2 className="font-medium wrap-break-word">
                        {list.title}
                      </h2>
                      {list.description && (
                        <p className="line-clamp-2 text-sm text-muted">
                          {list.description}
                        </p>
                      )}
                      <p className="mt-1">
                        <span className="tag">{list.category.name}</span>
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <nav
              aria-label="ページ移動"
              className="flex items-center justify-between gap-3"
            >
              {result.meta.current_page > 1 ? (
                <Link
                  href={publicListHref(query, result.meta.current_page - 1)}
                  prefetch={false}
                  className="btn-outline px-4"
                >
                  前へ
                </Link>
              ) : (
                <span className="px-4 py-2 text-faint">前へ</span>
              )}
              <span className="text-sm text-muted">
                {result.meta.current_page} / {result.meta.last_page}ページ
              </span>
              {result.meta.current_page < result.meta.last_page ? (
                <Link
                  href={publicListHref(query, result.meta.current_page + 1)}
                  prefetch={false}
                  className="btn-outline px-4"
                >
                  次へ
                </Link>
              ) : (
                <span className="px-4 py-2 text-faint">次へ</span>
              )}
            </nav>
          </>
        )}
      </main>
    </>
  );
}
