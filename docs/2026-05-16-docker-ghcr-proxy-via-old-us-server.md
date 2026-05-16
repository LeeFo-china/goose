# Docker GHCR 代理加速执行摘要

日期：2026-05-16

## 背景

新服务器直接从 GHCR 拉取私有镜像时，`goose-social-video-worker` 的大层下载长期卡住。老服务器在美国节点，并已部署 3x-ui / xray，因此评估用老服务器作为新服务器 Docker 拉镜像的出口。

## 结论

已完成 SSH SOCKS 隧道和 Docker daemon 代理配置，链路可用，但本次没有证明它能彻底解决 GHCR 大层下载慢的问题。

- `curl` 通过 SOCKS 访问 GHCR 正常。
- Docker CLI 使用 `socks5h://127.0.0.1:18080` 访问 GHCR manifest 正常。
- Docker daemon 已配置代理并成功重启。
- 业务容器全部恢复 `healthy`。
- 但实际拉取 `goose-social-video-worker` 镜像时，10 分钟内仍未完成，当前镜像未更新。

因此，该方案可作为临时代理出口保留，但发布链路稳定性仍建议后续接腾讯云 TCR。

## 老服务器检查结果

老服务器：

```text
43.165.126.30
ubuntu
```

服务状态：

```text
x-ui.service running
xray running
nginx running
```

关键监听：

```text
5555   x-ui
2096   x-ui
54803  xray trojan inbound tls
50716  xray vmess inbound
62789  xray api 127.0.0.1 only
11111  xray local 127.0.0.1 only
```

说明：

- Docker daemon 不能直接使用 trojan/vmess。
- 需要在新服务器本机提供 Docker 可识别的 HTTP/SOCKS 代理。
- 本次采用 SSH 动态端口转发，不改动 3x-ui 配置，不新增公网代理端口。

## 新服务器已落地配置

新服务器：

```text
1.13.20.39
```

### 1. SSH SOCKS 隧道服务

systemd 服务：

```text
/etc/systemd/system/gooes-ghcr-socks.service
```

监听：

```text
127.0.0.1:18080
```

作用：

```text
新服务器 Docker daemon
  -> 127.0.0.1:18080 SOCKS5
  -> SSH tunnel
  -> 老服务器 43.165.126.30
  -> GHCR
```

状态：

```bash
systemctl is-active gooes-ghcr-socks.service
# active
```

### 2. Docker daemon 代理

配置文件：

```text
/etc/systemd/system/docker.service.d/ghcr-proxy.conf
```

当前配置：

```ini
[Service]
Environment="HTTP_PROXY=socks5h://127.0.0.1:18080"
Environment="HTTPS_PROXY=socks5h://127.0.0.1:18080"
Environment="NO_PROXY=localhost,127.0.0.1,::1,.goodcms.cn,supabase-nginx,gooes-api,gooes-admin,gooes-social-video-worker,gooes-cos-reconcile-worker,kong,db,studio,auth,rest,realtime,storage,imgproxy,meta,analytics,vector,mirror.ccs.tencentyun.com"
```

生效命令：

```bash
sudo systemctl daemon-reload
sudo systemctl restart docker
```

验证：

```bash
systemctl show --property=Environment docker
```

## 验证结果

### SOCKS 链路

```bash
curl -I --socks5-hostname 127.0.0.1:18080 https://ghcr.io/v2/
```

结果：

```text
HTTP/2 405
docker-distribution-api-version: registry/2.0
```

说明 GHCR 链路可达。

### Docker CLI manifest

```bash
HTTPS_PROXY=socks5h://127.0.0.1:18080 \
HTTP_PROXY=socks5h://127.0.0.1:18080 \
docker manifest inspect ghcr.io/leefo-china/goose-social-video-worker:feature-multi-tenant
```

结果：成功。

### Docker daemon pull

执行：

```bash
timeout 600 docker pull -q ghcr.io/leefo-china/goose-social-video-worker:feature-multi-tenant
```

结果：

```text
10 分钟内未完成，命令超时/中断。
当前 worker 镜像仍为旧镜像。
```

说明：

- Docker daemon 代理配置没有导致立即失败。
- 但对 GHCR 大层下载慢的问题改善不足。

### 业务容器

Docker 重启后业务状态：

```text
gooes-api                  healthy
gooes-admin                healthy
gooes-social-video-worker  healthy
gooes-cos-reconcile-worker healthy
```

域名验证：

```text
https://admin.goodcms.cn/login -> HTTP/2 200
https://api.goodcms.cn/        -> HTTP/2 200
```

## 运维命令

查看 SOCKS 隧道：

```bash
systemctl status gooes-ghcr-socks.service
sudo ss -lntp | grep 18080
```

重启 SOCKS 隧道：

```bash
sudo systemctl restart gooes-ghcr-socks.service
```

查看 Docker 代理：

```bash
systemctl show --property=Environment docker
```

测试 GHCR：

```bash
curl -I --socks5-hostname 127.0.0.1:18080 https://ghcr.io/v2/
docker manifest inspect ghcr.io/leefo-china/goose-api:feature-multi-tenant
```

## 回滚方式

如果代理影响后续 Docker 拉取：

```bash
sudo rm -f /etc/systemd/system/docker.service.d/ghcr-proxy.conf
sudo systemctl daemon-reload
sudo systemctl restart docker
```

如果不再需要 SOCKS 隧道：

```bash
sudo systemctl disable --now gooes-ghcr-socks.service
sudo rm -f /etc/systemd/system/gooes-ghcr-socks.service
sudo systemctl daemon-reload
```

## 下一步建议

本次验证说明：老服务器 SSH SOCKS 代理可用，但不足以稳定解决 GHCR 私有镜像大层下载慢。

建议下一步采用腾讯云 TCR：

1. GitHub Actions 同时推送：
   - GHCR
   - TCR
2. 新服务器 compose 默认使用 TCR 镜像。
3. GHCR 保留为备份镜像源。

这样可以把镜像拉取链路放在腾讯云侧，避免美国节点和 GHCR 大层下载的不确定性。
