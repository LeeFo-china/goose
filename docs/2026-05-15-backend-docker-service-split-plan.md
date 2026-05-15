# 后端 Docker 服务拆分规划

日期：2026-05-15  
范围：`apps/api` 后端运行形态、worker、后台任务、未来全景拼接服务。  
结论：建议先做“同一代码镜像，多进程服务”的容器化拆分，不立即把代码仓库拆成多个微服务。

## 背景

当前后端是 Bun + TypeScript + Fastify，主入口为：

- API 主服务：`apps/api/src/app.ts`
- 短视频转文本 worker：`apps/api/src/workers/social-video-transcription-worker.ts`
- 施工日志 / 评论 COS 对账 worker：`apps/api/src/workers/project-log-comment-cos-reconcile-worker.ts`
- 存储迁移、回填、校验脚本：`apps/api/src/scripts/*`

数据库、鉴权、业务数据目前依赖 Supabase；对象存储已经逐步迁移到腾讯云 COS。现阶段真正需要隔离的是运行职责、资源配额、故障影响面和部署运维方式，而不是立刻拆代码仓库。

## 拆分原则

1. **一个镜像，多种 command**
   - `gooes-api` 镜像包含 `apps/api` 代码。
   - API、worker、job 使用同一个镜像，通过不同启动命令区分职责。

2. **先拆运行进程，不拆业务代码**
   - 先把 API、长任务 worker、对账 worker 拆成独立容器。
   - 等队列、监控、容量边界稳定后，再考虑代码级服务拆分。

3. **无状态服务优先**
   - API 容器不保存本地文件。
   - 上传、预览、业务图片走 COS。
   - 对账报告如果需要保留，挂载独立 volume 或输出到 COS。

4. **数据库迁移和一次性任务独立执行**
   - migration、storage backfill、verify 不放进常驻 API 容器。
   - 作为 one-off job 或 CI/CD step 执行。

5. **可观测性先行**
   - 每个容器必须有明确 `SERVICE_NAME`。
   - 日志统一 JSON 输出到 stdout/stderr。
   - healthcheck、重启策略、资源限制必须在第一版具备。

## 第一版服务拆分

### 1. `gooes-api`

职责：

- 对外 REST API。
- Admin / H5 / 微信小程序统一访问后端。
- 短请求业务编排。
- 文件上传签名、COS complete、公开 URL 解析。

启动命令：

```bash
bun src/app.ts
```

端口：

- 容器内：`3000` 或从 `PORT` 读取。
- 宿主机 / 反向代理：建议继续由 Nginx / 网关暴露 `https://api.goodcms.cn`。

建议副本：

- 第一版：1 个。
- 稳定后：2 个以上，前置负载均衡。

关键要求：

- 必须新增 `/healthz` 或 `/readyz`。
- 健康检查不能依赖所有第三方服务，建议只检查进程、路由加载、基础配置。
- 深度检查放到 `/ops` 或内部诊断接口。

### 2. `gooes-social-video-worker`

职责：

- 领取 `social_video_transcriptions` pending 任务。
- 调用第三方视频转文本链路。
- 处理缓存、计费冻结 / 扣费、任务状态回写。

启动命令：

```bash
bun src/workers/social-video-transcription-worker.ts
```

建议副本：

- 第一版：1 个。
- 横向扩容前必须确认 `claim_next_social_video_transcription` RPC 具备并发安全。

资源策略：

- CPU / 内存限制应独立于 API。
- 第三方接口慢、视频任务卡住时不能拖垮 API。

关键配置：

- `SOCIAL_VIDEO_CONCURRENCY_LIMIT`
- `SOCIAL_VIDEO_WORKER_POLL_INTERVAL_MS`
- `SOCIAL_VIDEO_STALE_TASK_TIMEOUT_MS`
- `SOCIAL_VIDEO_CHARGE_ENABLED`

### 3. `gooes-cos-reconcile-worker`

