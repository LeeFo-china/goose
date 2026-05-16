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

三个镜像构建 workflow 统一使用：

```yaml
runs-on: [self-hosted, Linux, X64, gooes-build-tencent]
```

## 已调整 workflow

```text
.github/workflows/build-api-image.yml
.github/workflows/build-admin-image.yml
.github/workflows/build-social-video-worker-image.yml
```

调整内容：

- 从 `ubuntu-latest` 切到 self-hosted runner。
- 只推送腾讯 CCR，不再在该链路推 GHCR。
- 移除 `docker/setup-buildx-action` / `docker/build-push-action`，避免新服务器下载 GitHub action 包超时。
- 改为直接执行 `docker build` + `docker push`，复用服务器本机 Docker 缓存。
- workflow 会在构建前检查 Docker；如果 runner 缺少 Docker，会通过 `apt-get install docker.io` 安装并启动 Docker daemon。
- `goose-social-video-worker` 构建时传入：

```yaml
ALPINE_MIRROR=https://mirrors.tencent.com/alpine
```

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
