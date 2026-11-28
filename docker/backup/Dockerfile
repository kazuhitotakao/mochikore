# D-08：MySQL の控えを毎日取り、暗号化して Cloudflare R2 へ送る（Railway の定期実行で1回動いて終わる）。
# mysqldump は、公開先の MySQL（8.4）と同じ版の公式のものを使う。
FROM mysql:8.4.13

ARG TARGETARCH
ARG AGE_VERSION=1.3.2
ARG RCLONE_VERSION=1.76.0

# 配布ファイルの確認値を固定し、中身がすり替わっていたら組み立てを止める。
# rclone は公式の SHA256SUMS の値。age は確認値の一覧を配っていないので、2026-11-28 に取得したファイルの値。
RUN set -eux; \
    arch="${TARGETARCH:-$(uname -m)}"; \
    case "$arch" in \
      amd64|x86_64) arch=amd64; \
        age_sha256=cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10; \
        rclone_sha256=a4615495895fec32671c12b45b92f59c60a97fccd3c61a9e02dc3dc2e927a74f ;; \
      arm64|aarch64) arch=arm64; \
        age_sha256=6b8dc4333c53a5a57c9e5834e3a48f92605d7154014cd07269ff3327db5d37f4; \
        rclone_sha256=b961a502b9480583a0f3bc9670718aa65a0dc9ed3fdbb4ef99b102acff62ec5c ;; \
      *) echo "対応していない CPU：$arch" >&2; exit 1 ;; \
    esac; \
    cd /tmp; \
    curl -fsSLo age.tar.gz "https://github.com/FiloSottile/age/releases/download/v${AGE_VERSION}/age-v${AGE_VERSION}-linux-${arch}.tar.gz"; \
    echo "${age_sha256}  age.tar.gz" | sha256sum -c -; \
    tar -xzf age.tar.gz; \
    install -m 0755 age/age /usr/local/bin/age; \
    curl -fsSLo rclone.rpm "https://github.com/rclone/rclone/releases/download/v${RCLONE_VERSION}/rclone-v${RCLONE_VERSION}-linux-${arch}.rpm"; \
    echo "${rclone_sha256}  rclone.rpm" | sha256sum -c -; \
    rpm -i rclone.rpm; \
    rm -rf age age.tar.gz rclone.rpm; \
    age --version; \
    rclone version | head -n 1

COPY --chmod=0755 backup.sh /usr/local/bin/mochikore-backup

# MySQL のサーバーは起動しない（公式イメージの起動処理を使わない）
ENTRYPOINT ["/usr/local/bin/mochikore-backup"]
CMD []
