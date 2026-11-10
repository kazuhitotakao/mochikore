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
