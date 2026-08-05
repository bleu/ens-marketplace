# Production image for apps/api (NestJS). Build context is the monorepo root — this
# package has no own lockfile, it relies on the root pnpm-workspace.yaml + pnpm-lock.yaml:
#   docker build -f apps/api/Dockerfile .
FROM node:22-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@10

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# pnpm needs every workspace member's package.json present to resolve the lockfile
# consistently, even though --filter only installs api's own dependencies.
COPY apps/web/package.json apps/web/package.json
# The full apps/api/ tree (not just package.json) has to be in place before install —
# its postinstall (`prisma generate`) needs prisma/schema.prisma to already exist.
COPY apps/api/ apps/api/
RUN pnpm install --frozen-lockfile --filter api

WORKDIR /repo/apps/api
RUN pnpm run build

ENV NODE_ENV=production
EXPOSE 3001

CMD ["pnpm", "run", "start"]
