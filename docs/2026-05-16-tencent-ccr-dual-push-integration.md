# 腾讯云 CCR 双推接入记录

日期：2026-05-16

## 背景

新服务器从 GHCR 拉取私有镜像时，尤其是包含 ffmpeg 的 `goose-social-video-worker`，大层下载非常慢。已验证 SSH SOCKS 代理不能稳定解决该问题，因此切换到腾讯云 CCR/TCR 作为国内镜像源。

> **归档警告：全文不可执行。** 本文只保留 2026-05-16 的接入审计结构和当日结论；其中
> Registry、Namespace、镜像和命令路径已映射为美国仓库目标，不能证明这些目标当前已推送、
> 已部署或仍健康。禁止执行本文任何命令。当前状态必须按
> `docs/2026-07-15-tencent-ccr-us-migration-runbook.md` 重新验证并记录证据。

2026-07-15 目标映射：

```text
Registry: useccr.ccs.tencentyun.com
Namespace: america_goose
```

密码只配置在服务器 Docker 登录态和 GitHub Secrets 中，严禁写入仓库。

## 2026-05-16 审计记录（不可执行）

### 1. 历史登录检查映射

以下命令只展示路径映射，不得执行：

```bash
docker login useccr.ccs.tencentyun.com -u "${TENCENT_CCR_USERNAME}"
```

当日审计结果记录如下，但不是美国仓库当前登录证据：

```text
tcr_login_ok
```

### 2. 历史 Docker daemon 代理映射

因为新服务器之前配置了 GHCR SOCKS 代理，`useccr.ccs.tencentyun.com` 如果也走其他代理，会导致登录超时。

当日审计记录曾把 CCR 加入 Docker `NO_PROXY`；以下仅为目标映射：

```text
useccr.ccs.tencentyun.com
```

配置位置：

```text
/etc/systemd/system/docker.service.d/ghcr-proxy.conf
```

该代理状态可能已变化，当前配置必须重新验证。

### 3. 历史命名空间检查示例

以下 probe 路径只展示当前目标格式，不得推送：

```text
useccr.ccs.tencentyun.com/america_goose/gooes-probe:<timestamp>
```

目标 Namespace 映射为：

```text
america_goose
```

是否可推送必须按当前 Runbook 重新验证，不能沿用当日结果。

### 4. 历史业务镜像路径示例

以下路径已规范化为美国仓库目标，只用于识别镜像，不代表镜像已经推送：

```text
useccr.ccs.tencentyun.com/america_goose/goose-api:feature-multi-tenant
useccr.ccs.tencentyun.com/america_goose/goose-admin:feature-multi-tenant
useccr.ccs.tencentyun.com/america_goose/goose-social-video-worker:feature-multi-tenant
```

当日 `docker manifest inspect` 结论属于原审计环境；当前 manifest 必须重新验证。

### 5. 历史容器映射示例

以下映射不是当前生产容器快照，也不表示美国仓库镜像已部署：

```text
gooes-api                      useccr.ccs.tencentyun.com/america_goose/goose-api:feature-multi-tenant
gooes-admin                    useccr.ccs.tencentyun.com/america_goose/goose-admin:feature-multi-tenant
gooes-social-video-worker      useccr.ccs.tencentyun.com/america_goose/goose-social-video-worker:feature-multi-tenant
gooes-cos-reconcile-worker     useccr.ccs.tencentyun.com/america_goose/goose-api:feature-multi-tenant
```

以下健康和域名结果只记录 2026-05-16 当日结论，当前状态必须重新采集：

```text
https://admin.goodcms.cn/login -> 200
https://api.goodcms.cn/        -> 200
```

## 历史仓库实现记录（不可作为当前 workflow contract）

当日 GitHub Actions 采用统一 matrix workflow。下表路径已更新为目标映射，不代表当前
workflow 或远端镜像状态：

| Workflow | 服务 | CCR 镜像 |
| --- | --- | --- |
| `.github/workflows/build-docker-images.yml` | API | `useccr.ccs.tencentyun.com/america_goose/goose-api:feature-multi-tenant` |
| `.github/workflows/build-docker-images.yml` | Admin | `useccr.ccs.tencentyun.com/america_goose/goose-admin:feature-multi-tenant` |
| `.github/workflows/build-docker-images.yml` | 视频转文本 Worker | `useccr.ccs.tencentyun.com/america_goose/goose-social-video-worker:feature-multi-tenant` |

当前 workflow contract 必须直接检查仓库实现和迁移 Runbook，不能依赖本文结论。

## 历史 GitHub 配置映射（不可直接执行）

Repository Variables：

```text
TENCENT_CCR_REGISTRY=useccr.ccs.tencentyun.com
TENCENT_CCR_NAMESPACE=america_goose
```

Repository Secrets：

```text
TENCENT_CCR_USERNAME
TENCENT_CCR_PASSWORD
```

目标 Namespace 示例：

```text
america_goose
```

GitHub Repository Variables 需要配置为：

```text
TENCENT_CCR_NAMESPACE=america_goose
```

GitHub Repository Secrets 需要配置：

```text
TENCENT_CCR_USERNAME
TENCENT_CCR_PASSWORD
```

## 历史服务器 Compose 映射（不可执行）

以下 active `.env` 内容仅为路径映射示例，不代表生产文件当前值：

```text
GOOES_API_IMAGE=useccr.ccs.tencentyun.com/america_goose/goose-api:feature-multi-tenant
GOOES_ADMIN_IMAGE=useccr.ccs.tencentyun.com/america_goose/goose-admin:feature-multi-tenant
GOOES_SOCIAL_VIDEO_WORKER_IMAGE=useccr.ccs.tencentyun.com/america_goose/goose-social-video-worker:feature-multi-tenant
```

注意：`GOOES_ADMIN_IMAGE` 不能只放在 `.env.admin`。`docker compose` 的 `image:` 字段插值默认读取 `.env`，服务内的 `env_file: .env.admin` 只会注入容器运行时环境变量，不参与 compose 文件插值。

以下直接 Compose 命令已归档，禁止执行：

```bash
cd /opt/supabase/docker
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers pull
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers up -d
```

## 2026-05-16 验收项（当前必须重新验证）

1. GitHub Actions 三个 workflow 均成功。
2. 腾讯 CCR 控制台能看到三类镜像：
   - `goose-api`
   - `goose-admin`
   - `goose-social-video-worker`
3. 新服务器 `docker pull useccr.ccs.tencentyun.com/america_goose/goose-social-video-worker:feature-multi-tenant` 能在合理时间内完成。
4. 业务容器启动后均为 healthy：
   - `gooes-api`
   - `gooes-admin`
   - `gooes-social-video-worker`
   - `gooes-cos-reconcile-worker`
5. 域名返回正常：
   - `https://api.goodcms.cn/`
   - `https://admin.goodcms.cn/login`

## 历史结论与重新验证要求

2026-05-16 审计曾记录 Namespace、登录、镜像、manifest、Compose、容器健康和域名检查通过；
该结论不证明美国仓库或当前生产状态。

当前状态必须按 2026-07-15 Runbook 重新验证。以下历史直接部署示例禁止执行：

```bash
cd /opt/supabase/docker
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers pull
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers up -d --no-deps --force-recreate gooes-api gooes-admin gooes-social-video-worker gooes-cos-reconcile-worker
```
