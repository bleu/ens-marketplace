# Production image for the ENSv2 marketplace indexer (Envio HyperIndex).
# Follows the same shape as enviodev/local-docker-example — codegen at build time,
# `envio start` (not `envio dev`) at runtime, no local Docker-in-Docker orchestration.
#
# Build context is the monorepo root (neither apps/indexer nor apps/api has its own
# lockfile — both rely on the root pnpm-workspace.yaml + pnpm-lock.yaml):
#   docker build -f apps/indexer/Dockerfile .
FROM node:22-slim AS base

# ca-certificates is required for the indexer's Rust HyperSync client to validate
# HyperSync's TLS cert — without it, node:22-slim fails with "invalid peer
# certificate: UnknownIssuer" trying to reach https://11155111.hypersync.xyz.
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client curl ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@10

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# pnpm needs every workspace member's package.json present to resolve the lockfile
# consistently, even though --filter only installs indexer's own dependencies.
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/indexer/package.json apps/indexer/package.json
RUN pnpm install --frozen-lockfile --filter indexer

WORKDIR /repo/apps/indexer

# ENVIO_CONFIG picks config.production.yaml (Sepolia only — see that file's own
# comment for why Anvil, used for local dev, is deliberately absent here) — codegen
# must run against the same config the running indexer will use.
ENV ENVIO_CONFIG=config.production.yaml
COPY apps/indexer/config.production.yaml apps/indexer/schema.graphql ./
COPY apps/indexer/src/ src/
RUN pnpm envio codegen

CMD ["pnpm", "envio", "start"]
