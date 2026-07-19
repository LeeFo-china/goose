# GoodCMS DNSPod ACME 证书自动续期运行手册

## 目的与范围

本手册覆盖生产服务器 `ubuntu@1.13.20.39` 上 GoodCMS 生产证书的 Let's Encrypt DNS-01 续期。默认覆盖 `www.goodcms.cn`、`admin.goodcms.cn`、`api.goodcms.cn`、`h5.goodcms.cn`、`sock.goodcms.cn`、`supabase.goodcms.cn`。证书由容器 `supabase-nginx` 中的 Certbot 管理，TXT 挑战记录通过腾讯云 DNSPod API 3.0 临时创建并在验证后删除。

自动化只负责续期和 Nginx reload，不替换现有证书以外的站点配置。不要在开发域名 `www-dev.goodcms.cn` 上复用生产凭据。

## 组件与路径

| 项目 | 位置/值 |
| --- | --- |
| Hook | `/opt/gooes/cert-renewal/dnspod_acme_hook.py`（root:root，0755） |
| Runner | `/opt/gooes/cert-renewal/gooes-www-cert-renew`（root:root，0755） |
| 凭据 | `/etc/gooes/dnspod-www-cert.env`（root:root，0600） |
| 容器运行目录 | `/run/gooes-dnspod-acme`（0700） |
| 状态目录 | `/run/gooes-dnspod-acme/state`（0700，临时 TXT RecordId 与 validation hash） |
| Certbot | 容器 `supabase-nginx` 内上述证书的 renewal 配置 |
| systemd | `gooes-www-cert-renew.service` / `.timer` |

运行目录和状态在清理步骤中删除，状态文件记录本次 hook 创建的 `RecordId` 与 validation hash；cleanup 不会删除其他记录。

## CAM 最小权限

创建专用 CAM 子用户（例如 `gooes-www-cert-renewal`），仅授予自定义策略 `GooesWwwCertificateDns01`：

* `dnspod:CreateRecord`
* `dnspod:DeleteRecord`
* 资源限定为 `qcs::dnspod::uin/<主账号UIN>:domain/<goodcms.cn domainId>`

不要授予 DNSPod 全管理、查询全域、控制台登录或其他云产品权限。API 密钥只在生产主机凭据文件中保存；创建后立即记录密钥 ID 的归属，SecretKey 不写入 Git、工单、聊天、日志、shell history 或镜像。

凭据文件固定只含以下键，域名值必须匹配。`DNSPOD_SUBDOMAIN` 保留兼容值；hook 会按 `CERTBOT_DOMAIN` 选择本次实际 `_acme-challenge.<subdomain>`：

```dotenv
TENCENTCLOUD_SECRET_ID=<CAM secret id>
TENCENTCLOUD_SECRET_KEY=<CAM secret key>
DNSPOD_DOMAIN=goodcms.cn
DNSPOD_SUBDOMAIN=_acme-challenge.www
```

## 首次安装与配置

以下公开文件安装命令在生产主机以 root 执行；先从本次发布分支取得文件，再校验哈希。禁止从未审查的工作区直接复制。

```bash
install -o root -g root -m 0755 dnspod_acme_hook.py /opt/gooes/cert-renewal/dnspod_acme_hook.py
install -o root -g root -m 0755 gooes-www-cert-renew.sh /opt/gooes/cert-renewal/gooes-www-cert-renew
install -o root -g root -m 0644 gooes-www-cert-renew.service /etc/systemd/system/gooes-www-cert-renew.service
install -o root -g root -m 0644 gooes-www-cert-renew.timer /etc/systemd/system/gooes-www-cert-renew.timer
install -d -o root -g root -m 0700 /etc/gooes
systemctl daemon-reload
systemd-analyze verify gooes-www-cert-renew.service gooes-www-cert-renew.timer
```

凭据文件单独通过安全 stdin 写入，不要放进连续复制执行的 bootstrap 块。示例在本地执行，`$CREDENTIAL_FILE` 必须是本机 root-only/owner-only 的临时文件，内容为上文 4 个凭据键：

```bash
ssh ubuntu@1.13.20.39 'sudo install -d -o root -g root -m 0700 /etc/gooes && sudo install -o root -g root -m 0600 /dev/stdin /etc/gooes/dnspod-www-cert.env' < "$CREDENTIAL_FILE"
ssh ubuntu@1.13.20.39 'sudo stat -c "%a %U:%G %n" /etc/gooes/dnspod-www-cert.env'
```

不得 echo、tee、开启 shell trace 或把 SecretKey 写进 shell history。安装前通过容器路径备份 renewal 配置（带 UTC 时间戳和 SHA-256）：

```bash
backup_dir=/var/backups/gooes-cert-renewal/$(date -u +%Y%m%dT%H%M%SZ)
install -d -o root -g root -m 0700 "$backup_dir"
for cert_name in www.goodcms.cn admin.goodcms.cn api.goodcms.cn h5.goodcms.cn sock.goodcms.cn supabase.goodcms.cn; do
  docker cp "supabase-nginx:/etc/letsencrypt/renewal/${cert_name}.conf" "$backup_dir/${cert_name}.conf"
done
sha256sum "$backup_dir"/*.conf
```

