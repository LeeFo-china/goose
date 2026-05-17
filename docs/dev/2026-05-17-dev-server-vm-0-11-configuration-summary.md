# VM-0-11-ubuntu Dev 服务器配置摘要

日期：2026-05-17

## 1. 服务器用途

`VM-0-11-ubuntu` 已从旧生产/原型用途清理出来，保留 3x-ui，同时作为第一版 `gooes-dev` 运行服务器。

建议职责：

- 运行 dev API 容器。
- 运行 dev Admin 容器。
- 运行 dev worker 容器。
- 通过 Nginx 反代 dev 域名。
- 不在本机运行 dev 数据库。
- 不在本机承担长期镜像构建。

## 2. 当前资源

```text
CPU: 2 核
内存: 约 3.6Gi
磁盘: 约 59G，当前可用约 50G
Docker: 已安装
Docker Compose v2: 已安装
Nginx: 已启用
3x-ui: 保持运行
```

## 3. 目录结构

服务器目录：

```text
/opt/gooes-dev
├── backups
├── docker
│   ├── docker-compose.dev.yml
│   ├── .env
│   ├── .env.dev.common
│   ├── .env.dev.api
│   ├── .env.dev.admin
│   └── .env.dev.db
└── logs
```

`.env.dev.*` 文件权限已设置为 `600`，不进入 Git 仓库。

## 4. Dev Compose

Compose 文件：

```text
/opt/gooes-dev/docker/docker-compose.dev.yml
```

服务名：

```text
gooes-api-dev
gooes-admin-dev
gooes-social-video-worker-dev
gooes-cos-reconcile-worker-dev
```

镜像 tag：

```text
ccr.ccs.tencentyun.com/gooes-goodcms/goose-api:dev
ccr.ccs.tencentyun.com/gooes-goodcms/goose-admin:dev
ccr.ccs.tencentyun.com/gooes-goodcms/goose-social-video-worker:dev
```

端口：

```text
127.0.0.1:13000 -> gooes-api-dev:3000
127.0.0.1:13010 -> gooes-admin-dev:3010
127.0.0.1:13020 -> h5-dev 预留
```

部署时必须使用：

```bash
cd /opt/gooes-dev/docker
docker compose -f docker-compose.dev.yml pull <service>
docker compose -f docker-compose.dev.yml up -d --no-deps --force-recreate <service>
```

不能只 `restart`，否则不会拉取新的 `:dev` 镜像。

## 5. Nginx

配置文件：

```text
/etc/nginx/conf.d/gooes-dev.conf
```

当前已配置 HTTP/HTTPS 反代：

```text
api-dev.goodcms.cn   -> 127.0.0.1:13000
admin-dev.goodcms.cn -> 127.0.0.1:13010
h5-dev.goodcms.cn    -> 127.0.0.1:13020
```

HTTPS 证书已申请成功：

```text
Certificate Name: api-dev.goodcms.cn
Domains: api-dev.goodcms.cn admin-dev.goodcms.cn h5-dev.goodcms.cn
Expiry Date: 2026-08-15
```

当前 `api-dev.goodcms.cn` 与 `admin-dev.goodcms.cn` 已由 dev 容器提供服务。

## 6. DNS 当前状态

当前公共 DNS 已解析到 dev 服务器：

```text
api-dev.goodcms.cn   -> 43.165.126.30
admin-dev.goodcms.cn -> 43.165.126.30
h5-dev.goodcms.cn    -> 43.165.126.30
```

本机或运营商 DNS 可能仍有短时间缓存。验证时应绕开代理：

```bash
curl --noproxy '*' http://api-dev.goodcms.cn/
```

当前 HTTPS 已正常命中 dev 服务器上的 Nginx，并转发到对应 dev 容器。

## 7. Dev Supabase

Dev API env 已写入：

```text
/opt/gooes-dev/docker/.env.dev.api
```

包含：

```text
SUPABASE_URL
SUPABASE_PUBLISH
SUPABASE_SERVICE_ROLE_KEY
JWT_SECRET
APP_CONFIG_ENCRYPTION_KEY
AUTH_IDENTITY_SOURCE=membership
BILLING_CHARGE_ENABLED=false
SMS_CHARGE_ENABLED=false
SOCIAL_VIDEO_CHARGE_ENABLED=false
```

注意：不要把这些密钥提交到仓库。

`APP_CONFIG_ENCRYPTION_KEY` 用于加密和解密超管后台保存的密钥类系统配置。环境初始化时必须先配置；一旦已经保存过密文配置，不要随意更换，否则历史密文将无法解密。

## 8. 数据库连接状态

Supabase HTTPS API 连通正常。Direct DB host 当前只解析到 IPv6：

```text
db.<project-ref>.supabase.co
```

`VM-0-11-ubuntu` 没有公网 IPv6 路由，因此不能直接连接 5432。

已在 `.env.dev.db` 中保留 direct URL 作为参考，并将 `SUPABASE_DB_URL` 配置为 Supabase Connection Pooling URL：

