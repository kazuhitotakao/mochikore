// 06_API詳細の項目名のまま（snake_case）で扱う（D-55）

export type User = {
  id: number;
  email: string;
  email_verified_at: string | null;
  pending_email: string | null;
};

// API-01・02 の Laravel の応答。token は Next.js のサーバーだけが受け取る（D-72）
export type AuthTokenResponse = {
  data: {
    token: string;
    user: User;
  };
};

// API-18。表示順（その他が最後）で返る
export type Category = {
  id: number;
  name: string;
  example: string;
};

// リストの中に入れて返すカテゴリー
export type CategorySummary = {
  id: number;
  name: string;
};

// API-05 自分のリスト一覧の1行（D-63）
export type PackingListSummary = {
  id: number;
  title: string;
  description: string | null;
  category: CategorySummary;
  items_count: number;
  is_public: boolean;
  updated_at: string;
};

// API-15。公開一覧では作成者・件数・本人のチェックを扱わない（D-63）
export type PublicPackingListSummary = {
  id: number;
  title: string;
  description: string | null;
  category: CategorySummary;
  created_at: string;
};

export type PaginatedResponse<T> = {
  data: T[];
  links: {
    first: string;
    last: string;
    prev: string | null;
    next: string | null;
  };
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
};

// リスト本体。API-06・08 の応答（D-67）
export type PackingList = {
  id: number;
  title: string;
  description: string | null;
  category: CategorySummary;
  is_public: boolean;
  moderated_at: string | null;
  updated_at: string;
};

export type PackingListGroup = {
  id: number;
  name: string;
  sort_order: number;
};

export type PackingListItem = {
  id: number;
  name: string;
  // null は未分類（D-56）
  group_id: number | null;
  sort_order: number;
  is_checked: boolean;
};

// API-16：チェック状態を型にも含めず、公開画面から編集操作へ渡さない
export type PublicPackingListDetail = PublicPackingListSummary & {
  groups: PackingListGroup[];
  items: Omit<PackingListItem, "is_checked">[];
};

// よく使う項目1件。API-31・32 で同じ形（D-66・D-72）
export type SavedItem = {
  id: number;
  name: string;
  category: CategorySummary;
};

// よく使うグループ1件。API-39・40 で同じ形（D-102）
export type SavedGroup = {
  id: number;
  name: string;
  category: CategorySummary;
};

// API-29 グループ整理用の最新状態。よく使う項目の選択（SC-08）では grouping_revision を使う。
// category は、グループ整理（SC-09）がこのリストのカテゴリーのよく使うグループを読むときに使う（D-102）
export type GroupingState = {
  grouping_revision: number;
  category: CategorySummary;
  groups: PackingListGroup[];
  items: PackingListItem[];
};

// API-30 グループ整理の保存結果。group_key_map は下書きの key → 保存後のグループID
export type GroupingSaveResult = GroupingState & {
  group_key_map: Record<string, number>;
};

// API-34 一括追加の結果。追加した持ち物は選んだ順
export type BulkAddResult = {
  grouping_revision: number;
  items: PackingListItem[];
};

// API-12 持ち物の削除。最後の1件を消すと非公開になることがある（D-51）
export type ItemDeleteResult = {
  is_public: boolean;
};

// API-07 自分のリストの内容。削除済みの持ち物は含まない
export type PackingListDetail = PackingList & {
  grouping_revision: number;
  groups: PackingListGroup[];
  items: PackingListItem[];
};

// 06_API一覧「エラーコード一覧」のうち Laravel が返す16種類と、Next.js の窓口だけが返す origin_not_allowed
export type ApiErrorCode =
  | "validation_error"
  | "email_already_registered"
  | "invalid_credentials"
  | "invalid_password"
  | "list_limit_reached"
  | "saved_item_limit_reached"
  | "saved_group_limit_reached"
  | "list_has_no_items"
  | "link_invalid"
  | "unauthenticated"
  | "email_not_verified"
  | "list_moderated"
  | "not_found"
  | "too_many_requests"
  | "server_error"
  | "grouping_conflict"
  | "origin_not_allowed";

export type ApiErrorBody = {
  message: string;
  code: ApiErrorCode;
  errors?: Record<string, string[]>;
  retry_after?: number;
};