职责：

- 施工日志图片、评论图片的 COS complete 漏登记兜底。
- 周期性扫描业务记录和 COS 对象状态。
- 输出对账报告。

启动命令：

```bash
bun src/workers/project-log-comment-cos-reconcile-worker.ts
```

建议副本：

- 第一版：1 个，禁止多副本同时跑同一窗口。

关键配置：

- `PROJECT_LOG_COMMENT_COS_RECONCILE_WORKER_ENABLED`
- `PROJECT_LOG_COMMENT_COS_RECONCILE_APPLY`
- `PROJECT_LOG_COMMENT_COS_RECONCILE_INTERVAL_MS`
- `PROJECT_LOG_COMMENT_COS_RECONCILE_LOOKBACK_MINUTES`
- `PROJECT_LOG_COMMENT_COS_RECONCILE_LIMIT`
- `PROJECT_LOG_COMMENT_COS_RECONCILE_OUT_DIR`
- `PROJECT_LOG_COS_RECONCILE_OUT_DIR`

存储要求：

- 如果报告需要持久化，挂载 `/app/apps/api/reports` volume。
- 更推荐后续把报告上传 COS，容器本地只保留临时文件。

### 4. `gooes-billing-worker`（建议补齐）

当前计费已经有短信、AI 试算、视频转文本扣费等能力，但第七阶段对账 / 超时回收任务仍需要常驻或定时任务承载。

职责：

- 冻结积分超时释放。
- 异常账单重试。
- 日账单汇总。
- 低余额通知。
- AI 试算观察汇总。

第一版可以不马上编码成独立 worker，但 Docker 拆分时建议预留服务位。

建议启动命令：

```bash
bun src/workers/billing-reconcile-worker.ts
```

需要新增代码后再启用。

### 5. `gooes-panorama-worker`（未来 360 全景服务）

全景拼接涉及 Python / OpenCV / libvips，与 Bun API 运行环境差异较大，不建议塞进 API 镜像。

职责：

- 多图上传后的全景拼接。
- OpenCV stitch。
- libvips dzsave 切瓦片。
- 写回任务状态和输出 manifest。

建议镜像：

- 单独 Python 镜像。
- 安装 `opencv-python-headless`、`pyvips`、`libvips`。

启动命令示例：

```bash
python worker.py
```

与 API 的关系：

- API 只负责创建 `tenant_panorama_jobs`、签名上传、查询任务状态。
- worker 独立消费任务并写回结果。

## 不建议第一版拆出的服务

### Admin / H5 不放进后端 worker 拆分第一阶段

Admin 和 H5 是前端应用，部署节奏和后端容器不同。可以单独容器化，但不应算入“后端服务拆分”的第一阶段。

Admin 当前是 Next.js 应用，包含服务端路由：

- `apps/admin/app/api/auth/*`
- `apps/admin/app/api/backend/[...path]/route.ts`

所以它不是纯静态站点，不能简单当作静态文件扔到 COS/CDN。第一版建议作为独立的 `gooes-admin` Next.js 容器运行，由 Nginx 暴露后台域名，再由 admin 容器通过内网或公网 API 地址访问 `gooes-api`。

## Admin 处理方案

### 定位

`gooes-admin` 是独立 Web 服务，不属于后端业务 worker。它的职责是：

- 渲染 Admin 页面。
- 维护后台登录 cookie。
- 通过 `/api/backend/*` 代理请求到 `gooes-api`。
- 隔离浏览器端和后端 API 的真实访问细节。

### 推荐拓扑

```text
Browser
  -> https://admin.goodcms.cn
  -> Nginx
  -> gooes-admin:3010
  -> /api/backend/*
  -> gooes-api:3000
  -> Supabase / COS / 第三方服务
```

Admin 和 API 的关键连接点：

