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

### 3. 命名空间仍缺失或不匹配

已尝试推送一个极小 probe 镜像：

```text
ccr.ccs.tencentyun.com/gooes/gooes-probe:<timestamp>
ccr.ccs.tencentyun.com/100010381037/gooes-probe:<timestamp>
```

结果均失败：

```text
no permission! are you logined with another ccr account?
```

判断：

- 账号登录有效。
- 当前缺少可推送的 CCR namespace，或者 namespace 不是 `gooes` / `100010381037`。
- 需要在腾讯云控制台创建或确认命名空间。

## 仓库代码已完成

已改造三个 GitHub Actions，使其支持 GHCR + 腾讯 CCR 条件双推：

| Workflow | GHCR 镜像 | CCR 镜像 |
| --- | --- | --- |
| `.github/workflows/build-api-image.yml` | `ghcr.io/leefo-china/goose-api:feature-multi-tenant` | `ccr.ccs.tencentyun.com/<namespace>/goose-api:feature-multi-tenant` |
| `.github/workflows/build-admin-image.yml` | `ghcr.io/leefo-china/goose-admin:feature-multi-tenant` | `ccr.ccs.tencentyun.com/<namespace>/goose-admin:feature-multi-tenant` |
| `.github/workflows/build-social-video-worker-image.yml` | `ghcr.io/leefo-china/goose-social-video-worker:feature-multi-tenant` | `ccr.ccs.tencentyun.com/<namespace>/goose-social-video-worker:feature-multi-tenant` |

如果 GitHub 未配置 CCR 变量/密钥，workflow 仍只推 GHCR，不会失败。

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

建议 namespace：

```text
gooes
```

如果腾讯云控制台不允许 `gooes`，以控制台实际创建的 namespace 为准。

## 腾讯云控制台需要操作

进入：

```text
容器镜像服务 -> 个人版 -> 命名空间
```

创建或确认命名空间，例如：

```text
gooes
```

创建后，在新服务器验证：

```bash
docker tag ghcr.io/leefo-china/goose-api:feature-multi-tenant \
  ccr.ccs.tencentyun.com/gooes/goose-api:feature-multi-tenant

docker push ccr.ccs.tencentyun.com/gooes/goose-api:feature-multi-tenant
```

如果 push 成功，再切 compose 镜像源。

## 服务器 compose 切换口径

当前 `/opt/supabase/docker/.env` 里仍使用 GHCR：

```text
GOOES_API_IMAGE=ghcr.io/leefo-china/goose-api:feature-multi-tenant
```

命名空间确认并完成镜像推送后，切换为：

```text
GOOES_API_IMAGE=ccr.ccs.tencentyun.com/<namespace>/goose-api:feature-multi-tenant
GOOES_ADMIN_IMAGE=ccr.ccs.tencentyun.com/<namespace>/goose-admin:feature-multi-tenant
GOOES_SOCIAL_VIDEO_WORKER_IMAGE=ccr.ccs.tencentyun.com/<namespace>/goose-social-video-worker:feature-multi-tenant
```

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

## 当前阻塞

缺少已授权可推送的 CCR namespace。

下一步需要先在腾讯云 CCR 个人版控制台创建或确认 namespace，然后把该 namespace 配到 GitHub Variable `TENCENT_CCR_NAMESPACE`。
