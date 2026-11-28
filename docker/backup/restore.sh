#!/usr/bin/env bash
# D-08：控えの中身（SQL）を標準入力から受け取り、公開先の MySQL へ流し込む。
# MySQL を外へ開けないよう、railway ssh で MySQL のコンテナに入り、その中の mysql コマンドへ渡す。
# 秘密鍵は利用者の Mac から出さないので、復号は Mac で行い、作業用コンテナ（Railway の CLI にログイン済み）でこれを動かす。
# 手順は手順書第17章「データの控えと戻し方」。
#
# 使い方（Mac のプロジェクトのフォルダで）：
#   age -d -i ~/mochikore-backup.key 控えのファイル | gunzip |
#     docker compose exec -T workspace docker/backup/restore.sh 戻し先のデータベース名
set -Eeuo pipefail
umask 077

target="${1:-}"
if [[ ! "$target" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "戻し先のデータベース名（英数字と _ だけ）を指定してください" >&2
  exit 1
fi

# Mac 側で復号・展開に失敗しても、ここには空や途中までの中身が届くだけで、失敗は伝わらない。
# 途中まで流し込むと表が消えたままになるので、いったん全部受け取り、確かめてから流し込む。
# 受け取った中身は作業用コンテナの一時フォルダに置き、終わったら（失敗しても）消す
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cat >"$work/restore.sql"

fail() {
  echo "$1。何も流し込んでいません" >&2
  exit 1
}
[[ -s "$work/restore.sql" ]] || fail "控えの中身が空です。Mac 側のコマンド（控えのファイル名・秘密鍵）を確かめてください"
tail -n 1 "$work/restore.sql" | grep -q '^-- Dump completed' || fail "控えの中身が最後までありません（途中で切れています）"
grep -q '^CREATE TABLE `migrations`' "$work/restore.sql" || fail "控えに migrations の表がありません。もちこれの控えか確かめてください"
echo "控えの中身を確かめました（$(wc -c <"$work/restore.sql") バイト）。${target} へ流し込みます"

# 控えは CREATE DATABASE を含まないので、戻し先をここで作って選ぶ。
# mysql は最初のエラーで止まり、終了コードが0以外になる
{
  printf 'CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\nUSE `%s`;\n' "$target" "$target"
  cat "$work/restore.sql"
} | railway ssh --service MySQL -- 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --default-character-set=utf8mb4'

echo "流し込みが終わりました：$target"
