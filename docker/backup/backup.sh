#!/usr/bin/env bash
# D-08：MySQL の控えを取り、圧縮・暗号化して Cloudflare R2 へ送る。
# Railway の定期実行（毎日 日本時間4:00＝UTC 19:00）で1回動いて終わる。
# どこかの段階で失敗したら成功の合図を送らず、healthchecks.io へ失敗を送って終了コード1で終わる。
# 戻し方は手順書第17章「データの控えと戻し方」。
set -Eeuo pipefail
umask 077

work="$(mktemp -d)"
step="準備"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

# 失敗の理由を error.log に残し、失敗として扱う（ERR の処理へ進む）
die() {
  echo "$1" >>"$work/error.log"
  return 1
}

# 合図が送れなくても控えの成否は変えない。成功の合図が届かなければ healthchecks.io が知らせる
signal() {
  local suffix="$1" body="${2:-}"
  if [[ -z "${HEALTHCHECK_URL:-}" || "${HEALTHCHECK_URL}" == "none" ]]; then
    return 0
  fi
  curl -fsS -m 10 --retry 3 -o /dev/null --data-raw "$body" "${HEALTHCHECK_URL%/}${suffix}" ||
    echo "healthchecks.io へ合図を送れませんでした（${suffix:-成功}）" >&2
}

fail() {
  local code="$1" message detail
  trap - ERR TERM INT
  message="失敗：${step}（終了コード ${code}）"
  detail="$(tail -n 20 "$work/error.log" 2>/dev/null || true)"
  echo "$message" >&2
  [[ -n "$detail" ]] && echo "$detail" >&2
  signal /fail "$(printf '%s\n%s\n' "$message" "$detail")"
  exit 1
}

trap 'rm -rf "$work"' EXIT
trap 'fail $?' ERR
trap 'step="${step}（中断）"; fail 143' TERM INT

signal /start
log "控えを取り始めます"

step="設定の確認"
required=(BACKUP_DB_HOST BACKUP_DB_PORT BACKUP_DB_NAME BACKUP_DB_USER BACKUP_DB_PASSWORD BACKUP_AGE_RECIPIENT BACKUP_DEST HEALTHCHECK_URL)
if [[ "${BACKUP_DEST:-}" == r2:* ]]; then
  required+=(R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY)
fi
missing=()
for name in "${required[@]}"; do
  [[ -n "${!name:-}" ]] || missing+=("$name")
done
((${#missing[@]} == 0)) || die "設定がありません：${missing[*]}"
[[ "$BACKUP_AGE_RECIPIENT" == age1* ]] || die "BACKUP_AGE_RECIPIENT が age の公開鍵（age1…）ではありません"

if [[ "$BACKUP_DEST" == r2:* ]]; then
  export RCLONE_CONFIG_R2_TYPE=s3
  export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
  export RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT"
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_R2_ACL=private
  # 鍵はこのバケットの中の読み書きだけに絞るので、バケットの確認・作成はしない
  export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
fi

step="データの書き出し（mysqldump）"
# パスワードをコマンドの引数に出さないよう、設定ファイルで渡す
printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\n' \
  "$BACKUP_DB_HOST" "$BACKUP_DB_PORT" "$BACKUP_DB_USER" "$BACKUP_DB_PASSWORD" >"$work/client.cnf"
# --single-transaction：表を止めずに、始めた時点の内容をそろえて書き出す（InnoDB）
mysqldump --defaults-extra-file="$work/client.cnf" \
  --single-transaction --quick --no-tablespaces --set-gtid-purged=OFF \
  --triggers --hex-blob --default-character-set=utf8mb4 \
  "$BACKUP_DB_NAME" >"$work/dump.sql" 2>>"$work/error.log"
rm -f "$work/client.cnf"

step="書き出した内容の確認"
# 途中で切れた書き出しを成功にしない。最後の完了の行と、必ずある表を確かめる
tail -n 1 "$work/dump.sql" | grep -q '^-- Dump completed' || die "mysqldump の出力が最後まで書かれていません"
grep -q '^CREATE TABLE `migrations`' "$work/dump.sql" || die "migrations の表が控えにありません"
grep -q '^CREATE TABLE `users`' "$work/dump.sql" || die "users の表が控えにありません"

step="圧縮と暗号化"
name="mochikore-$(TZ=Asia/Tokyo date +%Y-%m-%d-%H%M).sql.gz.age"
gzip -9 -c "$work/dump.sql" 2>>"$work/error.log" |
  age -r "$BACKUP_AGE_RECIPIENT" -o "$work/$name" 2>>"$work/error.log"
rm -f "$work/dump.sql"
head -c 21 "$work/$name" | grep -q '^age-encryption.org/v1' || die "暗号化したファイルの形が違います"

step="R2 への送信"
# 同じ名前の控えを上書きしない
rclone copyto -q --immutable --retries 3 "$work/$name" "$BACKUP_DEST/$name" 2>>"$work/error.log"

step="送った控えの確認"
# 大きさと MD5 が手元のファイルと同じかを確かめる
rclone check -q --one-way --include "/$name" "$work" "$BACKUP_DEST" 2>>"$work/error.log"

step="保存している控えの数の確認"
# R2 の自動削除（6日）が動いていれば 6〜7件、削除が遅れても 8件までに収まる
count="$(rclone lsf -q --files-only --include 'mochikore-*.sql.gz.age' "$BACKUP_DEST" 2>>"$work/error.log" | wc -l)"
((count <= ${BACKUP_MAX_COUNT:-8})) ||
  die "今回の控えは保存できましたが、控えが ${count}件あります。6日を過ぎた控えが消えていないので、R2 の自動削除の設定を確かめてください"

step="完了"
size="$(stat -c %s "$work/$name")"
message="控えを保存しました：${name}（${size}バイト、保存中 ${count}件）"
log "$message"
signal "" "$message"
