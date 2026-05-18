FROM node:22-bookworm-slim AS deps

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/domain/package.json ./packages/domain/package.json

RUN corepack enable && \
  corepack prepare pnpm@10.33.0 --activate && \
  pnpm install --frozen-lockfile --filter @gooes/api... --filter @gooes/domain...

FROM oven/bun:1.3 AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/domain ./packages/domain

RUN cd packages/domain && bun run build
RUN cd apps/api && \
  bun build src/workers/social-video-transcription-worker.ts \
    --target bun \
    --outdir /app/dist

FROM oven/bun:1.3-alpine AS runner

WORKDIR /app

ARG ALPINE_MIRROR=
ARG BUILD_SHA=unknown
ARG BUILD_REF=unknown
ARG BUILD_RUN_ID=unknown
ARG BUILD_CREATED=unknown

LABEL org.opencontainers.image.source="https://github.com/LeeFo-china/goose" \
  org.opencontainers.image.revision="${BUILD_SHA}" \
  org.opencontainers.image.ref.name="${BUILD_REF}" \
  org.opencontainers.image.created="${BUILD_CREATED}" \
  com.goodcms.service="social-video-worker" \
  com.goodcms.github.run_id="${BUILD_RUN_ID}"

ENV NODE_ENV=production
ENV SERVICE_NAME=gooes-social-video-worker
ENV FFMPEG_BIN=/usr/bin/ffmpeg

RUN if [ -n "$ALPINE_MIRROR" ]; then \
    sed -i "s#https://dl-cdn.alpinelinux.org/alpine#${ALPINE_MIRROR}#g" /etc/apk/repositories; \
  fi && \
  apk add --no-cache ffmpeg ca-certificates

COPY --from=builder /app/dist/social-video-transcription-worker.js ./social-video-transcription-worker.js

CMD ["bun", "/app/social-video-transcription-worker.js"]