```text
host=aws-1-ap-northeast-2.pooler.supabase.com
port=5432
database=postgres
user=postgres.<project-ref>
```

从 dev 服务器执行 `psql` 登录测试已通过。后续 migration 可以使用 `SUPABASE_DB_URL`。

## 9. 当前未完成事项

1. Worker dev 容器按需启动。
2. 生产发布继续保持手动触发，dev 发布由 `Deploy Dev` workflow 按代码路径自动触发，必要时可手动选择服务补发。

## 10. Dev DB migration 与 seed

Dev Supabase 已在 2026-05-17 执行完整 migration：

```text
supabase_migrations.schema_migrations: 140
public.tenants: 1
public.permissions: 53
public.roles: 5
```

幂等 seed 脚本：

```text
scripts/dev/seed-dev.sql
```

执行方式：

```bash
ssh -i docs/360video/goose.pem ubuntu@43.165.126.30 \
  'set -a; . /opt/gooes-dev/docker/.env.dev.db; psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1' \
  < scripts/dev/seed-dev.sql
```

当前 seed 数据：

| 类型 | 值 |
| --- | --- |
| 租户 | 默认装修公司 |
| 平台超管手机号 | `19900000001` |
| 租户管理员手机号 | `19900000002` |
| 后台验证码 | dev 环境已开启 `AUTH_PHONE_LOGIN_WITHOUT_CODE=true`，可免验证码登录 |
| 客户 | `19900001001`、`19900001002` |
| 积分账户 | `is_test=true`，初始测试积分 `1000000` |

## 11. Smoke test

2026-05-17 已完成：

| 检查项 | 结果 |
| --- | --- |
| `https://api-dev.goodcms.cn/` | `200 OK`，返回 `{"hello":"world"}` |
| `https://admin-dev.goodcms.cn/login` | `200 OK` |
| API dev 容器 | `gooes-api-dev` healthy |
| Admin dev 容器 | `gooes-admin-dev` healthy |
| 后台 dev 登录 | `19900000001` 平台超管登录成功；`19900000002` 租户管理员登录成功 |

## 12. Deploy Dev workflow

已新增：

```text
.github/workflows/deploy-dev.yml
```

当前已可通过 GitHub Actions 自动或手动触发 `Deploy Dev`。

自动触发规则：

```text
push feature/multi-tenant 且修改 apps/api、apps/admin、packages/domain、docker、workspace 配置或 deploy/docker-compose.dev.yml
```

workflow 会按变更路径解析需要发布的服务：

| 变更 | 发布 |
| --- | --- |
| API 代码 | `api` |
| Admin 代码 | `admin` |
| 短视频 worker 相关代码 | `social-video-worker` |
| COS 对账/上传文件相关代码 | `cos-reconcile-worker` |
| 共享构建文件、domain 包、dev compose | 全部 dev 服务 |
| docs、seed、migration | 不自动部署 |

手动触发用于补发单个服务，通过输入选择：

```text
api
admin
social-video-worker
cos-reconcile-worker
```

## 13. Docker 清理策略

Dev 发布链路有两层 Docker 清理。

第一层在 GitHub Actions 构建 runner `gooes-prod-vm-0-3` 上执行。原因是 dev 镜像仍在生产 runner 构建并推送到腾讯 CCR，构建过程会在 `/var/lib/containerd` 累积 dangling 镜像和 build cache。

清理动作：

```bash
docker container prune -f
docker image prune -f
docker builder prune -f --filter "until=24h"
```

这一步只删除退出容器、dangling 镜像和 24 小时以前的构建缓存，不删除已经打 tag 的 `:dev` 或 SHA 镜像。

第二层在 `VM-0-11-ubuntu` dev 运行服务器上执行。每次 dev 部署和健康检查后，workflow 会通过 SSH 清理旧运行镜像：

```bash
docker container prune -f
docker image prune -a -f
docker builder prune -a -f --filter "until=24h"
```

这一步会删除未被当前容器引用的旧 dev 镜像。已运行容器引用的当前镜像不会被删除；如需回滚旧 SHA 镜像，服务器会从腾讯 CCR 重新拉取。

明确不执行：

```bash
docker volume prune
```

原因是 volume 可能承载持久化数据、Nginx 配置、日志或后续扩展服务数据，不能放进自动清理。

当前 dev 发布链路：

```text
GitHub push / manual dispatch
  -> gooes-prod-vm-0-3 构建 dev 镜像
  -> 推送腾讯 CCR
  -> VM-0-11-ubuntu pull 镜像
  -> docker compose up -d --force-recreate
  -> 健康检查
  -> VM-0-11-ubuntu 清理旧镜像和旧 build cache
```

后续如果要把 dev 构建迁移到 `VM-0-11-ubuntu`，需要先在 dev 服务器安装并注册独立 GitHub runner、配置 Docker 构建权限、腾讯 CCR 登录和同等清理策略。
