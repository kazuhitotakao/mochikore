# backend（Laravel 13 / PHP 8.4 / MySQL 8.4）

全体のルールはルートの `CLAUDE.md`、理由と例は `docs/開発規約.md` の第2章を見る。
Laravel Boost などの新しいパッケージは、確認してから入れる。

## 役割の分け方

| 場所 | 書くこと | 書かないこと |
|---|---|---|
| FormRequest | 入力の形・長さ | 件数の上限、本人確認 |
| Controller | 認可 → 処理の呼び出し → 応答 | 業務ルール、トランザクション |
| Service | ロック、上限、`grouping_revision`、複数テーブルの更新 | Request・Response |
| Policy | 本人のものかの判定 | 入力チェック |
| Model | リレーション、型変換 | 業務の手順 |
| Resource | 返す項目 | 取得処理 |

- Service は必要なときだけ作る。単純な1件の取得・更新は Controller から Model を直接使う。
- Repository 層は作らない。
- 追加してよいディレクトリは `app/Enums`、`app/Services`、`app/Exceptions` だけ。

## 入力と応答

- `$request->all()` を使わず、`validated()` だけを渡す。
- FormRequest の `authorize()` は `true` のまま。認可は Controller の `Gate::authorize()` で行う。
- 入力条件は `06_API詳細` に合わせる。API-11 で `group_id` を受け取らない。
- 入力エラーの文言は `lang/ja/validation.php` に日本語で用意する。
- 応答は Resource で返し、Model をそのまま返さない。公開用は別の Resource にする。
- 公開APIに作成者の情報と `is_checked` を返さない（F-09・F-10）。
- 項目名は snake_case のまま（D-55）。返すものがなければ `response()->noContent()`（D-62）。
- Resource の `data`・`links`・`meta` の形は変えない（D-53）。

## エラー

- エラーは必ず `message` と `code` を返す。15種類のコードは `App\Enums\ApiErrorCode` にまとめ、`App\Exceptions\ApiException` で返す。
- 標準の例外は `bootstrap/app.php` で変換する：入力エラー 422 `validation_error`、未ログイン 401 `unauthenticated`、回数制限 429 `too_many_requests` と `retry_after`、署名付きリンクの403 は 422 `link_invalid`、想定外 500 `server_error`（詳細は返さない）。
- メール未認証の403は、標準の `verified` ではなく ApiException を投げる自作ミドルウェアで返す。

## 権限

- 権限は Laravel で判定する。画面で隠すだけにしない。
- 他人のリストと存在しないリストは同じ 404 にする（D-43）。Policy では `Response::denyAsNotFound()` を使う。

## Eloquent

- Model の設定は `#[Fillable]` など、生成時と同じ書き方にする。
- 一覧は `with()`・`withCount()` で読み、N+1 を防ぐ。開発中は `Model::preventLazyLoading()` を有効にする。
- `$touches` を使わない。親の更新は Service で明示する（D-25。チェックだけでは親の日時を変えない）。
- 持ち物の構造を変える処理（追加・削除・復元・並べ替え・グループ変更）は、親リストを `lockForUpdate()` してトランザクション内で行い、`grouping_revision` を増やす（D-59）。チェックと名前変更では増やさない。
- API-25 のルートには `withTrashed()` を付ける。
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

## Migration

- `users` に `name` はない（D-32）。登録・Factory・Seeder・Resource で名前を扱わない。
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
