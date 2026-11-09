FROM php:8.4-cli-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
  git bash less curl unzip ca-certificates \
  libicu-dev libzip-dev \
  && docker-php-ext-install -j"$(nproc)" \
  pdo_mysql intl zip bcmath pcntl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer

ENV COMPOSER_ALLOW_SUPERUSER=1

# Bashを開くたびに短縮コマンドを読み込む
RUN printf '%s\n' \
  '[ -f /workspace/.devcontainer/aliases.sh ] && . /workspace/.devcontainer/aliases.sh' \
  >> /root/.bashrc

WORKDIR /workspace/backend
EXPOSE 8000