- `GOOES_API_BASE_URL=http://gooes-api:3000`，如果在同一个 Docker network。
- 或 `GOOES_API_BASE_URL=https://api.goodcms.cn`，如果 admin 和 API 分开部署。

不建议浏览器直接调用 `gooes-api`，原因是：

- 当前 Admin 已经有服务端 proxy 和 cookie 登录逻辑。
- 直接暴露会增加 CORS、token 存储、跨域 cookie、安全策略复杂度。
- Admin SSR 页面需要服务端读取 session。

### 镜像策略

建议给 Admin 单独镜像：

```text
docker/admin.Dockerfile
```

建议 Next 配置启用 standalone 输出：

```ts
// apps/admin/next.config.ts
const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingRoot: join(appDir, "../.."),
};
```

镜像构建思路：

```Dockerfile
FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin/package.json ./apps/admin/package.json
COPY packages/domain/package.json ./packages/domain/package.json
RUN corepack enable && pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && pnpm --dir apps/admin build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3010
WORKDIR /app

COPY --from=builder /app/apps/admin/.next/standalone ./
COPY --from=builder /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=builder /app/apps/admin/public ./apps/admin/public

CMD ["node", "apps/admin/server.js"]
```

说明：

- Admin 目前构建脚本使用 `pnpm --dir apps/admin build`，所以 admin 镜像建议用 pnpm，不要强行用 Bun。
- API 镜像保持 Bun，这是两个运行时边界，不冲突。
- 如果后续统一包管理器，需要单独做依赖锁文件治理，不能在 Docker 化时顺手混改。

### Admin Compose 草案

如果 Admin 和 API 部署在同一台机器、同一个 Docker network，可以这样放入 compose：

```yaml
services:
  admin:
    image: goose-admin:${GOOSE_IMAGE_TAG:-latest}
    environment:
      SERVICE_NAME: goose-admin
      NODE_ENV: production
      PORT: "3010"
      GOOES_API_BASE_URL: http://api:3000
    ports:
      - "3010:3010"
    restart: unless-stopped
    depends_on:
      api:
        condition: service_started
```

如果 Admin 和 API 分开部署，则：

```env
GOOES_API_BASE_URL=https://api.goodcms.cn
```

### Admin 环境变量

Admin 需要的变量应尽量少：

- `NODE_ENV=production`
- `PORT=3010`
- `GOOES_API_BASE_URL`
- `NEXT_PUBLIC_GOOES_API_BASE_URL`：不推荐第一版使用，除非明确有浏览器直连 API 的页面。

不要把以下后端敏感变量注入 Admin 容器：

- `SUPABASE_SERVICE_ROLE_KEY`
- `TENCENT_COS_SECRET_KEY`
- `JWT_SECRET`
- AI / 短信供应商密钥

Admin 只需要知道 API 地址，业务密钥必须留在 `gooes-api` 和 worker 容器。

### Admin 部署顺序

建议 Admin 容器化放在 API Docker 化之后：

1. 先完成 `gooes-api` 容器和 `/healthz`。
2. 保持现有 Admin 部署方式不变，确认它能访问 Docker API。
3. 新建 `gooes-admin` 容器，在非公开端口 `3010` 启动。
4. 配置 `GOOES_API_BASE_URL` 指向 Docker API。
5. 用测试域名或 hosts 访问 Admin。
6. 验证登录、租户页、项目页、图片预览、计费中心。
7. Nginx 切后台域名到 `gooes-admin`。
8. 保留旧 Admin 进程 15-30 分钟作为回滚。

### Admin 验收标准

Admin 容器化上线前必须验证：

- 登录成功，cookie 正常写入。
- `/api/auth/me` 正常。
- `/api/backend/*` 代理正常。
- 页面刷新后 session 不丢失。
- 图片预览、COS signed URL、头像上传、费用凭证上传正常。
- 超管平台计费中心、平台概览、租户客户列表、项目详情至少 smoke test 一遍。
- 浏览器控制台无 401 循环、502、CORS 错误。

