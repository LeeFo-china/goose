# 新服务器 GitHub Actions Docker 发布链路跑通摘要

日期：2026-05-17

## 结论

代码从 GitHub 发布到新服务器的链路已跑通。

当前发布路径：

```text
push feature/multi-tenant
  -> GitHub Actions
  -> 新服务器 self-hosted runner: gooes-prod-vm-0-3
  -> docker build
  -> push 腾讯 CCR
  -> Docker deploy workflow
  -> 新服务器 /opt/supabase/docker
  -> docker compose pull
  -> docker compose up -d --force-recreate
  -> 容器健康检查
  -> 公网域名检查
```

## 关键 workflow

镜像构建：

```text
.github/workflows/build-docker-images.yml
```

Docker 部署：

```text
.github/workflows/deploy-docker-services.yml
```

旧 PM2 部署：

```text
.github/workflows/deploy.yml
```

旧 PM2 workflow 已取消 push 自动触发，仅保留 `workflow_dispatch` 手动入口，作为老服务器兼容和紧急回退入口。

## Runner 约束

构建和部署统一固定到新服务器 runner：

```yaml
runs-on: [self-hosted, Linux, X64, gooes-build-tencent, gooes-prod-vm-0-3]
```

部署 workflow 额外做运行时防线：

```text
RUNNER_NAME 必须等于 gooes-prod-vm-0-3
/opt/supabase/docker 必须存在
```

处理过的问题：

- 旧 runner `VM-0-11-ubuntu` 曾误挂 `gooes-build-tencent` 标签，导致 deploy 落到旧服务器并失败。
- 已通过 GitHub API 移除旧 runner 上的 `gooes-build-tencent` 标签。
- workflow 增加 `gooes-prod-vm-0-3` 标签，避免再次误投递。

## 镜像仓库

当前业务镜像统一推送到腾讯 CCR：

```text
ccr.ccs.tencentyun.com/gooes-goodcms/goose-api:feature-multi-tenant
ccr.ccs.tencentyun.com/gooes-goodcms/goose-admin:feature-multi-tenant
ccr.ccs.tencentyun.com/gooes-goodcms/goose-social-video-worker:feature-multi-tenant
```

新服务器 `/opt/supabase/docker/.env` 中已经配置：

```text
GOOES_API_IMAGE=ccr.ccs.tencentyun.com/gooes-goodcms/goose-api:feature-multi-tenant
GOOES_ADMIN_IMAGE=ccr.ccs.tencentyun.com/gooes-goodcms/goose-admin:feature-multi-tenant
GOOES_SOCIAL_VIDEO_WORKER_IMAGE=ccr.ccs.tencentyun.com/gooes-goodcms/goose-social-video-worker:feature-multi-tenant
```

## 部署服务

Docker deploy 会拉取并重建：

```text
gooes-api
gooes-admin
gooes-social-video-worker
gooes-cos-reconcile-worker
```

重建顺序：

```text
1. gooes-api
2. gooes-social-video-worker / gooes-cos-reconcile-worker
3. gooes-admin
```

## 验证记录

首次跑通验证提交：

```text
50df0c7 ci(deploy): pin docker deploy runner
```

发布链路随后已收敛为单 workflow matrix，收敛后入口：

```text
Build Docker Images
  - Build api
  - Build social-video-worker
  - Build admin
  - deploy / deploy
```

matrix 收敛验证通过的提交：

```text
0a10fb8 ci(deploy): consolidate docker image release workflow
```

GitHub Actions 验证结果：

```text
Build api: success
Build social-video-worker: success
Build admin: success
deploy / deploy: success
```

说明：

- 当前正常链路只触发一次 deploy。
- deploy workflow 仍保留 concurrency：

```text
deploy-docker-services-feature-multi-tenant
```

- concurrency 主要用于手动重跑或异常重复触发时保护生产部署。

新服务器容器状态验证：

```text
gooes-api: healthy
gooes-admin: healthy
gooes-social-video-worker: healthy
gooes-cos-reconcile-worker: healthy
```

公网域名验证：

```text
https://api.goodcms.cn/        HTTP 200
https://admin.goodcms.cn/login HTTP 200
```

## 当前发布方式

日常发布只需要：

```bash
git push origin feature/multi-tenant
```

发布后观察：

```bash
gh run list --repo LeeFo-china/goose --branch feature/multi-tenant --limit 10
```

服务器容器状态：

```bash
ssh -i /Users/leefo/Public/work/miju/goose-main ubuntu@1.13.20.39 \
  'docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | grep -E "gooes-|NAMES"'
```

域名检查：

```bash
curl -sS -o /dev/null -w 'api %{http_code} %{time_total}\n' https://api.goodcms.cn/
curl -sS -o /dev/null -w 'admin %{http_code} %{time_total}\n' https://admin.goodcms.cn/login
```

## 后续建议

1. 观察 2-3 次正常业务发布，确认自动 deploy 稳定。
2. 稳定后可以归档旧 PM2 deploy workflow。
3. 运维页主监控口径切到 Docker 容器健康状态，PM2 入口只作为旧服务器兼容信息保留或隐藏。
4. 后续如需减少重复 deploy，可再升级为“统一 build matrix + 单 deploy job”的发布结构。
