# backend（Laravel 13 / PHP 8.4 / MySQL 8.4）

全体のルールはルートの `CLAUDE.md`、理由と例は `docs/開発規約.md` の第2章を見る。
Laravel Boost などの新しいパッケージは、確認してから入れる。

## 役割の分け方

| 場所 | 書くこと | 書かないこと |
|---|---|---|
| FormRequest | 入力の形・長さ | 件数の上限、本人確認 |
| Controller | 認可 → 処理の呼び出し → 応答 | 業務ルール、トランザクション |
| Service | ロック、上限、`grouping_revision`、複数テーブルの更新 | Request・Response |
| Policy | 本人のもの・共同編集のメンバーかの判定 | 入力チェック |
| Model | リレーション、型変換 | 業務の手順 |
| Resource | 返す項目 | 取得処理 |

- Service は必要なときだけ作る。単純な1件の取得・更新は Controller から Model を直接使う。
- Repository 層は作らない。
- 追加してよいディレクトリは `app/Enums`、`app/Services`、`app/Exceptions` だけ。

## 入力と応答

- `$request->all()` を使わず、`validated()` だけを渡す。
- FormRequest の `authorize()` は `true` のまま。認可は Controller の `Gate::authorize()` で行う。
- 入力条件は `09_バリデーション` の対象行・J列のセルメモ・共通C-01〜08、送受信の形は `06_API詳細` に合わせる。API-11 で `group_id` を受け取らない。
- 入力エラーの文言は `lang/ja/validation.php` に日本語で用意する。
- 応答は Resource で返し、Model をそのまま返さない。公開用は別の Resource にする。
- 公開APIに作成者の情報と `is_checked`・`last_checked_at` を返さない（F-09・F-10・D-122）。限定公開のリンク（API-48）も同じ。グループの `check_mode` は「繰り返し利用」の印のために返す。`share_token` は本人用の API-07 だけに返す（D-114）。
- 共同編集（D-119）：`share_token`・`invite_token` は所有者にだけ返す。メンバーどうしには表示名（`display_name`）だけを返し、メールアドレス・利用者のIDを返さない。表示名は公開APIに返さない（D-32）。
- 招待リンクから会員登録した人の招待（`users.pending_invite_token`、D-121）は、本人の情報（UserResource）に返さない。メール認証（API-23）が済んだときに1回だけ返して消し、その招待が今も使えるときだけ返す。会員登録（API-01）では、招待が使えるかを確かめない（登録を止めない）。
- 項目名は snake_case のまま（D-55）。返すものがなければ `response()->noContent()`（D-62）。
- Resource の `data`・`links`・`meta` の形は変えない（D-53）。

## エラー

- エラーは必ず `message` と `code` を返す。22種類のコードは `App\Enums\ApiErrorCode` にまとめ、`App\Exceptions\ApiException` で返す。
- 標準の例外は `bootstrap/app.php` で変換する：入力エラー 422 `validation_error`、未ログイン 401 `unauthenticated`、回数制限 429 `too_many_requests` と `retry_after`、署名付きリンクの403 は 422 `link_invalid`、想定外 500 `server_error`（詳細は返さない）。
- メール未認証の403は、標準の `verified` ではなく ApiException を投げる自作ミドルウェアで返す。

## 権限

- 権限は Laravel で判定する。画面で隠すだけにしない。
- 他人のリストと存在しないリストは同じ 404 にする（D-43）。Policy では `Response::denyAsNotFound()` を使う。
- 共同編集（D-119）：中身（持ち物・グループ）の操作は `editContents`、内容を見る・複製するのは `view` で、所有者とメンバーに許す。リストそのものの操作（API-08・公開・リンクで共有・招待・メンバーを外す）は `update`、削除は `delete` で、所有者だけに許す。メンバーが所有者だけの操作を呼んだときも 404。
- 共同編集中（メンバーがいる・有効な招待リンクがある）のリストは公開・リンクで共有させず、公開中・リンクで共有中のリストは招待させない。どちらも親リストをロックしてから確かめる（D-119）。
- 持ち物を足す回数（D-97）は、`$list->user_id` ではなく操作した本人で数える（D-119）。
- まとめ表示（`combined_views`、D-124）は本人だけのもの。API-65〜69 は `CombinedViewPolicy` の `manage` で本人に限り、ほかの人（同じリストのメンバー・所有者を含む）は 404。入れられるのは本人が見られるリスト（所有者かメンバー）だけで、見られないリストは存在を区別しない同じ 422 にする。中身の操作は今までのリストのAPIとリストごとの権限で行い、まとめ表示用の持ち物のAPIは作らない。共同編集から外された・抜けたとき（API-59・60）は `CombinedViewService::forgetList` で本人のまとめ表示から外し、読むときも `accessibleBy` で絞る。リストのAPI・配信にまとめ表示の情報を入れず、まとめ表示のルートに `NotifyListChange` を付けない。

