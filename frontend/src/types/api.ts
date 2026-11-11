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

// API-07 自分のリストの内容。削除済みの持ち物は含まない
export type PackingListDetail = PackingList & {
  grouping_revision: number;
  groups: PackingListGroup[];
  items: PackingListItem[];
};

// 06_API一覧「エラーコード一覧」の16種類と、Next.js の窓口だけが返す origin_not_allowed
export type ApiErrorCode =
  | "validation_error"
  | "email_already_registered"
  | "invalid_credentials"
  | "invalid_password"
  | "list_limit_reached"
  | "item_limit_reached"
  | "saved_item_limit_reached"
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
