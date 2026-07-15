# Docker 发布 SHA Tag 与手动回滚方案

日期：2026-05-17

> **归档警告：全文不可执行。** 本文中的日常 push、直接 Compose 发布、手动 `.env` 回滚和
> 恢复命令均已退役，禁止执行。本文只保留 2026-05-17 的历史流程结构，镜像路径仅作美国
> 仓库目标映射，不表示生产已部署。所有当前发布、Strategy B、回滚和生产 Web 操作均由
> `docs/2026-07-15-tencent-ccr-us-migration-runbook.md` 取代。

## 目标

2026-05-17 生产发布曾默认使用固定分支 tag：

```text
feature-multi-tenant
```

固定 tag 当时用于日常发布，并同时推送 commit SHA tag 作为历史回滚点。该策略不是当前
production 发布入口。

## 历史构建策略记录

统一构建 workflow：

```text
.github/workflows/build-docker-images.yml
```

每个服务当时会同时推送两个 tag：

```text
<image>:feature-multi-tenant
<image>:<GITHUB_SHA>
```

验证通过的提交：

```text
e4afe351e44d177d0fbc430edefb01e78cb5cae5
```

该提交已验证：

```text
Build api: success
Build social-video-worker: success
Build admin: success
deploy / deploy: success
```

当日服务器记录中，三类镜像的 `feature-multi-tenant` 与上述 SHA tag 指向同一个 image id。

三类镜像：

```text
useccr.ccs.tencentyun.com/america_goose/goose-api:feature-multi-tenant
useccr.ccs.tencentyun.com/america_goose/goose-api:<commit-sha>

useccr.ccs.tencentyun.com/america_goose/goose-admin:feature-multi-tenant
useccr.ccs.tencentyun.com/america_goose/goose-admin:<commit-sha>

useccr.ccs.tencentyun.com/america_goose/goose-social-video-worker:feature-multi-tenant
useccr.ccs.tencentyun.com/america_goose/goose-social-video-worker:<commit-sha>
```

## 历史日常发布示例（不可执行）

以下 push 入口已经退役，禁止执行：

```bash
git push origin feature/multi-tenant
```

以下 `.env` 只保留当日映射结构，已规范化为美国仓库路径，不代表生产 active `.env`：

```text
GOOES_API_IMAGE=useccr.ccs.tencentyun.com/america_goose/goose-api:feature-multi-tenant
GOOES_ADMIN_IMAGE=useccr.ccs.tencentyun.com/america_goose/goose-admin:feature-multi-tenant
GOOES_SOCIAL_VIDEO_WORKER_IMAGE=useccr.ccs.tencentyun.com/america_goose/goose-social-video-worker:feature-multi-tenant
```

## 历史手动回滚示例（不可执行）

假设要回滚到：

```text
<rollback-sha>
```

以下命令块已经退役，禁止在服务器执行：

```bash
cd /opt/supabase/docker
cp .env ".env.bak.rollback.$(date +%Y%m%d%H%M%S)"

sed -i \
  -e 's#^GOOES_API_IMAGE=.*#GOOES_API_IMAGE=useccr.ccs.tencentyun.com/america_goose/goose-api:<rollback-sha>#' \
  -e 's#^GOOES_ADMIN_IMAGE=.*#GOOES_ADMIN_IMAGE=useccr.ccs.tencentyun.com/america_goose/goose-admin:<rollback-sha>#' \
  -e 's#^GOOES_SOCIAL_VIDEO_WORKER_IMAGE=.*#GOOES_SOCIAL_VIDEO_WORKER_IMAGE=useccr.ccs.tencentyun.com/america_goose/goose-social-video-worker:<rollback-sha>#' \
  .env
```

以下拉取和重建命令已经退役，禁止执行：

```bash
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers pull

docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers up -d --no-deps --force-recreate \
  gooes-api \
  gooes-social-video-worker \
  gooes-cos-reconcile-worker \
  gooes-admin
```

以下验证命令仅记录当日流程，不得作为当前回滚步骤执行：

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' | grep -E 'gooes-|NAMES'

curl -sS -o /dev/null -w 'api %{http_code} %{time_total}\n' https://api.goodcms.cn/
curl -sS -o /dev/null -w 'admin %{http_code} %{time_total}\n' https://admin.goodcms.cn/login
```

验收标准：

```text
gooes-api healthy
gooes-admin healthy
gooes-social-video-worker healthy
gooes-cos-reconcile-worker healthy
api.goodcms.cn 返回 200
admin.goodcms.cn/login 返回 200
```

## 历史恢复分支 Tag 示例（不可执行）

以下恢复命令已经退役，禁止执行：

```bash
cd /opt/supabase/docker
cp .env ".env.bak.restore-branch-tag.$(date +%Y%m%d%H%M%S)"

sed -i \
  -e 's#^GOOES_API_IMAGE=.*#GOOES_API_IMAGE=useccr.ccs.tencentyun.com/america_goose/goose-api:feature-multi-tenant#' \
  -e 's#^GOOES_ADMIN_IMAGE=.*#GOOES_ADMIN_IMAGE=useccr.ccs.tencentyun.com/america_goose/goose-admin:feature-multi-tenant#' \
  -e 's#^GOOES_SOCIAL_VIDEO_WORKER_IMAGE=.*#GOOES_SOCIAL_VIDEO_WORKER_IMAGE=useccr.ccs.tencentyun.com/america_goose/goose-social-video-worker:feature-multi-tenant#' \
  .env
```

以下直接 Compose 命令已经退役，禁止执行：

```bash
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers pull
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers up -d --no-deps --force-recreate \
  gooes-api \
  gooes-social-video-worker \
  gooes-cos-reconcile-worker \
  gooes-admin
```

## 历史说明

1. 当日方案要求回滚 SHA 已成功构建并推送腾讯 CCR。
2. 当日方案会把三个服务一起切到同一个 SHA。
3. 当日方案会修改 `/opt/supabase/docker/.env` 并要求先备份。
4. 上述行为均不是当前操作授权；当前回滚必须使用 2026-07-15 Runbook 和不可变构建证据。
