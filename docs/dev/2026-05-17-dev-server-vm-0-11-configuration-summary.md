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

当前已配置 HTTP 反代：

```text
api-dev.goodcms.cn   -> 127.0.0.1:13000
admin-dev.goodcms.cn -> 127.0.0.1:13010
h5-dev.goodcms.cn    -> 127.0.0.1:13020
```

当前只启用 HTTP。HTTPS 需要等 DNS 指向 `43.165.126.30` 后再申请证书。

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

当前 HTTP 返回 `502` 属于预期状态，因为 dev 容器尚未启动；它已经命中 dev 服务器上的 Nginx。

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
AUTH_IDENTITY_SOURCE=membership
BILLING_CHARGE_ENABLED=false
SMS_CHARGE_ENABLED=false
SOCIAL_VIDEO_CHARGE_ENABLED=false
```

注意：不要把这些密钥提交到仓库。

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

1. DNS 生效后申请 HTTPS 证书。
2. 新增 GitHub Actions `Deploy Dev` workflow，构建并推送 `:dev` 镜像。
3. 执行 dev DB migration。
4. 写 dev seed 脚本并导入测试租户、员工、客户、项目。
5. 启动 dev API/Admin/Worker 容器并完成 smoke test。