先执行 `reconfigure`。Certbot 会用新的续期参数对 staging 做测试，测试成功后保存参数；runner 不传 `--server`，避免把将来正式续期指向 staging：

```bash
/opt/gooes/cert-renewal/gooes-www-cert-renew prepare
/opt/gooes/cert-renewal/gooes-www-cert-renew reconfigure
docker exec supabase-nginx awk -F' = ' '/^server = /{print FILENAME, $2}' /etc/letsencrypt/renewal/*.conf
```

上一步输出必须是 `https://acme-v02.api.letsencrypt.org/directory`，否则先恢复备份，不要启用 timer。

再重新准备运行目录并执行 dry-run：

```bash
/opt/gooes/cert-renewal/gooes-www-cert-renew prepare
/opt/gooes/cert-renewal/gooes-www-cert-renew dry-run
```

验证成功后启用定时器：

```bash
systemctl enable --now gooes-www-cert-renew.timer
systemctl list-timers gooes-www-cert-renew.timer
```

定时器每天 00:00 和 12:00 运行，持久化错过的任务，并随机延迟最多 30 分钟。runner 的 `prepare` 会检查 root、文件 owner/mode、容器运行状态并以 `docker cp` 写入容器；不会执行 `docker run` 或在命令行展开 SecretKey。

## 日常验证与监控

```bash
systemctl status gooes-www-cert-renew.timer
journalctl -u gooes-www-cert-renew.service --since '-2 days' --no-pager
docker exec supabase-nginx certbot certificates
docker exec supabase-nginx nginx -t
curl --fail --silent --show-error --head https://www.goodcms.cn
```

检查证书 SAN、有效期和 HTTPS 返回值；日志中不得出现 SecretId、SecretKey、签名、Authorization 或 ACME validation。DNS 检查应确认默认覆盖域名对应的 `_acme-challenge.*.goodcms.cn` 没有遗留 TXT。临时只续部分证书时可通过 root 环境变量覆盖，例如：`CERT_NAMES="www.goodcms.cn api.goodcms.cn" /opt/gooes/cert-renewal/gooes-www-cert-renew dry-run`。

## 故障排查

1. `prepare` 失败：检查 `systemctl is-active docker`、`docker ps --format '{{.Names}} {{.Status}}'`、文件 owner/mode 和凭据键名；修复后重新执行 `prepare`。
2. DNSPod 4xx/5xx：不要打印响应正文中的敏感字段。确认 CAM 策略的 domainId、主账号 UIN、API 密钥状态和服务器时钟；仅允许 CreateRecord/DeleteRecord。
3. TXT 未传播：hook 会向权威 NS 查询并在截止时间内重试；始终传输不可达的地址不阻断，但至少一个权威地址必须可达，且所有曾经可达的地址都必须匹配目标状态。SERVFAIL、REFUSED、非权威响应或格式错误会按不匹配处理直到超时。确认 `goodcms.cn` 的 NS 委派和 UDP/TCP 网络；超时后 cleanup 仍应执行。
4. `nginx -t` 或 reload 失败：保留当前证书，修复容器内 Nginx 配置后手动运行 `nginx -t`，再重试续期。
5. 状态文件异常/权限错误：停止服务，检查 `/run/gooes-dnspod-acme/state` 的 0700 和 root 所有权；不要手工删除不属于本次状态的 DNS 记录。

查看完整执行错误时可使用 `journalctl`，但禁止开启 shell trace（脚本已使用 `set -Eeuo pipefail`，没有 `set -x`）。

## 回滚与密钥轮换

```bash
systemctl disable --now gooes-www-cert-renew.timer
systemctl stop gooes-www-cert-renew.service || true
for cert_name in www.goodcms.cn admin.goodcms.cn api.goodcms.cn h5.goodcms.cn sock.goodcms.cn supabase.goodcms.cn; do
  docker cp "/var/backups/gooes-cert-renewal/<timestamp>/${cert_name}.conf" "supabase-nginx:/etc/letsencrypt/renewal/${cert_name}.conf"
done
systemctl daemon-reload
```

恢复旧 renewal 配置后，保留当前可用证书并验证 `nginx -t`/HTTPS。删除 host hook、runner、unit 和凭据前，先确认没有运行中的 Certbot；删除的配置从备份可恢复。CAM 密钥轮换顺序：创建新 key → 更新 0600 凭据文件 → 执行 staging dry-run → 禁用旧 key/删除旧子用户。轮换和撤销操作都不得把 SecretKey 写入命令历史。

## 安全红线

* 不提交、上传或回显任何真实 SecretId/SecretKey、签名、Authorization、ACME validation 或完整 API 响应。
* 不把凭据放进 Git、Dockerfile、镜像层、systemd `Environment=`、进程参数、聊天或截图。
* 不扩大 CAM 权限、不使用主账号密钥、不手工长期保留 `_acme-challenge` TXT。
* 不修改数据库，不执行 DDL/DML；不读取或修改 `/Users/leefo/Public/work/orange`。

变更后至少运行本仓库的 hook 单元测试、runner 合约测试、发布合约测试、`bash -n`、`git diff --check` 和敏感扫描；生产操作必须保留命令输出摘要但不保留秘密。
