# VS Codeで入る作業用コンテナ。PHPとNodeの両方を使える
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

# Node.js（frontendと同じバージョン）を公式イメージからコピー
COPY --from=node:24-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:24-bookworm-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
  && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
  && node -v && npm -v

# GitHub CLIの公式Debianリポジトリを登録してインストール
RUN install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && printf '%s\n' \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*

# Codex CLI。プロジェクトの依存関係とは分けてインストール
RUN npm install --global @openai/codex

# Claude Code CLI。公式のネイティブインストーラーを使用
RUN curl -fsSL https://claude.ai/install.sh -o /tmp/claude-install.sh \
  && bash /tmp/claude-install.sh \
  && rm /tmp/claude-install.sh

RUN mkdir -p /root/.codex \
  && printf '%s\n' 'cli_auth_credentials_store = "file"' > /root/.codex/config.toml

ENV PATH="/root/.local/bin:${PATH}"

# Bashを開くたびに短縮コマンドを読み込む
RUN printf '%s\n' \
  '[ -f /workspace/.devcontainer/aliases.sh ] && . /workspace/.devcontainer/aliases.sh' \
  >> /root/.bashrc

WORKDIR /workspace