### Admin 回滚

Admin 回滚比 API 简单：

1. Nginx 切回旧 Admin 进程端口。
2. 停止 `gooes-admin` 容器。
3. API 容器不需要回滚，除非同时发现 API 兼容性问题。

### Admin 和后端拆分的边界

第一版保持：

- Admin 是独立 Web 容器。
- API 是独立后端容器。
- worker 是独立后台任务容器。
- Admin 不直接连数据库。
- Admin 不持有后端服务密钥。
- Admin 通过 API 的正式接口完成所有业务操作。

### 不自建 Supabase 容器

当前 Supabase 是平台核心依赖，第一版不建议把 Supabase 本身纳入 compose。后端容器通过环境变量连接现有 Supabase 项目即可。

### 不把每个业务 Controller 拆成微服务

客户、员工、项目、权限、计费、设备等目前共享大量租户上下文、权限、Supabase repository 和领域类型。现在拆成微服务会增加事务一致性、鉴权传播、接口版本和部署成本，不符合当前阶段收益。

## 镜像规划

## 服务器基础环境

API Docker 化后，宿主机不再依赖 nvm、Node、Bun、PM2 来运行 API。运行时应该封装在 Docker 镜像里。

宿主机第一版需要保留 / 安装的是：

| 能力 | 是否需要 | 说明 |
| --- | --- | --- |
| Docker Engine | 必须 | 负责运行 API / worker / admin 容器 |
| Docker Compose v2 | 必须 | 负责编排多个容器 |
| Nginx | 必须，第一版建议宿主机保留 | 继续承接 80/443、HTTPS、反向代理 |
| Certbot / 证书续期能力 | 必须，如果当前证书由宿主机管理 | Nginx 不容器化时继续复用现有证书链路 |
| GitHub Actions Runner | 可选但建议保留 | 如果当前部署由 runner 触发，继续用于拉镜像 / compose up |
| 镜像仓库登录 | 必须，如果使用远程 registry | 例如 GitHub Container Registry / 腾讯云 TCR |
| nvm | 不需要 | 容器化后 API 不靠宿主机 Node 运行 |
| PM2 | 不需要跑新 API；回滚期可保留 | 切换期保留旧 PM2 进程用于回滚，稳定后可移除 |
| Bun | 不需要 | Bun 在 API 镜像里提供 |
| pnpm | 不需要跑 API | Admin 镜像构建阶段可用 pnpm，但宿主机运行时不依赖 |

推荐服务器基础命令：

```bash
docker --version
docker compose version
nginx -v
systemctl status docker
systemctl status nginx
```

如果服务器还没有 Docker：

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

运行用户建议：

```bash
sudo usermod -aG docker ubuntu
```

执行后需要重新登录 shell，或者重启 runner 服务，确保 `ubuntu` / GitHub runner 用户可以执行 Docker 命令。

### 容器内运行时

API 运行镜像内部使用 Bun，不使用 nvm：

```Dockerfile
FROM oven/bun:1.3
```

API 镜像构建阶段可以使用 Node + pnpm 安装依赖：

```Dockerfile
FROM node:22-bookworm-slim AS deps
RUN corepack enable && \
  corepack prepare pnpm@10.33.0 --activate && \
  pnpm install --frozen-lockfile
```

原因：

- 当前 `pnpm-lock.yaml` 已完整覆盖 `apps/api` workspace 依赖。
- 需要固定 `pnpm@10.33.0`，避免 Corepack 在 Docker build 中拉取新版 pnpm 后触发 `packageExtensionsChecksum` 不一致。
- `bun.lock` 更偏向根后端运行依赖，曾在 Docker build 的 `bun install --frozen-lockfile` 阶段失败。
- 最终运行阶段仍然是 Bun，不要求宿主机安装 pnpm、Node、nvm。

Admin 镜像内部可以使用 Node + pnpm，不使用宿主机 nvm：