## 共同編集の配信（F-35・D-119）

- 配信するのは「変わった」という合図だけ。持ち物の名前などの中身を配信に載せない。画面は API-07・29 で読み直す。
- 配信は `App\Services\ListChangeNotifier` から行う（`app/Events` は作らない）。キューは使わず、保存の後にその場で送る。失敗しても保存は成功のままにし、例外は `report()` する。
- リストの中身・リストそのもの・メンバーを変えるルートを足したら、`routes/api.php` で `NotifyListChange` を付ける。メンバーがいるリストだけに配信し、操作した本人（`X-Socket-ID`）は配信先から外す。読むだけのルートと、元のリストを変えない複製には付けない。
- チャンネルの認可は API-63（`/api/realtime/auth`）だけ。Laravel 標準の `/broadcasting/auth`（`Broadcast::routes()`・`withBroadcasting()`）は置かない。聞けるのは所有者とメンバーだけで、それ以外は 404。
- テストは配信先が `null`（`phpunit.xml`）。配信の呼び出しは `ListChangeNotifier` を差し替えて確かめ、実際の Reverb へは送らない。

## Eloquent

- Model の設定は `#[Fillable]` など、生成時と同じ書き方にする。
- 一覧は `with()`・`withCount()` で読み、N+1 を防ぐ。開発中は `Model::preventLazyLoading()` を有効にする。
- `$touches` を使わない。親の更新は Service で明示する（D-25。チェックだけでは親の日時を変えない）。
- 持ち物の構造を変える処理（追加・削除・復元・並べ替え・グループ変更）は、親リストを `lockForUpdate()` してトランザクション内で行い、`grouping_revision` を増やす（D-59）。グループ名の変更（API-44）もグループ変更として増やす（D-109）。チェックと持ち物の名前変更では増やさない。
- API-25 のルートには `withTrashed()` を付ける。重ねてグループにしたのを元に戻す API-64 も、URL の持ち物（見出しに変わった持ち物）が一時削除中なので付ける（D-123）。API-64 は、重ねた直後のまま（グループの名前・中の持ち物・元のグループ）のときだけ戻し、そうでなければ何も変えない。戻して増える1件は、追加の回数（D-97）に数えない。
- グループのチェックの動き（`check_mode`、`App\Enums\GroupCheckMode`、D-122）：`repeat`（繰り返し利用）のグループのチェックも、自動では外さない（日付が変わっても、読むとき・所属や設定を変えるときも外さない）。外すのは利用者の操作だけ。
- チェックを付けた日時（`last_checked_at`）は、付けたときだけ記録し、外しても残す。付けてから1分以内（`PackingListItem::CHECK_CORRECTION_SECONDS`）に1件ずつ（API-11）外したときだけ、押し間違いとして `previous_checked_at` へ戻す。経過はサーバーの時刻で数える（共同編集でも同じ）。まとめて外す API-37（見出しのチェック・SC-07-25 の「チェックを外す」）と API-13（チェックを全部外す）は、時間に関係なく残す（D-122）。グループの設定の変更は、グループの変更として `grouping_revision` を増やす。
- 上限値は Model の定数にまとめる（例：`PackingList::MAX_PER_USER`）。
- キーワード検索では `%` と `_` をエスケープする。

## 認証トークン（Sanctum）

- 初期版ではトークンを更新しない（D-74）。
- トークンの発行は1か所にまとめ、`first_login_at` と `last_activity_at` を同時に設定する。会員登録（API-01）とログイン（API-02）の両方で使う（D-78）。
- 期限は `last_activity_at`（180日）と `first_login_at`（1年＝365日）で判定する。`last_used_at` は判定に使わない（D-36）。
- 判定は `AppServiceProvider` の `Sanctum::authenticateAccessTokensUsing`（`App\Services\TokenLifetime`）で行う。`expires_at`・`sanctum.expiration` を使うと二重の判定になるので設定しない。
- `last_activity_at` は `X-User-Activity` があるときだけ更新する。
- 失効させるトークン：ログアウトは現在の分、パスワード再設定・退会・未認証アカウントの削除は本人のすべて、メール変更の確定は現在以外のすべて。期限切れは1日1回の定期処理で削除する。
- 転送ヘッダーのIPをそのまま信用しない。転送元（TrustProxies）は信頼せず、Next.jsが合言葉（`NEXTJS_PROXY_KEY`）付きで渡した利用者のIPだけを `UseClientIpFromNextJs` で使う（D-41）。

