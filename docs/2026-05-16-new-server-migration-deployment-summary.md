# 2026-05-16 新服务器迁移与部署摘要

## 1. 迁移范围

本次迁移将 GOODCMS 核心运行链路从老服务器迁移到新服务器。

- 老服务器：`43.165.126.30`
- 新服务器：`1.13.20.39`
- 新服务器部署目录：`/opt/supabase/docker`
- 新 Supabase 入口：`https://supabase.goodcms.cn`

迁移内容包括：

- 旧 Supabase 数据迁移到新自建 Supabase。
- API 服务容器化部署。
- Admin 服务容器化部署。
- H5 静态站点迁移。
- Nginx 反代迁移。
- 业务 worker 启动。
- 域名 HTTPS 证书迁移。

## 2. 数据迁移结果

已完成旧 Supabase 到新自建 Supabase 的核心数据迁移。

迁移内容：

- `public` 业务数据。
- `auth` 登录与身份数据。
- repo 内 `supabase/migrations` 共 140 个迁移文件已应用到新库。
- 旧库缺失于 migrations 的兼容函数已按需补齐。

精确行数对账结果：

| 项目 | 旧库 | 新库 | 结果 |
| --- | ---: | ---: | --- |
| 业务与 auth 数据总行数 | 5837 | 5837 | 通过 |

关键表校验：

| 表 | 新库行数 |
| --- | ---: |
| `auth.users` | 75 |
| `auth.identities` | 78 |
| `public.tenants` | 6 |
| `public.customers` | 34 |
| `public.employees` | 32 |
| `public.projects` | 27 |
| `public.system_settings` | 90 |

未迁移内容：

- 旧 Supabase Storage 文件未迁移。
- 当前平台文件存储已切到腾讯云 COS，历史 Storage 文件如仍有依赖，需要单独做“旧 Storage 文件迁 COS + URL/路径兼容”。

## 3. 新服务器服务清单

当前新服务器核心容器：

| 容器 | 作用 | 状态 |
| --- | --- | --- |
| `supabase-db` | PostgreSQL | running/healthy |
| `supabase-auth` | Supabase Auth | running/healthy |
| `supabase-rest` | PostgREST | running |
| `supabase-kong` | Supabase API 网关 | running/healthy |
| `supabase-studio` | Supabase Studio | running/healthy |
| `supabase-nginx` | HTTPS 入口与反代 | running |
| `gooes-api` | GOODCMS 后端 API | running/healthy |
| `gooes-admin` | GOODCMS Admin | running/healthy |
| `gooes-social-video-worker` | 短视频转文本 worker | running |
| `gooes-cos-reconcile-worker` | COS 上传对账 worker | running |

## 4. 业务镜像与启动方式

### 4.1 API

API 镜像名：

```text
ghcr.io/leefo-china/goose-api:feature-multi-tenant
```

说明：

- GHCR 私有镜像拉取在新服务器上存在 layer 下载卡顿。
- 本次实际采用“新服务器本地构建同名镜像”的方式启动。
- API 容器监听宿主机 `127.0.0.1:3000`。

验证结果：

```text
http://127.0.0.1:3000/ -> {"hello":"world"}
```

### 4.2 Admin

Admin 镜像名：

```text
gooes-admin:local
```

说明：

- 本次在新服务器本地构建 Admin 镜像。
- Admin 容器监听宿主机 `127.0.0.1:3010`。
- Admin 内部 API 地址：`http://gooes-api:3000`。

验证结果：

```text
http://127.0.0.1:3010/login -> 200
```

### 4.3 Workers

两个 worker 与 API 使用同一个镜像：

```text
ghcr.io/leefo-china/goose-api:feature-multi-tenant
```

启动命令不同：

| worker | command |
| --- | --- |
| `gooes-social-video-worker` | `bun src/workers/social-video-transcription-worker.ts` |
| `gooes-cos-reconcile-worker` | `bun src/workers/project-log-comment-cos-reconcile-worker.ts` |

`gooes-cos-reconcile-worker` 当前启动后已完成一次对账：

- 项目日志图片：扫描 13 条，存在 13 条。
- 评论图片：扫描 55 条，存在 55 条。

## 5. 域名与反代

当前业务域名均已指向新服务器 `1.13.20.39`。

| 域名 | 新服务器反代目标 | 状态 |
| --- | --- | --- |
| `api.goodcms.cn` | `gooes-api:3000` | 正常 |
| `admin.goodcms.cn` | `gooes-admin:3010` | 正常 |
| `h5.goodcms.cn` | `/var/www/h5.goodcms.cn` 静态文件 + API 透传 | 正常 |
| `goodcms.cn` | `gooes-api:3000` | 反代正常，证书待处理 |
| `supabase.goodcms.cn` | Supabase Studio/Kong | 正常 |

H5 兼容老服务器路径：

| 路径 | 反代目标 |
| --- | --- |
| `/public/marketing-pages` | `gooes-api:3000` |
| `/public/marketing-pages/*` | `gooes-api:3000` |
| `/public/tenants/*` | `gooes-api:3000` |
| `/__360-upload/*` | `host.docker.internal:5179` |

API 流式问答路径保留老服务器配置：