```Dockerfile
FROM node:22-alpine
RUN corepack enable
```

也就是说：

- 宿主机只负责 Docker、Nginx、证书、compose。
- API 容器自己带 Bun。
- Admin 容器自己带 Node/pnpm。
- worker 复用 API 镜像，也自己带 Bun。

### API 基础镜像

建议路径：

```text
docker/api.Dockerfile
```

建议思路：

```Dockerfile
FROM node:22-bookworm-slim AS deps

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/domain/package.json ./packages/domain/package.json

RUN corepack enable && \
  pnpm install --frozen-lockfile --filter @gooes/api... --filter @gooes/domain...

FROM oven/bun:1.3 AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/domain ./packages/domain

RUN cd packages/domain && bun run build

FROM oven/bun:1.3 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/packages/domain ./packages/domain

WORKDIR /app/apps/api

CMD ["bun", "src/app.ts"]
```

注意：

- 依赖安装使用 `pnpm-lock.yaml`，运行阶段仍使用 Bun。
- `packages/domain` 必须在 builder 阶段构建，否则 API 运行时可能找不到 `@gooes/domain/dist`。

### Worker 复用同一镜像

不新增 worker Dockerfile，compose 中覆盖 command：

```yaml
command: ["bun", "src/workers/social-video-transcription-worker.ts"]
```

## Compose 草案

建议路径：

```text
deploy/docker-compose.backend.yml
```

示例：

```yaml
services:
  api:
    image: goose-api:${GOOSE_IMAGE_TAG:-latest}
    command: ["bun", "src/app.ts"]
    env_file:
      - .env.production
    environment:
      SERVICE_NAME: goose-api
      PORT: "3000"
      NODE_ENV: production
    ports:
      - "3000:3000"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:3000/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3

  social-video-worker:
    image: goose-api:${GOOSE_IMAGE_TAG:-latest}
    command: ["bun", "src/workers/social-video-transcription-worker.ts"]
    env_file:
      - .env.production
    environment:
      SERVICE_NAME: goose-social-video-worker
      NODE_ENV: production
    restart: unless-stopped
    depends_on:
      api:
        condition: service_started

  cos-reconcile-worker:
    image: goose-api:${GOOSE_IMAGE_TAG:-latest}
    command: ["bun", "src/workers/project-log-comment-cos-reconcile-worker.ts"]
    env_file:
      - .env.production
    environment:
      SERVICE_NAME: goose-cos-reconcile-worker
      NODE_ENV: production
    volumes:
      - ./reports:/app/apps/api/reports
    restart: unless-stopped
```

## 环境变量归类

### 所有服务共享

