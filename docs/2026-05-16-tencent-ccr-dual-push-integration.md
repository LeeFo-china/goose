# 腾讯云 CCR 双推接入记录

日期：2026-05-16

## 背景

新服务器从 GHCR 拉取私有镜像时，尤其是包含 ffmpeg 的 `goose-social-video-worker`，大层下载非常慢。已验证 SSH SOCKS 代理不能稳定解决该问题，因此切换到腾讯云 CCR/TCR 作为国内镜像源。

本次使用的是腾讯云容器镜像个人版：

```text
Registry: ccr.ccs.tencentyun.com
Region: ap-guangzhou
OwnerUin: 100010381037
Uin: 100010381037
```

密码只配置在服务器 Docker 登录态和 GitHub Secrets 中，严禁写入仓库。

## 已验证

### 1. 新服务器 Docker 登录 CCR 成功

登录命令口径：

```bash
docker login ccr.ccs.tencentyun.com -u 100010381037
```

结果：

```text
tcr_login_ok
```

### 2. Docker daemon 代理需要绕过 CCR

因为新服务器之前配置了 GHCR SOCKS 代理，`ccr.ccs.tencentyun.com` 如果也走美国老服务器代理，会导致登录超时。

已把 CCR 加入 Docker `NO_PROXY`：

```text
ccr.ccs.tencentyun.com
```

配置位置：

```text
/etc/systemd/system/docker.service.d/ghcr-proxy.conf
```

当前 Docker 代理仍保留给 GHCR 使用，但 CCR 不走代理。

### 3. 命名空间已确认

已尝试推送一个极小 probe 镜像：

```text
ccr.ccs.tencentyun.com/gooes-goodcms/gooes-probe:<timestamp>
```

结果成功，当前有效命名空间为：

```text
gooes-goodcms
```

已验证 `gooes` / `100010381037` 不是当前可推送命名空间，不能作为正式镜像路径。

### 4. 业务镜像已推送并可读取 manifest

已在新服务器推送并验证：

```text
ccr.ccs.tencentyun.com/gooes-goodcms/goose-api:feature-multi-tenant
ccr.ccs.tencentyun.com/gooes-goodcms/goose-admin:feature-multi-tenant
ccr.ccs.tencentyun.com/gooes-goodcms/goose-social-video-worker:feature-multi-tenant
```

三类镜像 `docker manifest inspect` 均通过。

### 5. 新服务器业务容器已切换到 CCR 镜像

当前运行口径：

```text
gooes-api                      ccr.ccs.tencentyun.com/gooes-goodcms/goose-api:feature-multi-tenant
gooes-admin                    ccr.ccs.tencentyun.com/gooes-goodcms/goose-admin:feature-multi-tenant
gooes-social-video-worker      ccr.ccs.tencentyun.com/gooes-goodcms/goose-social-video-worker:feature-multi-tenant
gooes-cos-reconcile-worker     ccr.ccs.tencentyun.com/gooes-goodcms/goose-api:feature-multi-tenant
```

健康检查均为 `healthy`，域名验证：

```text
https://admin.goodcms.cn/login -> 200
https://api.goodcms.cn/        -> 200
```

## 仓库代码已完成

已改造三个 GitHub Actions，使其同时推送 GHCR + 腾讯 CCR：

| Workflow | GHCR 镜像 | CCR 镜像 |
| --- | --- | --- |
| `.github/workflows/build-api-image.yml` | `ghcr.io/leefo-china/goose-api:feature-multi-tenant` | `ccr.ccs.tencentyun.com/<namespace>/goose-api:feature-multi-tenant` |
| `.github/workflows/build-admin-image.yml` | `ghcr.io/leefo-china/goose-admin:feature-multi-tenant` | `ccr.ccs.tencentyun.com/<namespace>/goose-admin:feature-multi-tenant` |
| `.github/workflows/build-social-video-worker-image.yml` | `ghcr.io/leefo-china/goose-social-video-worker:feature-multi-tenant` | `ccr.ccs.tencentyun.com/<namespace>/goose-social-video-worker:feature-multi-tenant` |

当前 workflow 已要求 CCR 变量/密钥必须存在；未配置时会失败，避免发布链路表面成功但国内镜像未更新。

## GitHub 需要配置

Repository Variables：

```text
TENCENT_CCR_NAMESPACE=<腾讯云 CCR 命名空间>
```

Repository Secrets：

```text
TENCENT_CCR_USERNAME=100010381037
TENCENT_CCR_PASSWORD=<腾讯云 CCR 登录密码>
```

当前 namespace：

```text
gooes-goodcms
```

GitHub Repository Variables 需要配置为：

```text
TENCENT_CCR_NAMESPACE=gooes-goodcms
```

GitHub Repository Secrets 需要配置：

```text
TENCENT_CCR_USERNAME=100010381037
TENCENT_CCR_PASSWORD=<腾讯云 CCR 登录密码>
```

## 服务器 compose 切换口径

`/opt/supabase/docker/.env` 必须包含：

```text
GOOES_API_IMAGE=ccr.ccs.tencentyun.com/gooes-goodcms/goose-api:feature-multi-tenant
GOOES_ADMIN_IMAGE=ccr.ccs.tencentyun.com/gooes-goodcms/goose-admin:feature-multi-tenant
GOOES_SOCIAL_VIDEO_WORKER_IMAGE=ccr.ccs.tencentyun.com/gooes-goodcms/goose-social-video-worker:feature-multi-tenant
```

注意：`GOOES_ADMIN_IMAGE` 不能只放在 `.env.admin`。`docker compose` 的 `image:` 字段插值默认读取 `.env`，服务内的 `env_file: .env.admin` 只会注入容器运行时环境变量，不参与 compose 文件插值。

部署命令：

```bash
cd /opt/supabase/docker
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers pull
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers up -d
```

## 验收标准

1. GitHub Actions 三个 workflow 均成功。
2. 腾讯 CCR 控制台能看到三类镜像：
   - `goose-api`
   - `goose-admin`
   - `goose-social-video-worker`
3. 新服务器 `docker pull ccr.ccs.tencentyun.com/<namespace>/goose-social-video-worker:feature-multi-tenant` 能在合理时间内完成。
4. 业务容器启动后均为 healthy：
   - `gooes-api`
   - `gooes-admin`
   - `gooes-social-video-worker`
   - `gooes-cos-reconcile-worker`
5. 域名返回正常：
   - `https://api.goodcms.cn/`
   - `https://admin.goodcms.cn/login`

## 当前状态

CCR 命名空间、服务器登录、镜像推送、manifest 验证、compose 切换、容器健康检查、外网域名访问均已通过。

后续发布时，GitHub Actions 成功后新服务器可直接执行：

```bash
cd /opt/supabase/docker
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers pull
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers up -d --no-deps --force-recreate gooes-api gooes-admin gooes-social-video-worker gooes-cos-reconcile-worker
```