```text
/ai/decoration-qa/stream
```

该路径已关闭 Nginx buffering，保留长连接与流式输出能力。

## 6. HTTPS 证书状态

| 域名 | 证书来源 | 状态 |
| --- | --- | --- |
| `api.goodcms.cn` | 从老服务器迁移 | 正常 |
| `admin.goodcms.cn` | 从老服务器迁移 | 正常 |
| `h5.goodcms.cn` | 从老服务器迁移 | 正常 |
| `supabase.goodcms.cn` | 新服务器已有证书 | 正常 |
| `goodcms.cn` | 暂用老配置中的 `sock.goodcms.cn` 证书 | 证书域名不匹配 |

已尝试在新服务器使用 Let’s Encrypt HTTP-01 重新申请证书，但 CA 验证过程中被 Tencent/DNSPod `webblock` 拦截。

现象：

- 本机、`1.1.1.1`、`8.8.8.8` 查询均指向 `1.13.20.39`。
- 新服务器 HTTP challenge 探针可返回 `200`。
- Let’s Encrypt 部分验证节点看到 `43.159.104.94` 并返回 DNSPod `webblock` 页面。

建议后续处理：

1. 优先为 `goodcms.cn` 申请覆盖自身域名的正式证书。
2. 若 HTTP-01 仍被拦截，改用 DNS-01 方式签发证书。
3. 检查 DNSPod 线路、备案、境外访问拦截策略。
4. 避免短时间重复 HTTP-01 失败，Let’s Encrypt 对失败授权有频率限制。

## 7. 当前验证结果

### 7.1 API

```text
https://api.goodcms.cn/ -> 200
body: {"hello":"world"}
```

### 7.2 Admin

```text
https://admin.goodcms.cn/ -> 307 /dashboard
```

### 7.3 H5

```text
https://h5.goodcms.cn/ -> 200
```

### 7.4 goodcms.cn

```text
https://goodcms.cn/ -> 反代可用，但严格证书校验失败
```

原因：当前证书 SAN 不包含 `goodcms.cn`。

## 8. 已确认新服务器承接请求

迁移后已看到微信小程序请求进入新服务器。

示例请求来源：

- 来源 IP：`182.123.215.127`
- User-Agent：微信小程序 `MicroMessenger/8.0.71`
- Referer：`https://servicewechat.com/wxbac3b1e168fd968a/0/page-frame.html`

命中接口：

| 请求 | 状态 |
| --- | --- |
| `POST /auth` | 200 |
| `GET /projects/frontend-visible` | 200 |
| `GET /ai/decoration-qa/suggestions?scene=visitor` | 200 |
| `GET /public/marketing-pages?scene=home` | 200 |
| `GET /ai/decoration-qa/suggestions?scene=visitor&refresh=true` | 200 |
| `POST /ai/decoration-qa/stream` | 200 |

结论：小程序请求已经打到新服务器，不再走老服务器。

## 9. 待办事项

1. 为 `goodcms.cn` 签发正式证书。
2. 处理 Let’s Encrypt HTTP-01 被 DNSPod/Tencent `webblock` 拦截的问题，必要时改用 DNS-01。
3. 将 Admin Dockerfile 与 compose 编排沉淀进仓库，避免仅存在服务器临时构建逻辑。
4. 优化 GHCR 私有镜像拉取慢的问题：
   - 使用更稳定的镜像仓库。
   - 或 GitHub Actions 构建后通过 SSH 部署。
   - 或在服务器侧保留本地构建方案。
5. 评估旧 Supabase Storage 历史文件是否需要迁移到 COS。
6. 后续每次 API 镜像更新后，需要同步重启：
   - `gooes-api`
   - `gooes-social-video-worker`
   - `gooes-cos-reconcile-worker`

## 10. 常用运维命令

查看核心容器：

```bash
cd /opt/supabase/docker
docker ps --format "{{.Names}} {{.Status}} {{.Ports}}" | grep -E "gooes|supabase-nginx|supabase-(db|auth|rest|kong|studio)"
```

查看 API 日志：

```bash
docker logs --tail 200 gooes-api
```

查看 Admin 日志：

```bash
docker logs --tail 200 gooes-admin
```

查看短视频 worker 日志：

```bash
docker logs --tail 200 gooes-social-video-worker
```

查看 COS 对账 worker 日志：

```bash
docker logs --tail 200 gooes-cos-reconcile-worker
```

重启 API 与 workers：

```bash
cd /opt/supabase/docker
docker compose -f docker-compose.yml -f docker-compose.api.yml --profile workers up -d gooes-api gooes-social-video-worker gooes-cos-reconcile-worker
```

重启 Admin：

```bash
cd /opt/supabase/docker
docker compose -f docker-compose.yml -f docker-compose.api.yml -f docker-compose.admin.yml up -d gooes-admin
```

重启 Nginx：

```bash
cd /opt/supabase/docker
docker compose -f docker-compose.yml -f docker-compose.nginx.yml -f docker-compose.api.yml -f docker-compose.admin.yml up -d --force-recreate nginx
```

验证 Nginx 配置：

```bash
docker exec supabase-nginx nginx -t
```
