# 容器发布链路与 Nginx 稳定性收口

日期：2026-05-16

## 目标

新服务器已经切到 Docker Compose 部署，后续发布需要满足：

- 代码 push 后由 GitHub Actions 构建业务镜像。
- 服务器通过 `docker compose pull && docker compose up -d` 更新。
- Admin/API 容器重建后，Nginx 不需要人工 reload 也能重新解析新容器 IP。
- 超管运维页以 Docker 容器健康状态作为主监控口径。

## 镜像构建口径

| 服务 | 镜像 | Dockerfile | 工作流 |
| --- | --- | --- | --- |
| API | `ghcr.io/leefo-china/goose-api:feature-multi-tenant` | `docker/api.Dockerfile` | `.github/workflows/build-api-image.yml` |
| Admin | `ghcr.io/leefo-china/goose-admin:feature-multi-tenant` | `docker/admin.Dockerfile` | `.github/workflows/build-admin-image.yml` |
| 视频转文本 Worker | `ghcr.io/leefo-china/goose-social-video-worker:feature-multi-tenant` | `docker/social-video-worker.Dockerfile` | `.github/workflows/build-social-video-worker-image.yml` |

### 调整点

- API workflow 触发条件补齐 `pnpm-lock.yaml`、`pnpm-workspace.yaml` 和 `deploy/docker-compose.api.yml`。
- Admin workflow 触发条件补齐 `deploy/docker-compose.admin.yml`。
- Worker workflow 触发条件补齐 `deploy/docker-compose.api.yml`。
- Worker 镜像保留 `apt-get install ffmpeg`，但不再在 Dockerfile 内强制替换为腾讯源，避免 GitHub Actions 构建环境拉源失败。

## 服务器部署命令

服务器目录：

```bash
cd /opt/supabase/docker
```

拉取并重建业务服务：

```bash
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers pull
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers up -d
```

只更新 Admin：

```bash
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml up -d --no-deps --force-recreate gooes-admin
```

只更新 API 和 Worker：

```bash
docker compose -f docker-compose.api.yml -f docker-compose.admin.yml --profile workers up -d --no-deps --force-recreate gooes-api gooes-social-video-worker gooes-cos-reconcile-worker
```

## Nginx 动态解析

问题背景：

- Nginx 原配置使用静态 upstream：
  - `gooes-admin:3010`
  - `gooes-api:3000`
- Docker 容器重建后 IP 会变化。
- Nginx 旧 worker 可能继续持有旧 upstream IP，导致 `502 Bad Gateway`。

当前服务器已将业务域名代理改为 Docker DNS 动态解析：

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;

location / {
    set $gooes_admin_upstream http://gooes-admin:3010;
    proxy_pass $gooes_admin_upstream;
}
```

API 和 H5 内部 API 代理同样使用：

```nginx
set $gooes_api_upstream http://gooes-api:3000;
proxy_pass $gooes_api_upstream;
```

360 上传代理使用：

```nginx
set $gooes_panorama_upload_upstream http://host.docker.internal:5179;
rewrite ^/__360-upload/(.*)$ /$1 break;
proxy_pass $gooes_panorama_upload_upstream;
```

服务器模板位置：

```text
/opt/supabase/docker/volumes/proxy/nginx/supabase-nginx.conf.tpl
```

修改后生成并 reload：

```bash
docker exec supabase-nginx sh -lc \
  'envsubst '\''${PROXY_DOMAIN}'\'' < /etc/nginx/supabase-nginx.conf.tpl > /etc/nginx/user_conf.d/nginx.conf && nginx -t && nginx -s reload'
```

## 验收记录

已完成验证：

- `gooes-admin` 重建后状态为 `healthy`。
- 不手动 reload Nginx，`https://admin.goodcms.cn/login` 连续返回 `HTTP/2 200`。
- `https://api.goodcms.cn/` 返回 `HTTP/2 200`。
- 四个业务容器均在 `supabase_default` 网络：
  - `gooes-api`
  - `gooes-admin`
  - `gooes-social-video-worker`
  - `gooes-cos-reconcile-worker`

## 后续建议

- 等 GitHub Actions 三个镜像全部构建完成后，在服务器执行一次 `pull` 验证 GHCR 镜像是否可拉取。
- 如果 GHCR 私有镜像仍有下载卡顿，下一步可增加腾讯云 TCR 作为镜像仓库，GitHub Actions 同时推送 GHCR 和 TCR。
- 运维页后续可以隐藏 PM2 脚本入口，保留为旧服务器兼容项，主入口切到 Docker 服务健康。
