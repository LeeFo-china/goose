FROM node:22-bookworm-slim AS deps

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/domain/package.json ./packages/domain/package.json

RUN corepack enable && \
  corepack prepare pnpm@10.33.0 --activate && \
  pnpm install --frozen-lockfile --filter @gooes/web... --filter @gooes/domain...

FROM node:22-bookworm-slim AS builder

WORKDIR /app

ARG BUILD_SHA=unknown
ENV NEXT_TELEMETRY_DISABLED=1
ENV GOOES_BUILD_SHA=$BUILD_SHA

RUN corepack enable && \
  corepack prepare pnpm@10.33.0 --activate && \
  npm install -g bun@1.3.2

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/domain/node_modules ./packages/domain/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages/domain ./packages/domain

RUN cd packages/domain && bun run build
RUN pnpm --dir apps/web build
RUN pnpm --dir apps/web verify:standalone-css

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ARG BUILD_SHA=unknown
ARG BUILD_REF=unknown
ARG BUILD_RUN_ID=unknown
ARG BUILD_CREATED=unknown

LABEL org.opencontainers.image.source="https://github.com/LeeFo-china/goose" \
  org.opencontainers.image.revision="${BUILD_SHA}" \
  org.opencontainers.image.ref.name="${BUILD_REF}" \
  org.opencontainers.image.created="${BUILD_CREATED}" \
  com.goodcms.service="web" \
  com.goodcms.github.run_id="${BUILD_RUN_ID}"

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3020
ENV HOSTNAME=0.0.0.0

RUN groupadd --gid 10001 gooes && useradd --uid 10001 --gid 10001 --no-create-home gooes

COPY --from=builder --chown=10001:10001 /app/apps/web/.next/standalone ./

USER 10001:10001

EXPOSE 3020

CMD ["node", "apps/web/server.js"]
