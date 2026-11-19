import Link from "next/link";
import {
  PUBLIC_LIST_SORTS,
  publicListSortHref,
  type PublicListSort,
} from "./publicSearch";

type Props = {
  query: URLSearchParams;
  // 今の並び順。URLの値が正しくないときは null で、どちらも選ばない
  current: PublicListSort | null;
};

// SC-10-9・D-117：検索欄の下・結果の上で並び順を切り替える。押すとすぐ読み直し、検索した条件は保つ
export function PublicListSortLinks({ query, current }: Props) {
  const sorts = Object.keys(PUBLIC_LIST_SORTS) as PublicListSort[];

  return (
    <nav
      aria-label="並び順"
      // 「よくコピーされている順」がスマホ幅でも1行に収まるよう、文字の長さに合わせて幅を分ける
      className="flex gap-1 rounded-xl border border-line bg-sunken p-1"
    >
      {sorts.map((sort) => {
        const selected = sort === current;
        return (
          <Link
            key={sort}
            href={publicListSortHref(query, sort)}
            prefetch={false}
            // 下の結果だけが変わるので、押した位置から画面を動かさない
            scroll={false}
            aria-current={selected ? "true" : undefined}
            // 選んでいる方は色だけでなく太字でも示す。押せる高さは44px（D-73）
            className={`flex min-h-11 flex-auto items-center justify-center rounded-lg px-3 text-center text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              selected
                ? "bg-brand font-bold text-white"
                : "text-muted hover:bg-brand-soft hover:text-brand-deep"
            }`}
          >
            {PUBLIC_LIST_SORTS[sort]}
          </Link>
        );
      })}
    </nav>
  );
}
