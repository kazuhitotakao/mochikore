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
- SC-07のたたんだグループだけは、`useCollapsedGroups` で localStorage にリストごとのグループIDを覚える。名前などの中身は入れない（D-110）。
- 認証が必要な画面への `Link` は `prefetch={false}` にする（D-36。先読みで期限を延ばさない）。

## API通信

- `fetch` を画面に直接書かず、`lib/api/` を通す。
- `lib/api/server.ts` と `lib/api/forward.ts` は `import 'server-only'` にする。`process.env` も `server-only` のファイルで読む。
- ブラウザ → Laravel の中継は `app/api/[...path]/route.ts` から `lib/api/forward.ts` を呼ぶ。次の処理を `forward.ts` にまとめ、画面ごとに書かない。
  1. 更新系（POST・PATCH・PUT・DELETE）で Origin を確認する
  2. `lib/api/routes.ts` にあるメソッドとURLだけを通す
  3. HttpOnly Cookie のトークンを `Authorization: Bearer` へ移す
  4. 利用者の操作のときだけ `X-User-Activity` を付ける（自動処理・先読みには付けない）
  5. タイムアウトを付けて転送する。転送元のヘッダーをそのまま渡さない。利用者のIPは `lib/api/clientIp.ts` で読み、合言葉（`NEXTJS_PROXY_KEY`）付きで渡す（D-41）
  6. 401 なら Cookie を削除する。応答の形は変えず、204 は本文なしで返す
- トークンを扱う `login`・`register`・`logout`・`me`・`reset-password`（保存できたらCookieを消す）と、Server Componentの401でCookieを消す `session-expired`（D-76）は、共通の窓口とは別ファイルにする。
- Laravel のトークンをブラウザの JavaScript や localStorage へ渡さない。ブラウザへは `user` だけ返す。
- Cookie がないときは API-04 を呼ばず、ログイン前として表示する（D-80）。
- Cookie は `mochikore_token`。HttpOnly・SameSite=Lax・Path=/・期限はログインから1年。Secure は本番だけ有効にする（08_認証と構成、D-78）。
- 窓口が自分で返すエラー：Origin 不一致は 403 `origin_not_allowed`、許可していないAPIは 404 `not_found`、Laravel へつながらないときは 502 `server_error`（D-76）。

## 型と項目名

- `strict` を外さない。`any` を使わない。
- APIの項目は snake_case のまま使う（D-55）。camelCase へ変換しない。
- APIの型は `06_API詳細` に合わせて `src/types/api.ts` に書く。
- 日時は文字列で受け、表示時に `Asia/Tokyo` へ変換する。

## エラー処理

- `message` の文章で判定せず、必ず `code` で判定する（D-53）。
- 204 のときは JSON を読まない（D-62）。
- 401：ログインが必要な画面では SC-02 へ移動し、自動で送り直さない。公開画面では移動せず、ログイン前として表示を続ける（D-80）。
- 403 `email_not_verified` は SC-04 へ。409 は読み直しを案内し、自動で送り直さない。429 は `retry_after` で残り秒数を出す（持ち物を増やす操作の回数制限は、1分以上なら分で出す。D-97）。
- 500・通信失敗では共通の文言を出し、入力を残す。
- 保存が終わる前に「保存できた」と表示しない。

## 画面

- 375px 基準の1列、パソコンでは中央に最大 640px（D-73）。
- SC-09のグループ枠は640px未満で1列、640px以上で同じ幅の2列にする。最後が1つでも枠を広げず、件数の「（n件）」は途中で改行しない。長い名前は枠内で折り返す（D-73）。
- SC-09のグループは枠全体を元と同じ寸法・内容で動かし、影を付ける。グループを動かす間はDragOverlayを外し、持ち物を動かすときだけ名前を重ねて表示する。並べ替えは下書きにし、画面を離れるとき（「←」・ブラウザの戻る）にAPI-30で保存する。ブラウザの戻るは、最初に変更したときに同じURLの履歴を1つ足して受け止め、保存できてから足した分を戻してSC-07へ移る（D-58・D-59・D-98・D-113）。
- 指で押すボタン・リンクは、押せる範囲を44px四方以上にする。文字だけのリンク・ボタンには `tap-target`（globals.css）を付け、縦並び（flex-col）の中では `self-start` も付けて横いっぱいに広げない（D-73）。
- 押せるボタン・チェック欄・選択肢の指の形は globals.css でそろえている。部品ごとに `cursor-pointer` を付けない。dnd-kit の `role="button"` は対象外（D-73）。
- 配色は生成り色の地と深い緑（02_画面の絵、D-73）。色は globals.css の名前（`bg-brand`・`text-muted`・`border-line`・`text-danger` など）、ボタン・入力欄・リンク・枠・ラベルは `btn-primary`・`btn-outline`・`btn-danger`・`field`・`text-link`・`card`・`tag` を使う。戻るボタン「←」は `BackLink`（見た目は `back-button`）を使う。オン・オフの切り替えは `SwitchIndicator` を使い、ボタンに `role="switch"`・`aria-checked` を付ける。アイコンは `Icon`（components/Icon.tsx）を使う。`zinc` などの色や色の値を部品に直接書かない。暗い表示用の配色は作らない。書体は Noto Sans JP（`layout.tsx` の `next/font/google`。自分のサイトから配る）。
- エラーや選択状態は、色だけでなく文字や形でも示す。
- 他人の文字を `dangerouslySetInnerHTML` で表示しない。
- 共同編集（D-119）：リストそのものの操作（リストを編集・公開・リンクで共有・招待・メンバーを外す・削除）は所有者にだけ出し、API-05・07 の `is_owner` で分ける。メンバーには中身の操作と「このリストから抜ける」（SC-05）を出す。共同編集中（メンバーがいる・招待リンクがある）は公開・リンクで共有を押せなくする。
- ログイン後の戻り先は同じサイト内だけにする。
- Enter・欄外保存は、IMEの変換確定や連打・blurの重なりで二重送信しない。連続入力のinputを保ち、次の下書きを消したり移動済みのフォーカスを奪ったりしない（D-73）。
- チェック操作の取り消しは、今回変更したIDだけを戻す。取り消しの保存中は非表示タイマーを止め、保存成功後に画面を戻す（D-99・D-101）。
- SC-07のドラッグ中は、並び順・所属の仮表示を保存済みデータと分ける。移動先はすき間と周りの行の動きで示し、黒枠で囲わない。離して変更が確定したときだけAPI-19へ1回送る。Esc・対象外・変更なしでは送らず、通信で届いた追加や更新を失わない（D-95・D-98）。グループの見出しを動かす間はDragOverlayを外す（置いたままだと離したときに一度消える）。
- SC-07の未分類の持ち物の行の真ん中に重ねたときは、並べ替えずに重ねる相手にする。周りの行は動かさず、重ねられた行を実線の緑の枠で示す。離したらAPI-45を1回送り、保存できてから見出しに変える（D-111）。判定は `itemSorting.ts` の `detectUngroupedTarget` にまとめ、キーボードでは重ねない。

## 命名

- コンポーネント `ItemRow.tsx`、フック `useXxx.ts`、その他 camelCase、URLのフォルダは小文字とハイフン、定数 `MAX_ITEMS`。
- 置き場所：複数画面の部品は `src/components/`、機能ごとは `src/features/`（lists・grouping・saved-items・auth）。

## 品質管理

- `eslint.config.mjs` は生成されたまま使う。独自ルールを足さない。
- Prettier は設定ファイルを作らず既定のまま使う。
- テストライブラリ（Vitestなど）は相談してから追加する。
