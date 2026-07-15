# 容器发布链路与 Nginx 稳定性收口

日期：2026-05-16

> 2026-07-15 运维口径更新：本文保留 2026-05-16 的流程背景，镜像路径和可复制命令已
> 统一更新为美国仓库目标。当前迁移边界、production Strategy B 和生产 Web 独立发布链
> 以 `docs/2026-07-15-tencent-ccr-us-migration-runbook.md` 为准；路径更新不表示生产已部署。

## 目标

新服务器已经切到 Docker Compose 部署，后续发布需要满足：

- 代码 push 后由 GitHub Actions 构建业务镜像。
- 服务器通过 `docker compose pull && docker compose up -d` 更新。
- Admin/API 容器重建后，Nginx 不需要人工 reload 也能重新解析新容器 IP。
- 超管运维页以 Docker 容器健康状态作为主监控口径。

## 镜像构建口径

| 服务 | 镜像 | Dockerfile | 工作流 |
| --- | --- | --- | --- |
| API | `useccr.ccs.tencentyun.com/america_goose/goose-api:feature-multi-tenant` | `docker/api.Dockerfile` | `.github/workflows/build-docker-images.yml` |
| Admin | `useccr.ccs.tencentyun.com/america_goose/goose-admin:feature-multi-tenant` | `docker/admin.Dockerfile` | `.github/workflows/build-docker-images.yml` |
| 视频转文本 Worker | `useccr.ccs.tencentyun.com/america_goose/goose-social-video-worker:feature-multi-tenant` | `docker/social-video-worker.Dockerfile` | `.github/workflows/build-docker-images.yml` |

### 调整点

- 三个镜像构建已合并为一个 matrix workflow：`.github/workflows/build-docker-images.yml`。
- matrix 构建顺序为 API、视频转文本 Worker、Admin，并设置 `max-parallel: 1`，避免多个 job 并发覆盖 runner 本机持久源码目录。
- 三个镜像全部构建成功后，只触发一次 Docker deploy。
- 每个镜像会同时推送固定 tag `feature-multi-tenant` 和 commit SHA tag，SHA tag 用于手动回滚。
- Worker 镜像构建时传入 `ALPINE_MIRROR=https://mirrors.tencent.com/alpine`。

## 服务器部署命令

服务器目录：

```bash
cd /opt/supabase/docker
```

拉取并重建业务服务：

```bash
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers pull
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers up -d
```

只更新 Admin：

```bash
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml up -d --no-deps --force-recreate gooes-admin
```

只更新 API 和 Worker：

```bash
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers up -d --no-deps --force-recreate gooes-api gooes-social-video-worker gooes-cos-reconcile-worker
```

## GitHub Actions 自动部署

已新增 Docker 自动部署 workflow：

```text
.github/workflows/deploy-docker-services.yml
```

触发口径：

- `Build Docker Images`

当前 `feature/multi-tenant` 分支的自动部署由统一镜像构建 workflow 在 matrix 全部成功后通过 `workflow_call` 直接调用：

```text
.github/workflows/build-docker-images.yml
```

构建 workflow 的 `paths` 包含 `.github/workflows/deploy-docker-services.yml`，因此部署脚本自身调整也会触发一次完整构建和部署验证。

部署 workflow 保留 concurrency 防线：

```text
deploy-docker-services-feature-multi-tenant
```

当前正常链路只会触发一次 deploy；concurrency 主要用于手动重跑或异常重复触发时保护生产部署。

runner 约束：

```yaml
runs-on: [self-hosted, Linux, X64, gooes-build-tencent, gooes-prod-vm-0-3]
```

旧 runner `VM-0-11-ubuntu` 上误挂的 `gooes-build-tencent` 标签已移除；部署 workflow 还会校验 `RUNNER_NAME=gooes-prod-vm-0-3` 和 `/opt/supabase/docker` 目录，避免部署落到旧服务器。

部署步骤：

1. 在新服务器 runner 上拉取当前提交的 `deploy/docker-compose.api.yml` 与 `deploy/docker-compose.admin.yml`。
2. 同步 compose 片段到 `/opt/supabase/docker`，同步前保留 `*.bak.github-actions-<run_id>` 备份。
3. 登录腾讯 CCR。
4. 拉取最新镜像：
   - `gooes-api`
   - `gooes-admin`
   - `gooes-social-video-worker`
   - `gooes-cos-reconcile-worker`
5. 按顺序重建容器：
   - API
   - Worker
   - Admin
6. 检查容器健康状态。
7. 检查外部域名：
   - `https://api.goodcms.cn/`
   - `https://admin.goodcms.cn/login`

旧 PM2 部署 workflow：

```text
.github/workflows/deploy.yml
```

已经从 push 自动触发中移除，仅保留 `workflow_dispatch` 手动触发，作为老服务器兼容和紧急回退入口。

## Nginx 动态解析

问题背景：

- Nginx 原配置使用静态 upstream：
  - `gooes-admin:3010`
  - `gooes-api:3000`
- Docker 容器重建后 IP 会变化。
- Nginx 旧 worker 可能继续持有旧 upstream IP，导致 `502 Bad Gateway`。

当前服务器已将业务域名代理改为 Docker DNS 动态解析：

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;

location / {
    set $gooes_admin_upstream http://gooes-admin:3010;
    proxy_pass $gooes_admin_upstream;
}
```

API 和 H5 内部 API 代理同样使用：

```nginx
set $gooes_api_upstream http://gooes-api:3000;
proxy_pass $gooes_api_upstream;
```

360 上传代理使用：

```nginx
set $gooes_panorama_upload_upstream http://host.docker.internal:5179;
rewrite ^/__360-upload/(.*)$ /$1 break;
proxy_pass $gooes_panorama_upload_upstream;
```

服务器模板位置：

```text
/opt/supabase/docker/volumes/proxy/nginx/supabase-nginx.conf.tpl
```

修改后生成并 reload：

```bash
docker exec supabase-nginx sh -lc \
  'envsubst '\''${PROXY_DOMAIN}'\'' < /etc/nginx/supabase-nginx.conf.tpl > /etc/nginx/user_conf.d/nginx.conf && nginx -t && nginx -s reload'
```

## 验收记录

已完成验证：

- `gooes-admin` 重建后状态为 `healthy`。
- 不手动 reload Nginx，`https://admin.goodcms.cn/login` 连续返回 `HTTP/2 200`。
- `https://api.goodcms.cn/` 返回 `HTTP/2 200`。
- 四个业务容器均在 `supabase_default` 网络：
  - `gooes-api`
  - `gooes-admin`
  - `gooes-social-video-worker`
  - `gooes-cos-reconcile-worker`

## 后续建议

- 观察 2-3 次 push 发布，确认 Docker 自动部署稳定后，可归档旧 PM2 deploy workflow。
- 运维页后续可以隐藏 PM2 脚本入口，保留为旧服务器兼容项，主入口切到 Docker 服务健康。
