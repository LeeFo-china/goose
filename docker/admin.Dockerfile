FROM node:22-bookworm-slim AS deps

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin/package.json ./apps/admin/package.json
COPY packages/domain/package.json ./packages/domain/package.json

RUN corepack enable && \
  corepack prepare pnpm@10.33.0 --activate && \
  pnpm install --frozen-lockfile --filter @gooes/admin... --filter @gooes/domain...

FROM node:22-bookworm-slim AS builder

WORKDIR /app

ARG NEXT_PUBLIC_GOOES_API_BASE_URL=https://api.goodcms.cn
ARG NEXT_PUBLIC_GOOES_H5_BASE_URL=https://h5.goodcms.cn

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=2048
ENV NEXT_PUBLIC_GOOES_API_BASE_URL=$NEXT_PUBLIC_GOOES_API_BASE_URL
ENV NEXT_PUBLIC_GOOES_H5_BASE_URL=$NEXT_PUBLIC_GOOES_H5_BASE_URL

RUN corepack enable && \
  corepack prepare pnpm@10.33.0 --activate && \
  npm install -g bun@1.3.2

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/admin/node_modules ./apps/admin/node_modules
COPY --from=deps /app/packages/domain/node_modules ./packages/domain/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/admin ./apps/admin
COPY packages/domain ./packages/domain

RUN cd packages/domain && bun run build
RUN pnpm --dir apps/admin build

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
  com.goodcms.service="admin" \
  com.goodcms.github.run_id="${BUILD_RUN_ID}"

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3010
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/apps/admin/.next/standalone ./
COPY --from=builder /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=builder /app/apps/admin/public ./apps/admin/public

EXPOSE 3010

CMD ["node", "apps/admin/server.js"]
