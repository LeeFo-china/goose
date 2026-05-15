# 2026-05-16 Admin 容器化发布流程规范

## 1. 目标

将 Admin 从“服务器本地临时构建”规范为仓库内可复现的容器化发布流程。

目标链路：

```text
提交代码 -> GitHub Actions 构建 Admin 镜像 -> 推送 GHCR -> 服务器拉取镜像并重启 gooes-admin
```

## 2. 仓库新增内容

| 文件 | 作用 |
| --- | --- |
| `docker/admin.Dockerfile` | Admin 生产镜像构建定义 |
| `.github/workflows/build-admin-image.yml` | GitHub Actions 自动构建并推送 Admin 镜像 |
| `deploy/docker-compose.admin.yml` | 新服务器 Admin compose 片段 |
| `deploy/.env.admin.example` | Admin 环境变量模板 |

## 3. 镜像

Admin 镜像：

```text
ghcr.io/leefo-china/goose-admin:feature-multi-tenant
```

构建阶段：

- 使用 `node:22-bookworm-slim`。
- 固定 `pnpm@10.33.0`。
- 安装 `bun@1.3.2` 用于构建 `packages/domain`。
- 执行：

```bash
cd packages/domain && bun run build
pnpm --dir apps/admin build
```

运行阶段：

```bash
pnpm start
```

默认监听：

```text
0.0.0.0:3010
```

## 4. 环境变量

服务器保留 `.env.admin`，不提交真实环境变量。

模板见：

```text
deploy/.env.admin.example
```

关键变量：

| 变量 | 说明 | 推荐值 |
| --- | --- | --- |
| `GOOES_ADMIN_IMAGE` | Admin 镜像 | `ghcr.io/leefo-china/goose-admin:feature-multi-tenant` |
| `GOOES_API_BASE_URL` | Admin 服务端访问 API 地址 | `http://gooes-api:3000` |
| `NEXT_PUBLIC_GOOES_API_BASE_URL` | 浏览器侧 API 公网地址 | `https://api.goodcms.cn` |
| `NEXT_PUBLIC_GOOES_H5_BASE_URL` | 浏览器侧 H5 公网地址 | `https://h5.goodcms.cn` |
| `GOOES_ADMIN_HOST_PORT` | 宿主机端口 | `3010` |

注意：

- `NEXT_PUBLIC_*` 会在 Next.js 构建时写入前端包。
- 若未来需要切换公网域名，需要重新构建 Admin 镜像。
- Admin 服务端 BFF 调 API 使用 `GOOES_API_BASE_URL`，运行时可通过 `.env.admin` 调整。

## 5. GitHub Actions

Workflow：

```text
.github/workflows/build-admin-image.yml
```

触发条件：

- push 到 `feature/multi-tenant`
- 手动 `workflow_dispatch`

路径触发范围：

```text
apps/admin/**
packages/domain/**
docker/admin.Dockerfile
.dockerignore
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
tsconfig.base.json
```

需要 GitHub 设置：

- `Settings -> Actions -> General -> Workflow permissions`
- 选择 `Read and write permissions`

## 6. 服务器发布命令

在新服务器 `/opt/supabase/docker` 执行：

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.api.yml \
  -f docker-compose.admin.yml \
  pull gooes-admin
```

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.api.yml \
  -f docker-compose.admin.yml \
  up -d gooes-admin
```

验证：

```bash
docker ps --filter name=gooes-admin
curl -I http://127.0.0.1:3010/login
curl -I https://admin.goodcms.cn/login
```

## 7. 发布验收标准

1. GitHub Actions `Build Admin Image` 成功。
2. GHCR 出现 `goose-admin:feature-multi-tenant` 新镜像。
3. 新服务器 `docker compose pull gooes-admin` 能成功拉取镜像。
4. `gooes-admin` 容器状态为 `healthy`。
5. `https://admin.goodcms.cn/login` 返回非 5xx。
6. 登录后能正常访问平台概览、租户后台常用页面。

## 8. 后续优化

第一版先采用“自动构建镜像，服务器手动拉取重启”。

后续可继续推进：

1. 增加服务器自动部署 workflow。
2. Admin 镜像改为 Next standalone，进一步减小镜像体积。
3. API 和 Admin 使用统一 release tag，而不是固定分支 tag。
4. 增加镜像 SBOM 和漏洞扫描。
