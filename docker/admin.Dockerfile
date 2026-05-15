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
ENV NEXT_PUBLIC_GOOES_API_BASE_URL=$NEXT_PUBLIC_GOOES_API_BASE_URL
ENV NEXT_PUBLIC_GOOES_H5_BASE_URL=$NEXT_PUBLIC_GOOES_H5_BASE_URL

RUN corepack enable && \
  corepack prepare pnpm@10.33.0 --activate && \
  npm install -g bun@1.3.2

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/admin/node_modules ./apps/admin/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/admin ./apps/admin
COPY packages/domain ./packages/domain

RUN cd packages/domain && bun run build
RUN pnpm --dir apps/admin build

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3010
ENV HOSTNAME=0.0.0.0

RUN corepack enable && \
  corepack prepare pnpm@10.33.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/admin/node_modules ./apps/admin/node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=builder /app/apps/admin ./apps/admin
COPY --from=builder /app/packages/domain ./packages/domain

WORKDIR /app/apps/admin

EXPOSE 3010

CMD ["pnpm", "start"]
