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

target="${1:-}"
if [[ ! "$target" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "戻し先のデータベース名（英数字と _ だけ）を指定してください" >&2
  exit 1
fi

# 控えは CREATE DATABASE を含まないので、戻し先をここで作って選ぶ。
# mysql は最初のエラーで止まり、終了コードが0以外になる
{
  printf 'CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\nUSE `%s`;\n' "$target" "$target"
  cat
} | railway ssh --service MySQL -- 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --default-character-set=utf8mb4'

echo "流し込みが終わりました：$target"