- `NODE_ENV`
- `LOG_LEVEL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `AUTH_IDENTITY_SOURCE`
- `APP_CONFIG_ENCRYPTION_KEY`

### API 需要

- `PORT`
- `H5_MARKETING_BASE_URL`
- `H5_MARKETING_TOKEN_EXPIRES_IN`
- `WECHAT_IDENTITY_CHECK_CACHE_TTL_MS`
- `AUTH_PHONE_LOGIN_WITHOUT_CODE`
- `UPLOAD_TIMING_LOG_ENABLED`
- `UPLOAD_TIMING_LOG_MIN_DURATION_MS`
- `UPLOAD_TIMING_LOG_SCENES`

### COS / 存储需要

- `PLATFORM_COS_BUCKET`
- `PLATFORM_COS_REGION`
- `TENCENT_COS_SECRET_ID`
- `TENCENT_COS_SECRET_KEY`
- `PLATFORM_COS_PUBLIC_BASE_URL`
- `COS_PUBLIC_BASE_URL`
- `PLATFORM_COS_DIRECT_UPLOAD_VERIFY_HEAD`

### AI / 短视频需要

- OpenAI / DeepSeek / 其他模型供应商 key。
- Apify / 抖音解析相关配置。
- `SOCIAL_VIDEO_CHARGE_ENABLED`
- `SOCIAL_VIDEO_CONCURRENCY_LIMIT`
- `SOCIAL_VIDEO_WORKER_POLL_INTERVAL_MS`
- `SOCIAL_VIDEO_STALE_TASK_TIMEOUT_MS`

### 计费需要

- `BILLING_LOW_BALANCE_CREDITS`
- `SMS_CHARGE_ENABLED`
- 后续 billing worker 的 interval / batch size / apply 开关。

### 短信需要

- 阿里云短信相关 key、签名、模板配置。
- `SMS_LOG_HASH_SALT`

## 部署阶段

### Phase 0：准备和基线验证

目标：不改变线上运行方式，只补齐容器化前置条件。

任务：

1. 新增 `/healthz`。
2. 梳理 `.env.production.example`，按服务归类。
3. 确认 `bun.lock` 能完整锁定 workspace 依赖。
4. 给 API、worker 日志统一补 `SERVICE_NAME`。
5. 明确 reports 是否需要挂载 volume。

验收：

- 本地 `bun --filter @gooes/api typecheck` 通过。
- API 启动后 `/healthz` 返回 200。
- worker 单独启动 5 分钟无启动错误。

### Phase 1：单镜像容器化 API

目标：API 先进入 Docker，worker 仍可维持 PM2。

任务：

1. 新增 `docker/api.Dockerfile`。
2. 新增 `.dockerignore`。
3. CI 构建镜像并推送到镜像仓库。
4. 服务器用 Docker 启动 `gooes-api`。
5. Nginx / 网关转发到容器端口。

验收：

- `/healthz` 正常。
- Admin 登录、客户列表、项目列表、图片预览 smoke test 通过。
- 上传签名、COS complete、公开 URL 解析正常。
- 线上 30 分钟内无 5xx 异常升高。

### Phase 2：拆出短视频 worker 容器

目标：短视频转文本长任务从 API/PM2 中隔离。

任务：

1. compose 增加 `social-video-worker`。
2. 设置独立资源限制。
3. 关闭旧 PM2 worker。
4. 验证任务领取和状态回写。

验收：

- 新建短视频转文本任务后能被 worker 领取。
- 成功任务能写回结果。
- 失败任务有明确错误状态。
- 计费冻结 / 扣费 / 释放链路正常。
- API 延迟不受视频任务影响。

### Phase 3：拆出 COS 对账 worker 容器

目标：上传 complete 漏登记兜底任务容器化。

任务：

1. compose 增加 `cos-reconcile-worker`。
2. reports 路径挂载 volume 或输出到 COS。
3. 关闭旧 PM2 对账 worker。
4. 设置 interval、lookback、limit。

验收：

- worker 周期性输出结构化日志。
- 单图、多图评论上传后没有误修复。
- 人工构造漏登记记录时可被对账修复。
- 不出现重复 complete 或错误覆盖业务图片。

### Phase 4：补齐 billing worker

目标：计费第七阶段的后台任务有独立运行载体。

任务：

1. 新增 `src/workers/billing-reconcile-worker.ts`。
2. 实现冻结超时释放、异常账单重试、低余额通知、日汇总。
3. compose 增加 `billing-worker`。

验收：

- 构造超时冻结流水可自动释放。
- 异常账单可重试且不会重复扣费。
- 日汇总数据与明细账能对齐。
- 低余额租户能生成通知或告警。

### Phase 5：全景拼接 worker 独立容器

目标：360 全景拼接不污染 API 镜像。

任务：

1. 新增 Python worker 镜像。
2. 新增 `tenant_panorama_jobs` 后端任务接口。
3. worker 拉取任务、下载 COS 图片、拼接、切瓦片、上传结果。
4. API 查询任务状态和 manifest。

验收：

- 8-16 张合规图片可完成拼接。
- 失败任务有明确错误码和错误原因。
- 输出 manifest 可被 H5 预览页打开。
- worker CPU / 内存飙高时不影响 API。

## CI/CD 建议

第一版 GitHub Actions 可拆成四步：

1. checkout 代码。
2. login GHCR。
3. `docker build -f docker/api.Dockerfile -t ghcr.io/leefo-china/goose-api:feature-multi-tenant .`
4. push 镜像。

注意：

- migration 不建议自动跟随每次部署执行，除非有明确的 migrate gate。
- Supabase migration 应继续人工确认或独立 action 执行。
- worker 发布时要先启动新 worker，再关闭旧 worker，避免任务长时间无人消费。

## 服务器落地建议

当前服务器已经有 GitHub runner 和 PM2 运行习惯。迁移到 Docker 时建议不要一次性替换全部：

1. 先让 Docker API 在非公开端口跑起来。
2. 用 curl 和 Admin 代理 smoke test 验证。
3. Nginx 切流到 Docker API。
4. 保留旧 PM2 API 15-30 分钟，确认无异常后关闭。
5. worker 分批从 PM2 切到 Docker。

回滚方式：

- Nginx 切回旧 PM2 端口。
- 停止 Docker API。
- worker 回滚到 PM2 原命令。

## 风险和处理

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| workspace lockfile 不完整 | 镜像构建不稳定 | Phase 0 先修复 `bun.lock` |
| worker 多副本重复处理任务 | 重复扣费、重复写结果 | 依赖 DB claim RPC 和幂等扣费 |
| 本地 reports 丢失 | 对账结果不可追踪 | volume 或上传 COS |
| API healthcheck 过重 | 第三方抖动导致误杀容器 | healthz 做轻量检查，深度诊断另设接口 |
| 环境变量散落 | 部署不可控 | 建 `.env.production.example` 并按服务归类 |
| 容器内时区不一致 | 日志排查困难 | 统一 UTC 日志，业务展示再转时区 |
| 全景 worker 依赖重 | API 镜像变大、部署慢 | Python worker 单独镜像 |

## 第一批需要新增的文件

```text
docker/api.Dockerfile
.dockerignore
deploy/docker-compose.backend.yml
apps/api/src/controllers/health/index.ts
docs/application_integration_documentation/2026-05-15-backend-docker-deployment-runbook.md
```

其中 runbook 用于记录服务器实际部署命令、端口、Nginx 切流方式、回滚命令。

## 建议下一步

先执行 Phase 0：

1. 新增 `/healthz`。
2. 新增 Dockerfile 草案和 `.dockerignore`。
3. 本地构建 API 镜像验证。
4. 用 compose 在服务器非公开端口启动 API。
5. smoke test 通过后，再决定是否切流。

这个顺序风险最低，也能最快验证当前 Bun workspace 是否适合直接容器化。

## 当前 API 镜像构建口径

GitHub Actions workflow：

```text
.github/workflows/build-api-image.yml
```

推送镜像：

```text
ghcr.io/leefo-china/goose-api:feature-multi-tenant
```

说明：

- Docker 镜像仓库名要求小写，所以使用 `leefo-china`。
- 只保留 `feature-multi-tenant` 一个 tag，方便当前测试环境固定拉取。
- 触发条件为推送到 `feature/multi-tenant`，且变更命中 API、domain、Dockerfile、lockfile 或 workflow。
- 也支持在 GitHub 页面手动 `workflow_dispatch`。

GitHub 仓库需要确认：

```text
Settings -> Actions -> General -> Workflow permissions -> Read and write permissions
```

如果 GHCR package 是 private，服务器需要提前登录：

```bash
echo <github_pat_with_read_packages> | docker login ghcr.io -u LeeFo-china --password-stdin
```

部署时使用：

```bash
export GOOES_API_IMAGE=ghcr.io/leefo-china/goose-api:feature-multi-tenant
```
