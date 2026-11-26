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
- SC-09 の下書きの形と、共同編集でほかのメンバーの変更を取り込む処理（`rebaseDraft`・`rebaseHistory`）は `features/grouping/draft.ts` にまとめる。共同編集のリスト（API-29 の `is_owner`・`member_count`）では、合図が届いたとき・保存が409のときに、下書きを捨てずに取り込む。409 の後も自動では送り直さない。共同編集でないリストの409は、今までどおり破棄を確かめてから読み直す（D-59・D-119）。
- localStorage に覚えてよいのは、SC-07のたたんだグループ・まとめ表示（SC-20）でたたんだリストのID（`features/lists/useCollapsedGroups.ts`）と、まとめ表示ごとの表示方法・上下の比率（`features/combined-views/useCombinedLayout.ts`）だけ。読み書きは `lib/deviceMemory.ts` を通す。名前などの中身は入れない（D-110・D-124・D-125）。
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
- 共同編集の配信（F-35・D-119）：WebSocket は `lib/realtime/useListChannel.ts` だけで使う（pusher-js。laravel-echo は入れない）。チャンネルの認可は窓口の API-63 を通し、接続先（`REVERB_APP_KEY`・`REVERB_PUBLIC_*`）は `lib/realtime/config.ts`（server-only）で読んで Server Component から渡す。`NEXT_PUBLIC_` は付けない。接続は画面に1本だけ作り、まとめ表示（SC-20）で複数のリストを聞くときもチャンネルだけを分ける（`X-Socket-ID` を1つにそろえるため、D-124）。
- 配信で届くのは合図だけ。SC-07 は `useRemoteListSync` が API-07 を、SC-09 は API-29 を読み直して反映する。合図・画面に戻ったときの読み直しは自動の通信なので `userActivity: false` にする（D-36）。
- データを変える通信は `clientApi` が数えている（送信中は読み直しを待たせ、`X-Socket-ID` を添えて自分を配信先から外す）。データを変えない POST だけ `mutates: false` を付ける。画面から `fetch` を直接呼ぶと数えられないので、必ず `clientApi` を通す。
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

