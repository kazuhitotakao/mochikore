import { Icon } from "@/components/Icon";

/**
 * D-73（利用者の指示）：公開しているリストにだけ付ける「公開中」の印。自分のリスト一覧（SC-05）と
 * リストの内容（SC-07）で同じ見た目にする。非公開はふつうの状態なので、印を出さない。
 */
export function PublicBadge() {
  return (
    <span className="tag gap-1">
      <Icon name="public" className="size-3.5" />
      公開中
    </span>
  );
}
