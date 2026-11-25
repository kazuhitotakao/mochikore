import { Icon } from "@/components/Icon";

/**
 * D-119：共同編集のリスト（メンバーがいる、または自分がメンバーとして参加している）に付ける「共同編集」の印。
 * 自分のリスト一覧（SC-05）とリストの内容（SC-07）で、「公開中」（PublicBadge）と同じ見た目にする。
 */
export function CollaborativeBadge() {
  return (
    <span className="tag gap-1">
      <Icon name="people" className="size-3.5" />
      共同編集
    </span>
  );
}
