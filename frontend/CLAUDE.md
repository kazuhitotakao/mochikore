@AGENTS.md

# frontend（Next.js 16 / TypeScript）

全体のルールはルートの `CLAUDE.md`、理由と例は `docs/開発規約.md` の第3章を見る。
Next.jsは `node_modules/next/dist/docs/` の説明を優先する（インストールした版に合わせるため）。

## 使わないもの

- Cache Components（D-75）。`next.config.ts` に `cacheComponents`・`partialPrefetching` を足さない。
- Server Actions を初期版のAPI通信に使わない（D-76）。
- `middleware.ts` を使わない。`proxy.ts` だけで画面を守らない。
- データ取得ライブラリを入れない。`fetch` で足りる。

## Server Component と Client Component

- 既定は Server Component。操作が必要な部品だけ `'use client'` にする。
- 読み取り：Server Component から `lib/api/server.ts` を通して Laravel へ直接送る（D-76の例外）。
- 更新：Client Component から `/api/...` の Route Handler を通す。
- 表示の処理の中で更新系APIを呼ばない。SC-04・SC-13は画面を開いた後に呼ぶ。
- `params`・`searchParams`・`cookies()` は `await` する（Next.js 16で必須）。
- 本人のデータをキャッシュしない。
- 復元候補とSC-09の下書きは `useState` に置き、ブラウザへ保存しない（D-28）。
- 認証が必要な画面への `Link` は `prefetch={false}` にする（D-36。先読みで期限を延ばさない）。

## API通信

- `fetch` を画面に直接書かず、`lib/api/` を通す。
- `lib/api/server.ts` と `lib/api/forward.ts` は `import 'server-only'` にする。`process.env` も `server-only` のファイルで読む。
- ブラウザ → Laravel の中継は `app/api/[...path]/route.ts` から `lib/api/forward.ts` を呼ぶ。次の処理を `forward.ts` にまとめ、画面ごとに書かない。
  1. 更新系（POST・PATCH・PUT・DELETE）で Origin を確認する
  2. `lib/api/routes.ts` にあるメソッドとURLだけを通す
  3. HttpOnly Cookie のトークンを `Authorization: Bearer` へ移す
  4. 利用者の操作のときだけ `X-User-Activity` を付ける（自動処理・先読みには付けない）
  5. タイムアウトを付けて転送する。転送元のヘッダーをそのまま渡さない
  6. 401 なら Cookie を削除する。応答の形は変えず、204 は本文なしで返す
- トークンを扱う `login`・`register`・`logout`・`me` は共通の窓口とは別ファイルにする。
- Laravel のトークンをブラウザの JavaScript や localStorage へ渡さない。ブラウザへは `user` だけ返す。
- Cookie がないときは API-04 を呼ばず、ログイン前として表示する（D-80）。
- Cookie の属性・期限はまだ（仮）。第11章の試作で確定する。

## 型と項目名

- `strict` を外さない。`any` を使わない。
- APIの項目は snake_case のまま使う（D-55）。camelCase へ変換しない。
- APIの型は `06_API詳細` に合わせて `src/types/api.ts` に書く。
- 日時は文字列で受け、表示時に `Asia/Tokyo` へ変換する。

## エラー処理

- `message` の文章で判定せず、必ず `code` で判定する（D-53）。
- 204 のときは JSON を読まない（D-62）。
- 401：ログインが必要な画面では SC-02 へ移動し、自動で送り直さない。公開画面では移動せず、ログイン前として表示を続ける（D-80）。
- 403 `email_not_verified` は SC-04 へ。409 は読み直しを案内し、自動で送り直さない。429 は `retry_after` で残り秒数を出す。
- 500・通信失敗では共通の文言を出し、入力を残す。
- 保存が終わる前に「保存できた」と表示しない。

## 画面

- 375px 基準の1列、パソコンでは中央に最大 640px（D-73）。
- エラーや選択状態は、色だけでなく文字や形でも示す。
- 他人の文字を `dangerouslySetInnerHTML` で表示しない。
- ログイン後の戻り先は同じサイト内だけにする。

## 命名

- コンポーネント `ItemRow.tsx`、フック `useXxx.ts`、その他 camelCase、URLのフォルダは小文字とハイフン、定数 `MAX_ITEMS`。
- 置き場所：複数画面の部品は `src/components/`、機能ごとは `src/features/`（lists・grouping・saved-items・auth）。

## 品質管理

- `eslint.config.mjs` は生成されたまま使う。独自ルールを足さない。
- Prettier は設定ファイルを作らず既定のまま使う。
- テストライブラリ（Vitestなど）は相談してから追加する。
