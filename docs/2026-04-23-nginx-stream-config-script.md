# 2026-04-23 Nginx 流式接口配置脚本

下面这份脚本可直接复制到服务器执行，用于写入装修问答流式接口对应的 nginx 配置。

## 使用方式

1. 保存为 `nginx-stream-config.sh`
2. 上传到服务器
3. 执行：

```bash
chmod +x nginx-stream-config.sh
sudo ./nginx-stream-config.sh
```

## 脚本

```bash
#!/usr/bin/env bash
set -euo pipefail

NGINX_SITE_PATH="/etc/nginx/sites-enabled/reverse-proxy"
BACKUP_PATH="${NGINX_SITE_PATH}.bak.$(date +%Y%m%d%H%M%S)"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "请用 root 执行：sudo bash nginx-stream-config.sh"
  exit 1
fi

if [[ ! -f "$NGINX_SITE_PATH" ]]; then
  echo "未找到 nginx 配置文件: $NGINX_SITE_PATH"
  exit 1
fi

cp "$NGINX_SITE_PATH" "$BACKUP_PATH"
echo "已备份原配置到: $BACKUP_PATH"

cat > "$NGINX_SITE_PATH" <<'EOF'
server {
    server_name goodcms.cn www.goodcms.cn sock.goodcms.cn;

    location /ai/decoration-qa/stream {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;

        proxy_buffering off;
        proxy_request_buffering off;
        chunked_transfer_encoding on;
        gzip off;

        proxy_read_timeout 120s;
        proxy_send_timeout 120s;

        proxy_set_header Host $host;
        proxy_set_header Connection "";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/goodcms.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/goodcms.cn/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = sock.goodcms.cn) {
        return 301 https://$host$request_uri;
    }

    if ($host = www.goodcms.cn) {
        return 301 https://$host$request_uri;
    }

    if ($host = goodcms.cn) {
        return 301 https://$host$request_uri;
    }

    listen 80;
    server_name goodcms.cn www.goodcms.cn sock.goodcms.cn;
    return 404;
}
EOF

echo "已写入新配置: $NGINX_SITE_PATH"

nginx -t
systemctl reload nginx

echo "nginx 配置校验通过并已重载"
echo "如需回滚：cp '$BACKUP_PATH' '$NGINX_SITE_PATH' && nginx -t && systemctl reload nginx"
```

## 这次报错的原因

你刚才那份脚本报错：

```bash
proxy_add_x_forwarded_for: unbound variable
```

原因是 here-doc 没有用单引号包住 `EOF`，导致下面这些 nginx 变量被 shell 提前展开了：

- `$host`
- `$remote_addr`
- `$http_upgrade`
- `$proxy_add_x_forwarded_for`

在 `set -u` 下，这些未定义 shell 变量会直接报错。

正确写法就是：

```bash
<<'EOF'
```

这样 nginx 变量会原样写入配置文件，不会被 bash 提前展开。
