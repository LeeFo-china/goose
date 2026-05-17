# GitHub Actions Self-hosted Runner 构建切换记录

日期：2026-05-16

## 背景

GitHub hosted runner 构建业务镜像后推送腾讯 CCR 时，跨境上传耗时过长：

- `goose-api` 推 CCR layers 约 16 分钟。
- `goose-admin` / `goose-social-video-worker` 在优化前经常超过 20 分钟。

镜像瘦身后，服务器本地推 CCR 已验证很快：

- `goose-admin`：423MB，服务器本地推 CCR 约 4 秒。
- `goose-social-video-worker`：325MB，服务器本地推 CCR 约 10 秒。

因此构建链路切到腾讯云 self-hosted runner。

## 当前 runner

仓库当前可用 runner：

```text
name: gooes-prod-vm-0-3
labels: self-hosted, Linux, X64, gooes-build-tencent, gooes-prod-vm-0-3, tencent-cloud
status: online
```

统一镜像构建 workflow 使用：

```yaml
runs-on: [self-hosted, Linux, X64, gooes-build-tencent, gooes-prod-vm-0-3]
```

旧 runner `VM-0-11-ubuntu` 上误挂的 `gooes-build-tencent` 标签已移除。部署 workflow 也增加了 `RUNNER_NAME=gooes-prod-vm-0-3` 与 `/opt/supabase/docker` 存在性校验，避免落到旧服务器。

## 已调整 workflow

```text
.github/workflows/build-docker-images.yml
.github/workflows/deploy-docker-services.yml
```

调整内容：

- 三个镜像构建从分散 workflow 收敛为 `.github/workflows/build-docker-images.yml` matrix。
- 从 `ubuntu-latest` 切到 self-hosted runner。
- 只推送腾讯 CCR，不再在该链路推 GHCR。
- 移除 `docker/setup-buildx-action` / `docker/build-push-action`，避免新服务器下载 GitHub action 包超时。
- 改为直接执行 `docker build` + `docker push`，复用服务器本机 Docker 缓存。
- 移除 `actions/checkout`，避免下载 action 包超时；改为在 runner 本机持久目录执行 `git fetch/reset`。
- 本机 `git fetch` 使用 GitHub token 的 `http.extraheader` 认证，不把 token 写入 remote URL，避免 token 出现在进程参数或本地 git 配置中。
- checkout 步骤默认直连 GitHub，直连 clone/fetch 设置 45 秒超时。若直连 GitHub 偶发超时，workflow 才会自动尝试 `127.0.0.1:18080` SOCKS 代理兜底一次；代理不再作为默认发布路径。
- workflow 会在构建前检查 Docker；如果 runner 缺少 Docker，会通过 `apt-get install docker.io` 安装并启动 Docker daemon。
- `goose-social-video-worker` 构建时传入：

```yaml
ALPINE_MIRROR=https://mirrors.tencent.com/alpine
```

每个镜像会同时推送两个 tag：

```text
feature-multi-tenant
<GITHUB_SHA>
```

其中 `feature-multi-tenant` 用于日常发布，`<GITHUB_SHA>` 用于手动回滚。

Docker 部署 workflow 支持 `workflow_call` 和手动触发。当前 `feature/multi-tenant` 分支中，统一镜像构建 workflow 会在 API、Admin、Worker 三个镜像全部构建成功后通过 `workflow_call` 调用一次部署，执行：

```bash
cd /opt/supabase/docker
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers pull
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers up -d --no-deps --force-recreate ...
```

旧 PM2 部署 workflow `.github/workflows/deploy.yml` 已取消 push 自动触发，仅保留手动触发。

## 当前镜像目标

```text
ccr.ccs.tencentyun.com/gooes-goodcms/goose-api:feature-multi-tenant
ccr.ccs.tencentyun.com/gooes-goodcms/goose-admin:feature-multi-tenant
ccr.ccs.tencentyun.com/gooes-goodcms/goose-social-video-worker:feature-multi-tenant
```

## 后续事项

新业务服务器 `VM-0-3-ubuntu` 已安装专用 runner，服务名：

```text
actions.runner.LeeFo-china-goose.gooes-prod-vm-0-3.service
```

安装目录：

```text
/opt/actions-runner/gooes-build
```

runner 安装包通过加速下载后，使用 GitHub release asset 的官方 `sha256` digest 校验通过。
