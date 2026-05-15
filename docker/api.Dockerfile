FROM oven/bun:1.3 AS deps

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/domain/package.json ./packages/domain/package.json

RUN bun install --frozen-lockfile

FROM oven/bun:1.3 AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/domain ./packages/domain

RUN cd packages/domain && bun run build

FROM oven/bun:1.3 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/packages/domain ./packages/domain

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["bun", "src/app.ts"]