- 375px 基準の1列、パソコンでは中央に最大 640px（D-73）。例外はまとめ表示（SC-20）だけで、`main` に `data-wide-page` を付け、幅1024px以上では最大1280pxにしてリストを横に並べる（1列320px以上、`layout.tsx`、D-124）。
- まとめ表示（SC-20、D-124）：各リストは SC-07 と同じ `ListDetail` に `combined`（`CombinedFrame`）を渡して出し、中身の処理を二重に作らない。リストそのものの操作（「…」）と説明文は出さず、見出し（リスト名・共同編集の印・たたむ矢印）を `sticky` で画面の上に残す。画面下の通知・エラーは `createPortal` で画面に1つの欄（`data-combined-footer`）へ出し、リスト名を添える。同じ画面に複数並ぶので、部品の中で固定の `id` を使わず `useId` かリストIDを付ける。SC-07 をまとめ表示から開いたときは `?from=combined-{id}` を付け、SC-06・SC-09 へ進んで戻っても「←」でまとめ表示へ戻す（`features/combined-views/returnPath.ts` の `listPagePath`）。
- まとめ表示の分割表示（SC-20、D-125）：リストが2件のスマホでは上下に分ける。形は globals.css の `can-split:`・`split:`（幅1024px未満・高さ480px以上、`split:` は `data-split` の中）で決め、行・見出し・余白を詰めるのは `dense:`（同じ大きさで、分割のアイコンを出すとき＝`data-dense` の中。分割表示・通常表示とも。`split:` より前に定義し、同じ指定は `split:` を優先する）。開いたときから分割表示で描く。同じ条件を JS では `SPLIT_MEDIA` で読み、ドラッグの範囲（`restrictToScrollArea`）・キーボード（`useKeyboardFit`）など表示の後に動く処理だけに使う。画面の大きさ・キーボードで一時的に変える表示は覚えた値に書かない。境界線（`SplitDivider`）のドラッグ中は React で描き直さず、CSS 変数（`--split-top`・`--split-bottom`）だけを書き換える。キーボードで一方を広げたときは、開いている方に残りを全部使い（CSS 変数を1にする）、覚えた比率は変えない。境界線は見出しのすぐ近く（見出し＋24px）まで指に合わせて動き、そこまで近づけた側をそのドラッグの中でたたみ、戻すと開く（`useCollapsedLists` の `set`。描き直しを待たずに続けて呼ぶため、切り替えの `toggle` は使わない）。入れ物の最小の高さは見出しの高さ（`usePaneHead` が測る `--pane-head`）。たたんだまま離したときは比率を覚え直さない。境界線は決まった位置へ吸い付かせない（止まっては跳ぶ動きになる、利用者の指示）。ダブルタップ・矢印キーで高さを一度に変えるときだけ、領域の `data-settling` の間 flex-grow の transition で動かす。比率を覚える（React で描き直す）のは、指を離した少し後・動かし終わってから。各リストは `CombinedPane`（memo）で出し、比率の保存やもう一方をたたむときに持ち物まで描き直さない。開いているリストは持ち物が少なくても比率のとおりの高さにし、中身に合わせて縮めない（境界線のドラッグとぶつかるため、利用者の指示）。たたんだリストは見出しの高さで止まり、空いた分はもう一方が使う（残りを全部配るよう、flex-grow は比率×1000）。上下のスクロール位置は `useSplitScrollMemory` がアプリを開いている間だけ覚え、ブラウザには保存しない。分割表示のアイコンはスイッチ（`role="switch"`）だが、利用者の指示で `SwitchIndicator` を使わずアイコンだけにする。
- SC-09のグループ枠は640px未満で1列、640px以上で同じ幅の2列にする。最後が1つでも枠を広げず、件数の「（n件）」は途中で改行しない。長い名前は枠内で折り返す（D-73）。
- SC-09のグループは枠全体を元と同じ寸法・内容で動かし、影を付ける。グループを動かす間はDragOverlayを外し、持ち物を動かすときだけ名前を重ねて表示する。並べ替えは下書きにし、画面を離れるとき（「←」・ブラウザの戻る）にAPI-30で保存する。ブラウザの戻るは、最初に変更したときに同じURLの履歴を1つ足して受け止め、保存できてから足した分を戻してSC-07へ移る（D-58・D-59・D-98・D-113）。
- 指で押すボタン・リンクは、押せる範囲を44px四方以上にする。文字だけのリンク・ボタンには `tap-target`（globals.css）を付け、縦並び（flex-col）の中では `self-start` も付けて横いっぱいに広げない（D-73）。 例外：まとめ表示でリストが2件のスマホ（`dense:`。分割表示・通常表示とも）では、見える量を増やすため、持ち物の行・グループとリストの見出しのボタンを36pxに、文字を14pxに詰める（D-125、利用者の指示）。入力欄の文字は、iPhone で拡大されないよう16pxのままにする。
- 押せるボタン・チェック欄・選択肢の指の形は globals.css でそろえている。部品ごとに `cursor-pointer` を付けない。dnd-kit の `role="button"` は対象外（D-73）。
- 配色は生成り色の地と深い緑（02_画面の絵、D-73）。色は globals.css の名前（`bg-brand`・`text-muted`・`border-line`・`text-danger` など）、ボタン・入力欄・リンク・枠・ラベルは `btn-primary`・`btn-outline`・`btn-danger`・`field`・`text-link`・`card`・`tag` を使う。戻るボタン「←」は `BackLink`（見た目は `back-button`）を使う。オン・オフの切り替えは `SwitchIndicator` を使い、ボタンに `role="switch"`・`aria-checked` を付ける。アイコンは `Icon`（components/Icon.tsx）を使う。`zinc` などの色や色の値を部品に直接書かない。暗い表示用の配色は作らない。書体は Noto Sans JP（`layout.tsx` の `next/font/google`。自分のサイトから配る）。
- エラーや選択状態は、色だけでなく文字や形でも示す。
- ダイアログの取りやめるボタンは「キャンセル」にそろえる（確認のダイアログも入力用のダイアログも。`ConfirmDialog` の `cancelLabel` も同じ）。実行するボタンは、何をするかが分かる文言にする（「チェックを外す」「リストから抜ける」「グループを整理」など）。選ぶ表示（n件選択中）を終えるボタンは「やめる」のまま（共通5・D-73）。
- 他人の文字を `dangerouslySetInnerHTML` で表示しない。
- 共同編集（D-119）：リストそのものの操作（リストを編集・公開・リンクで共有・招待・メンバーを外す・削除）は所有者にだけ出し、API-05・07 の `is_owner` で分ける。メンバーには中身の操作と「このリストから抜ける」（SC-05）を出す。共同編集中（メンバーがいる・招待リンクがある）は公開・リンクで共有を押せなくする。
- ログイン後の戻り先は同じサイト内だけにする。
- 招待リンクの文字（API-23 の応答・ログインの行き先から取り出した値）を画面のパスへ入れるときは、`features/auth/nextPath.ts` の `invitePath` で形（32文字の英数字）を確かめる。会員登録（SC-03）は、ログイン（SC-02）から引き継いだ行き先が招待の画面のときだけ `invite_token` を送る（D-121）。
- Enter・欄外保存は、IMEの変換確定や連打・blurの重なりで二重送信しない。連続入力のinputを保ち、次の下書きを消したり移動済みのフォーカスを奪ったりしない（D-73）。
- グループのチェックの動き（D-122）：繰り返し利用（`check_mode` が `repeat`）のグループの持ち物は、チェックしても隠さず、行に前回チェックした日（`features/lists/lastChecked.ts`）を出す。「チェック済みを表示（n件）」「チェック済みを削除（n件）」と、全部チェック済みのグループを隠す処理（D-101）は、通常のグループとグループに入っていない持ち物だけを対象にする（SC-07 は `hidesWhenChecked`、SC-09 は下書きの設定・所属で判定）。チェックは自動では外れない。画面を開いたまま日本時間の0時を過ぎたとき・戻って日付が変わっていたとき（`useTokyoDay`）は、前回の日付の表示だけを描き直し、読み直さない。SC-07 の繰り返し利用のグループの中は、未チェックを上・チェック済みを下に並べる（`arrangeInGroup`）。保存した順番（`sort_order`）は変えず、表示だけを変える。付けた持ち物は1秒たってから下へ（`sinkLater`）、外したらすぐ上へ移し、`AnimatedItemList` で滑らかに動かす。ドラッグで反対側へ置いたときは、同じ側の端に並べる（`anchorInRepeatGroup`）。グループのチェックをまとめて外す操作は、見出しのボタンから開くダイアログ（`CheckModeDialog`、API-37）の上に、「チェック済み n件」と小さい「チェックを外す」を1行に並べて置き、下の「チェックの動き」と線で分ける（利用者の指示）。設定を選ぶ欄は `features/grouping/CheckModeField.tsx`、「繰り返し利用」の文字の印（SC-09・SC-11・SC-18）は `features/lists/RepeatBadge.tsx` を共有する。SC-07 の見出しは文字の印を出さず、たたむ矢印の左のボタンを、通常は「…」、繰り返し利用はくり返しの矢印（`Icon` の `repeat`）にする（利用者の指示）。
- SC-07 のグループの見出しの件数「（n件）」は、たたんだときだけ薄い色（`text-faint`）で出し、開いているときは出さない（利用者の指示、D-110）。チェックの動きのボタンとたたむ矢印は見出しの `h2` の外に置き、件数の有無で位置を変えない。選ぶ表示（`SelectionList`）と SC-09 の件数は、今までどおりいつも出す。
- SC-07 で持ち物を重ねてグループにした直後は、画面下の通知に「元に戻す」を添える（API-64、D-123）。出すのはほかの通知と同じ5秒だけで、延ばさない（利用者の指示）。戻せないとき（その間にリストが変わった）は、Laravel の文を画面下のエラー欄に出し、自動では読み直さない。
- チェック操作の取り消しは、今回変更したIDだけを戻す。取り消しの保存中は非表示タイマーを止め、保存成功後に画面を戻す（D-99・D-101）。
- SC-07のドラッグ中は、並び順・所属の仮表示を保存済みデータと分ける。移動先はすき間と周りの行の動きで示し、黒枠で囲わない。離して変更が確定したときだけAPI-19へ1回送る。Esc・対象外・変更なしでは送らず、通信で届いた追加や更新を失わない（D-95・D-98）。グループの見出しを動かす間はDragOverlayを外す（置いたままだと離したときに一度消える）。
- SC-07の未分類の持ち物の行の真ん中に重ねたときは、並べ替えずに重ねる相手にする。周りの行は動かさず、重ねられた行を実線の緑の枠で示す。離したらAPI-45を1回送り、保存できてから見出しに変える（D-111）。判定は `itemSorting.ts` の `detectUngroupedTarget` にまとめ、キーボードでは重ねない。

## 命名

- コンポーネント `ItemRow.tsx`、フック `useXxx.ts`、その他 camelCase、URLのフォルダは小文字とハイフン、定数 `MAX_ITEMS`。
- 置き場所：複数画面の部品は `src/components/`、機能ごとは `src/features/`（lists・grouping・saved-items・auth・combined-views）。

## 品質管理

- `eslint.config.mjs` は生成されたまま使う。独自ルールを足さない。
- Prettier は設定ファイルを作らず既定のまま使う。
- テストライブラリ（Vitestなど）は相談してから追加する。
