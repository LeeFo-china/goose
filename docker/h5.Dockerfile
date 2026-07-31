FROM oven/bun:1.3 AS builder

WORKDIR /app/apps/h5

ARG BUILD_SHA=unknown
ENV H5_ASSET_VERSION=${BUILD_SHA}

COPY apps/h5/package.json ./package.json
COPY apps/h5/index.html ./index.html
COPY apps/h5/config.js ./config.js
COPY apps/h5/jLSkeG7x43.txt ./jLSkeG7x43.txt
COPY apps/h5/scripts ./scripts
COPY apps/h5/src ./src

RUN bun run build

FROM oven/bun:1.3 AS runner

WORKDIR /app

ARG BUILD_SHA=unknown
ARG BUILD_REF=unknown
ARG BUILD_RUN_ID=unknown
ARG BUILD_CREATED=unknown

LABEL org.opencontainers.image.source="https://github.com/LeeFo-china/goose" \
  org.opencontainers.image.revision="${BUILD_SHA}" \
  org.opencontainers.image.ref.name="${BUILD_REF}" \
  org.opencontainers.image.created="${BUILD_CREATED}" \
  com.goodcms.service="h5" \
  com.goodcms.github.run_id="${BUILD_RUN_ID}"

ENV NODE_ENV=production
ENV PORT=3020
ENV GOOES_BUILD_SHA=${BUILD_SHA}

COPY --from=builder /app/apps/h5/dist ./dist
COPY apps/h5/server.ts ./server.ts

USER bun

EXPOSE 3020

CMD ["bun", "server.ts"]
