# Docker 发布 SHA Tag 与手动回滚方案

日期：2026-05-17

## 目标

当前生产发布默认使用固定分支 tag：

```text
feature-multi-tenant
```

固定 tag 便于日常发布，但每次发布都会覆盖同一个 tag。为了支持快速回滚，镜像构建需要同时推送 commit SHA tag。

## 已调整构建策略

统一构建 workflow：

```text
.github/workflows/build-docker-images.yml
```

每个服务现在会同时推送两个 tag：

```text
<image>:feature-multi-tenant
<image>:<GITHUB_SHA>
```

三类镜像：

```text
ccr.ccs.tencentyun.com/gooes-goodcms/goose-api:feature-multi-tenant
ccr.ccs.tencentyun.com/gooes-goodcms/goose-api:<commit-sha>

ccr.ccs.tencentyun.com/gooes-goodcms/goose-admin:feature-multi-tenant
ccr.ccs.tencentyun.com/gooes-goodcms/goose-admin:<commit-sha>

ccr.ccs.tencentyun.com/gooes-goodcms/goose-social-video-worker:feature-multi-tenant
ccr.ccs.tencentyun.com/gooes-goodcms/goose-social-video-worker:<commit-sha>
```

## 日常发布

日常发布方式不变：

```bash
git push origin feature/multi-tenant
```

生产服务器 `/opt/supabase/docker/.env` 默认仍使用：

```text
GOOES_API_IMAGE=ccr.ccs.tencentyun.com/gooes-goodcms/goose-api:feature-multi-tenant
GOOES_ADMIN_IMAGE=ccr.ccs.tencentyun.com/gooes-goodcms/goose-admin:feature-multi-tenant
GOOES_SOCIAL_VIDEO_WORKER_IMAGE=ccr.ccs.tencentyun.com/gooes-goodcms/goose-social-video-worker:feature-multi-tenant
```

## 手动回滚步骤

假设要回滚到：

```text
<rollback-sha>
```

在新服务器执行：

```bash
cd /opt/supabase/docker
cp .env ".env.bak.rollback.$(date +%Y%m%d%H%M%S)"

sed -i \
  -e 's#^GOOES_API_IMAGE=.*#GOOES_API_IMAGE=ccr.ccs.tencentyun.com/gooes-goodcms/goose-api:<rollback-sha>#' \
  -e 's#^GOOES_ADMIN_IMAGE=.*#GOOES_ADMIN_IMAGE=ccr.ccs.tencentyun.com/gooes-goodcms/goose-admin:<rollback-sha>#' \
  -e 's#^GOOES_SOCIAL_VIDEO_WORKER_IMAGE=.*#GOOES_SOCIAL_VIDEO_WORKER_IMAGE=ccr.ccs.tencentyun.com/gooes-goodcms/goose-social-video-worker:<rollback-sha>#' \
  .env
```

拉取并重建：

```bash
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers pull

docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers up -d --no-deps --force-recreate \
  gooes-api \
  gooes-social-video-worker \
  gooes-cos-reconcile-worker \
  gooes-admin
```

验证：

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

## 恢复到正常滚动发布

回滚验证完成后，如果需要恢复到默认分支 tag：

```bash
cd /opt/supabase/docker
cp .env ".env.bak.restore-branch-tag.$(date +%Y%m%d%H%M%S)"

sed -i \
  -e 's#^GOOES_API_IMAGE=.*#GOOES_API_IMAGE=ccr.ccs.tencentyun.com/gooes-goodcms/goose-api:feature-multi-tenant#' \
  -e 's#^GOOES_ADMIN_IMAGE=.*#GOOES_ADMIN_IMAGE=ccr.ccs.tencentyun.com/gooes-goodcms/goose-admin:feature-multi-tenant#' \
  -e 's#^GOOES_SOCIAL_VIDEO_WORKER_IMAGE=.*#GOOES_SOCIAL_VIDEO_WORKER_IMAGE=ccr.ccs.tencentyun.com/gooes-goodcms/goose-social-video-worker:feature-multi-tenant#' \
  .env
```

然后重新执行：

```bash
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers pull
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers up -d --no-deps --force-recreate \
  gooes-api \
  gooes-social-video-worker \
  gooes-cos-reconcile-worker \
  gooes-admin
```

## 注意事项

1. 回滚 SHA 必须是已经成功构建并推送过腾讯 CCR 的提交。
2. 当前回滚是三个服务一起切到同一个 SHA，避免 API/Admin/Worker 版本不一致。
3. 回滚会修改 `/opt/supabase/docker/.env`，操作前必须保留备份。
4. 回滚后下一次正常 push 发布会重新把 `feature-multi-tenant` 指向最新镜像。
5. 后续可以增加手动 rollback workflow，输入 `rollback_sha` 后自动执行上述步骤。
