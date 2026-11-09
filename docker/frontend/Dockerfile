# Next.jsの開発サーバーを動かすだけのコンテナ（作業はworkspaceで行う）
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
  git bash less ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/frontend
EXPOSE 3000