## 管理コマンド

- `users:revoke-tokens 利用者ID` は、指定した本人の全トークンを無効にする（D-78）。`lists:moderate リストID` は、運営による非公開を設定する（D-48）。対象IDと用途を混同せず、通報から自動実行しない。
- ログイン情報の無効化は、トークン発行と同じ本人のロックとトランザクションで行う。先に発行が始まった情報も含めて削除し、対象以外の利用者には影響させない。
- D-78の操作後は次の通信で401になり、正しい認証情報で再ログインできる。本人情報・リスト・公開状態・保存候補・再設定情報は変更しない。
- 正常終了時は対象IDと削除件数だけを表示し、0件でも成功とする。ID不正・対象不在・処理失敗は失敗終了とし、トークン・パスワード・例外のSQLを出力しない。
- 動作確認はテストDBと専用の確認用データで行う。本番での実行はルートの確認ルールに従う。

## 定期処理

- 日次処理は `routes/console.php` に登録し、`withoutOverlapping()` で同じ処理の重複起動を防ぐ。Command は Service を呼び、業務処理は Service に置く。
- 未認証アカウント・削除済みの持ち物・期限切れログイン情報は `maintenance:cleanup`、未確認通報の通知は `reports:notify` を使う（D-35・44・47・78）。
- 未認証アカウントの削除は、メール認証・トークン発行・再設定情報の作成と同じ本人のロックで直列にする。ロック後に削除条件を確かめ直し、外部キーのない認証情報も同じトランザクションで消す（D-44・52）。
- 削除済み持ち物の完全削除は、復元と同じ親リストのロックを取って削除条件を確かめ直す。保管データの整理では親の `updated_at`・`grouping_revision` を変えない（D-35・59）。
- 期限の境界や競合は `mochikore_test` で確認する。通常の開発データに日次削除を直接実行してテストしない。
- `schedule:list` は登録の確認だけ。開発用の `schedule:work` と、本番の定期起動・実メール配信の確認は手順書第16・17章に従い、実施状況を分けて報告する。

## Migration

- `users` に `name` はない（D-32）。登録・Factory・Seeder・Resource で名前を扱わない。共同編集の表示名は `display_name`（D-119）で、会員登録（API-01）で必ず受け取る（NOT NULL、D-127）。招待・参加（API-56・62）では受け取らない。
- 写真（D-128）は `user_avatars`（`user_id` が主キー、`image` は BLOB）に持ち、`users` に入れない（ログインのたびに読むため）。画像は作り直さず、中身が256px四方のJPEG・60KBまでかだけを確かめる（V-32）。PHP の GD などの画像の拡張は入れていない。
- アプリの時刻は `Asia/Tokyo`。MySQL は UTC のままなので、日時は Laravel の `now()` で入れる。`useCurrent()`・`CURRENT_TIMESTAMP`・SQL の `NOW()` を使わない（時刻が9時間ずれる）。
- API の日時は UTC（末尾 `Z`）で返す（D-55）。Laravel の標準の JSON 変換に任せ、日本時間の文字列に直さない。
- 適用済みのファイルを書き換えず、新しいファイルを足す。
- ファイルは `php artisan make:migration` で作る。
- 削除時の動き（CASCADE・SET NULL・RESTRICT）は `04_テーブル定義` のとおりにする。
- `env()` は `config/` の中だけで使う。
- CategorySeeder は繰り返しても重複しない形にする。

## テスト

- テストは `mochikore_test` で動かす。`phpunit.xml` の `DB_CONNECTION` は `mysql`、`DB_DATABASE` は `mochikore_test`。SQLite だけで確認済みにしない。
- 権限・上限・競合・トランザクションを必ず確認する。まず各APIの「成功1件と主な失敗」を書く。
- Pint は設定ファイルを作らず、標準の `laravel` プリセットを使う。

```bash
./vendor/bin/pint --test
php artisan test
```
