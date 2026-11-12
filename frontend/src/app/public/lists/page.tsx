import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { optionalUser } from "@/features/auth/optionalUser";
import { trimLikeLaravel } from "@/features/auth/validation";
import { PublicListSearch } from "@/features/lists/PublicListSearch";
import { publicListHref, publicListQuery } from "@/features/lists/publicSearch";
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
      <header className="flex items-center justify-between gap-3 py-4">
        <Link
          href={user ? "/lists" : "/"}
          prefetch={false}
          className="font-bold"
        >
          もちこれ
        </Link>
        <nav aria-label="メインメニュー" className="flex gap-3 text-sm">
          <Link
            href="/public/lists"
            prefetch={false}
            aria-current="page"
            className="underline"
          >
            公開リスト
          </Link>
          <Link
            href={user ? "/account" : "/login"}
            prefetch={false}
            className="underline"
          >
            {user ? "アカウント" : "ログイン"}
          </Link>
        </nav>
      </header>
      <main className="flex flex-col gap-6 py-4">
        <BackLink href={user ? "/lists" : "/"} />
        <h1 className="text-2xl font-bold">公開リスト</h1>
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
              <ul aria-label="検索結果" className="flex flex-col gap-2">
                {result.data.map((list) => (
                  <li
                    key={list.id}
                    className="flex flex-col gap-1 rounded border border-zinc-300 px-4 py-3"
                  >
                    <h2 className="font-medium wrap-break-word">
                      {list.title}
                    </h2>
                    {list.description && (
                      <p className="line-clamp-2 text-sm text-zinc-600">
                        {list.description}
                      </p>
                    )}
                    <p className="text-sm text-zinc-600">
                      {list.category.name}
                    </p>
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
                  className="rounded border border-zinc-400 px-3 py-2"
                >
                  前へ
                </Link>
              ) : (
                <span className="px-3 py-2 text-zinc-400">前へ</span>
              )}
              <span>
                {result.meta.current_page} / {result.meta.last_page}ページ
              </span>
              {result.meta.current_page < result.meta.last_page ? (
                <Link
                  href={publicListHref(query, result.meta.current_page + 1)}
                  prefetch={false}
                  className="rounded border border-zinc-400 px-3 py-2"
                >
                  次へ
                </Link>
              ) : (
                <span className="px-3 py-2 text-zinc-400">次へ</span>
              )}
            </nav>
          </>
        )}
      </main>
    </>
  );
}
