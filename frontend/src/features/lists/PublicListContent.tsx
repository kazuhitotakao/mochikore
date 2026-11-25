import type { PublicPackingListDetail } from "@/types/api";
import { RepeatBadge } from "./RepeatBadge";
import { SelectMark } from "./SelectionList";

type Item = PublicPackingListDetail["items"][number];

// SC-11-8・SC-18-6「選んで取り込む」の選ぶ表示（F-33、D-118）
export type PublicListSelection = {
  selectedIds: ReadonlySet<number>;
  // 渡した持ち物がすべて選ばれていれば外し、そうでなければまとめて選ぶ（1件のときは選ぶ・外す）
  onToggle: (itemIds: number[]) => void;
};

type Props = {
  list: PublicPackingListDetail;
  // 選んでいる間だけ渡す
  selection?: PublicListSelection;
};

/**
 * 公開リスト詳細（SC-11-2〜4）と限定公開のリスト（SC-18-2〜4、D-114）で共通の、見出しと持ち物。
 * 作成者名・チェック状態は出さない（D-32）。
 */
export function PublicListContent({ list, selection }: Props) {
  const sections = list.groups.map((group) => ({
    id: group.id,
    name: group.name,
    // D-122：コピーするとこの設定になるので、繰り返し利用のグループには印を出す。前回チェックした日は出さない
    repeat: group.check_mode === "repeat",
    items: list.items.filter((item) => item.group_id === group.id),
  }));
  const unclassified = list.items.filter((item) => item.group_id === null);

  return (
    <>
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
        <PublicItems
          items={list.items}
          indented={false}
          selection={selection}
        />
      ) : (
        <>
          {sections.map((section) => (
            <section
              key={section.id}
              aria-label={section.name}
              className="flex flex-col gap-1"
            >
              {/* D-73：SC-07と同じく、見出しを薄い緑の背景と太字にし、中の持ち物を1段右に下げる */}
              <SectionHeading
                name={section.name}
                repeat={section.repeat}
                items={section.items}
                className="bg-brand-soft"
                selection={selection}
              />
              <PublicItems
                items={section.items}
                indented
                selection={selection}
              />
            </section>
          ))}
          {unclassified.length > 0 && (
            <section aria-label="未分類" className="flex flex-col gap-1">
              {/* 名前付きグループと見分けられるよう、未分類の見出しは控えめな生成りの背景にする */}
              <SectionHeading
                name="未分類"
                items={unclassified}
                className="bg-sand"
                selection={selection}
              />
              <PublicItems
                items={unclassified}
                indented
                selection={selection}
              />
            </section>
          )}
        </>
      )}
    </>
  );
}

function SectionHeading({
  name,
  repeat = false,
  items,
  className,
  selection,
}: {
  name: string;
  // D-122：繰り返し利用のグループか
  repeat?: boolean;
  items: Item[];
  className: string;
  selection?: PublicListSelection;
}) {
  const count = (
    <>
      <span className="text-sm font-normal whitespace-nowrap text-muted">
        （{items.length}件）
      </span>
      {repeat && (
        <>
          {/* 行の途中では件数との間を空け、次の行へ折り返したときは左端にそろえる */}{" "}
          <span className="inline-block align-middle">
            <RepeatBadge />
          </span>
        </>
      )}
    </>
  );

  if (!selection) {
    return (
      <h2
        className={`rounded-lg px-3 py-3 font-bold wrap-break-word ${className}`}
      >
        {name}
        {count}
      </h2>
    );
  }

  // D-118（利用者の指示）：見出し（「未分類」も）を押すと、中の持ち物をまとめて選ぶ・外す（SC-07-21と同じ）
  const ids = items.map((item) => item.id);
  const selected =
    ids.length > 0 && ids.every((id) => selection.selectedIds.has(id));
  return (
    <h2 className={`rounded-lg font-bold wrap-break-word ${className}`}>
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${name}（まとめて選ぶ）`}
        disabled={ids.length === 0}
        onClick={() => selection.onToggle(ids)}
        className="flex min-h-12 w-full items-center gap-2 px-3 text-left disabled:cursor-default"
      >
        <SelectMark selected={selected} />
        <span className="min-w-0 flex-1">
          {name}
          {count}
        </span>
      </button>
    </h2>
  );
}

function PublicItems({
  items,
  indented,
  selection,
}: {
  items: Item[];
  // グループの見出しの下に並べるときは、1段右に下げる
  indented: boolean;
  selection?: PublicListSelection;
}) {
  return (
    <ul className={`flex flex-col ${indented ? "pl-6" : ""}`}>
      {items.map((item) =>
        selection ? (
          <li key={item.id} className="border-b border-line-soft">
            <button
              type="button"
              aria-pressed={selection.selectedIds.has(item.id)}
              onClick={() => selection.onToggle([item.id])}
              className="flex min-h-12 w-full items-center gap-2 px-2 text-left"
            >
              <SelectMark selected={selection.selectedIds.has(item.id)} />
              <span className="min-w-0 flex-1 wrap-break-word">
                {item.name}
              </span>
            </button>
          </li>
        ) : (
          <li
            key={item.id}
            className="border-b border-line-soft px-2 py-3 wrap-break-word"
          >
            {item.name}
          </li>
        ),
      )}
    </ul>
  );
}
