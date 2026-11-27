// 06_API詳細の項目名のまま（snake_case）で扱う（D-55）

export type User = {
  id: number;
  email: string;
  email_verified_at: string | null;
  // D-119：共同編集のメンバーに見せる表示名。会員登録で必ず入れる（D-127）
  display_name: string;
  pending_email: string | null;
};

// API-01・02 の Laravel の応答。token は Next.js のサーバーだけが受け取る（D-72）
export type AuthTokenResponse = {
  data: {
    token: string;
    user: User;
  };
};

// API-23 メール認証の結果。共同編集の招待リンクから登録した人にだけ、その招待リンクの文字を返す（D-121）
export type EmailVerificationResult = {
  invite_token: string | null;
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
  // D-119：共同編集で参加しているリストも並ぶ。is_owner は自分が所有者か、member_count は所有者を除くメンバーの数
  is_owner: boolean;
  member_count: number;
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

// D-122：グループごとのチェックの動き。normal は「通常」（チェックしたら隠す）、
// repeat は「繰り返し利用」（隠さず、前回チェックした日を出す。チェックは自動では外れず、利用者が外す）
export type GroupCheckMode = "normal" | "repeat";

export type PackingListGroup = {
  id: number;
  name: string;
  sort_order: number;
  check_mode: GroupCheckMode;
};

export type PackingListItem = {
  id: number;
  name: string;
  // null は未分類（D-56）
  group_id: number | null;
  sort_order: number;
  is_checked: boolean;
  // D-122：最後にチェックを付けた日時（UTC）。チェックしたことがなければ null。
  // 繰り返し利用のグループで「前回」として出す
  last_checked_at: string | null;
};

// API-16：チェック状態と前回チェックした日を型にも含めず、公開画面から編集操作へ渡さない。
// グループの check_mode は「繰り返し利用」の印を出すために含む（D-122）
export type PublicPackingListDetail = PublicPackingListSummary & {
  groups: PackingListGroup[];
  items: Omit<PackingListItem, "is_checked" | "last_checked_at">[];
};

// よく使う項目1件。API-31・32 で同じ形（D-66・D-72）
export type SavedItem = {
  id: number;
  name: string;
  category: CategorySummary;
};

// よく使うグループ1件。API-39・40 で同じ形（D-102）。チェックの動きも覚える（D-122）
export type SavedGroup = {
  id: number;
  name: string;
  check_mode: GroupCheckMode;
  category: CategorySummary;
};

// API-29 グループ整理用の最新状態。よく使う項目の選択（SC-08）では grouping_revision を使う。
// category は、グループ整理（SC-09）がこのリストのカテゴリーのよく使うグループを読むときに使う（D-102）
export type GroupingState = {
  grouping_revision: number;
  // F-35・D-119：共同編集のリストか（所有者でない・メンバーがいる）を見分ける。API-05・07 と同じ項目
  is_owner: boolean;
  member_count: number;
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

// API-45 持ち物を重ねてグループにした結果（D-111）。重ねた持ち物は group に入り、重ねられた持ち物は見出しに変わった
export type GroupFromItemResult = {
  group: PackingListGroup;
  item: PackingListItem;
};

// API-64 重ねてグループにしたのを元に戻した結果（D-123）。restored は見出しに変わっていた持ち物、
// item は重ねた持ち物（元の所属に戻った）
export type GroupFromItemUndoResult = {
  restored: PackingListItem;
  item: PackingListItem;
};

// API-12 持ち物の削除。最後の1件を消すと非公開になることがある（D-51）
export type ItemDeleteResult = {
  is_public: boolean;
};

// API-53・54 公開リスト・限定公開のリストから取り込んだ結果（D-118）。元のリストの情報は返らない（D-32）
export type ItemImportResult = {
  list: { id: number; title: string };
  count: number;
};

// API-51・52 選んだ持ち物を別のリストへコピー・移動した結果（D-118）。is_public は元のリストの公開状態（D-51）
export type ItemTransferResult = ItemImportResult & {
  is_public: boolean;
};

// API-07 自分のリストの内容。削除済みの持ち物は含まない
export type PackingListDetail = PackingList & {
  grouping_revision: number;
  // D-114：限定公開のリンク（32文字の英数字）。本人用の取得にだけ含め、なければ null
  share_token: string | null;
  // D-119：is_owner は自分が所有者か、member_count は所有者を除く共同編集のメンバーの数。
  // 招待リンク（32文字の英数字）と期限は所有者にだけ、期限内のものを返す
  is_owner: boolean;
  member_count: number;
  invite_token: string | null;
  invite_expires_at: string | null;
  // D-106：空グループのチェックは本人用の取得にだけ含める。
  groups: (PackingListGroup & { is_checked: boolean })[];
  items: PackingListItem[];
};

// API-63 チャンネルの認可（D-119・F-35）。pusher-js へそのまま渡す署名
export type RealtimeAuth = {
  auth: string;
};

// API-56 共同編集の招待リンク（D-119）
export type InviteLink = {
  invite_token: string;
  invite_expires_at: string;
};

// API-58 共同編集の所有者とメンバー（D-119）。見せるのは表示名だけで、メールアドレスは返らない
export type ListMembers = {
  owner: { display_name: string; is_me: boolean };
  members: {
    // メンバーを外すとき（API-59）に使う番号
    id: number;
    display_name: string;
    joined_at: string;
    is_me: boolean;
  }[];
};

// API-61 招待リンクを開いた人に見せる内容（D-119）。member_count は所有者を除くメンバーの数
export type Invitation = {
  list: { id: number; title: string };
  owner_display_name: string;
  member_count: number;
  status: "joinable" | "member" | "owner" | "full";
};

// API-62 参加した結果（D-119）
export type InvitationJoinResult = {
  list: { id: number; title: string };
};

// API-65〜68 まとめ表示（D-124）。本人だけのもの。lists は今見られるリストだけが選んだ順で届く。
// リストの中身は API-07 でリストごとに読む
export type CombinedView = {
  id: number;
  name: string;
  lists: { id: number; title: string }[];
  updated_at: string;
};

// 06_API一覧「エラーコード一覧」のうち Laravel が返す22種類と、Next.js の窓口だけが返す origin_not_allowed
export type ApiErrorCode =
  | "validation_error"
  | "email_already_registered"
  | "invalid_credentials"
  | "invalid_password"
  | "list_limit_reached"
  | "saved_item_limit_reached"
  | "saved_group_limit_reached"
  | "item_limit_reached"
  | "list_has_no_items"
  | "list_collaborative"
  | "list_not_private"
  | "member_limit_reached"
  | "joined_list_limit_reached"
  | "combined_view_limit_reached"
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
