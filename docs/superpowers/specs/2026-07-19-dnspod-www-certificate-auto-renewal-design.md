# DNSPod API 自动续期 `www.goodcms.cn` 证书设计

**日期：** 2026-07-19
**状态：** 已确认，待实施
**范围：** DNSPod CAM、Certbot DNS-01、生产 Nginx、systemd 续期任务

## 背景与根因

`www.goodcms.cn` 当前由生产容器 `supabase-nginx` 终止 TLS，证书位于容器的
`/etc/letsencrypt/live/www.goodcms.cn`。证书本身有效，但 Certbot lineage 的认证器仍为
`manual`。仓库已有 `gooes-www-cert-renew.service` 和 timer，不过生产服务器尚未安装启用；
即使直接启用，非交互式 `certbot renew` 也无法自动完成 DNS-01 验证。

根因不是 timer 缺失，而是续期链路没有可以自动创建、确认和清理
`_acme-challenge.www.goodcms.cn` TXT 记录的 DNSPod API 认证器。

## 已确认方案

采用腾讯云 CAM 子用户与 DNSPod API 3.0，不使用 DNSPod 传统主账号 Token，也不构建第三方
Certbot DNSPod 插件镜像。

DNSPod 官方建议新接入使用 API 3.0；传统 API 仅支持主账号 Token，不能使用 CAM 权限控制：

- <https://docs.dnspod.cn/api/api-development-specification/>
- <https://docs.dnspod.cn/account/dnspod-token/>

DNSPod API 3.0 的 `CreateRecord` 和 `DeleteRecord` 支持按域名资源授权：

- <https://cloud.tencent.com/document/product/598/99243>
- <https://cloud.tencent.com/document/api/1427/56180>
- <https://cloud.tencent.com/document/api/1427/56176>

## 目标

- 自动完成 `www.goodcms.cn` 的 Let’s Encrypt DNS-01 续期。
- DNS 凭据只允许在 `goodcms.cn` 域名资源上创建和删除记录。
- 凭据不进入 Git、Docker 镜像、Docker volume、命令行参数、journal 或发布摘要。
- 续期前验证 TXT 已传播，续期后清理本次创建的 TXT。
- 只有证书签发成功且 `nginx -t` 通过时才 reload Nginx。
- systemd 每天检查两次，带随机延迟，失败可通过 journal 定位。
- 首次配置不强制轮换当前仍有效的生产证书。

## 非目标

- 不自动管理 `goodcms.cn` 的 A、AAAA、CNAME、MX 或现有 TXT 记录。
- 不授予 DNSPod 全读写、域名删除、套餐、账号或腾讯云其他产品权限。
- 不改动 Orange 仓库、数据库或应用容器。
- 不引入第三方 Certbot 插件、自定义 Nginx 镜像、常驻代理或额外网络服务。
- 不把生产密钥写入仓库、GitHub Secrets 或 Codex 对话。

## 权限与凭据设计

创建仅允许编程访问、禁止控制台登录的 CAM 子用户 `gooes-www-cert-renewal`，为其创建单独的
SecretId/SecretKey。自定义策略只包含：

```json
{
  "version": "2.0",
  "statement": [
    {
      "effect": "allow",
      "action": [
        "dnspod:CreateRecord",
        "dnspod:DeleteRecord"
      ],
      "resource": [
        "qcs::dnspod::uin/<owner-uin>:domain/<goodcms-domain-id>"
      ]
    }
  ]
}
```

`owner-uin` 与 `goodcms-domain-id` 必须从当前腾讯云/DNSPod 账号实际资源读取，禁止猜测。
DNSPod 的记录写接口只支持域名级资源授权，不能进一步限制到 `_acme-challenge.www`；因此 hook
必须只接受固定根域 `goodcms.cn` 和 Certbot 传入的 `www.goodcms.cn`，并只删除自己创建后保存的
RecordId。

生产凭据保存为 `/etc/gooes/dnspod-www-cert.env`，所有者 `root:root`、权限 `0600`。内容只允许：

```text
TENCENTCLOUD_SECRET_ID=...
TENCENTCLOUD_SECRET_KEY=...
DNSPOD_DOMAIN=goodcms.cn
DNSPOD_SUBDOMAIN=_acme-challenge.www
```

密钥创建后通过一次性安全文件直接传到生产服务器；处理过程不打印文件内容，临时本地文件在确认
服务器落盘后删除。发布摘要只记录 CAM 子用户、策略名称、服务器文件路径和权限，不记录密钥值。

## Hook 设计

仓库新增纯 Python 标准库 hook，不安装腾讯云 SDK。实现严格依据腾讯云 API 3.0
`TC3-HMAC-SHA256` 官方签名规则：

- <https://cloud.tencent.com/document/product/1278/46716>

Hook 支持 `auth` 与 `cleanup` 两个模式：

1. `auth` 校验 `CERTBOT_DOMAIN` 必须精确等于 `www.goodcms.cn`，并读取
   `CERTBOT_VALIDATION`。
2. 调用 `CreateRecord` 创建 `_acme-challenge.www`、类型 `TXT`、默认线路的挑战记录。
3. 将 API 返回的 RecordId 与挑战值摘要写到容器 `/run/gooes-dnspod-acme/`，文件权限 `0600`。
4. 轮询 DNSPod 权威名称服务器，直到挑战 TXT 在权威查询中可见或超时；不以固定 sleep 代替验证。
5. `cleanup` 只读取本次挑战对应的状态文件，调用 `DeleteRecord` 删除该 RecordId。
6. 删除成功后确认权威查询不再返回本次挑战值，再删除状态文件。

日志只输出阶段、API Action、脱敏 RequestId、等待时间和结果，不输出 SecretId、SecretKey、完整签名、
Authorization、挑战值或完整 API 响应。API 错误、DNS 超时、缺少状态文件和域名不匹配均失败关闭。

容器当前有 Python 3 和 OpenSSL，但没有 curl、jq、dig 或 DNSPod Certbot 插件。Hook 因而使用 Python
标准库完成 HTTPS、TC3 签名和最小 DNS TXT 查询，避免在运行容器中临时安装依赖。

## 容器与 systemd 边界

长期文件保存在宿主机：

```text
/opt/gooes/cert-renewal/dnspod-acme-hook.py   root:root 0755
/etc/gooes/dnspod-www-cert.env               root:root 0600
```

每次运行时，systemd service 执行以下顺序：

1. 确认 `supabase-nginx` 正在运行，宿主机 hook 与凭据权限正确。
2. 在容器内创建 `/run/gooes-dnspod-acme`。
3. 使用 `docker cp` 把 hook 与凭据复制到该临时目录并收紧权限。
4. 在容器内执行 `certbot renew --cert-name www.goodcms.cn --non-interactive --no-directory-hooks`。
5. 成功签发时执行 deploy hook：先 `nginx -t`，再 `nginx -s reload`。
6. 无论成功失败，均从容器 `/run` 删除 hook、凭据和本次状态文件。

这样不需要修改 Docker Compose volume 或重建 ingress 容器；容器重建后，下次 timer 仍会从宿主机复制
最新 hook。Secret 不写入容器镜像、持久 volume 或 Docker 环境配置。

timer 保持每天 `00:00`、`12:00` 检查，使用 `Persistent=true` 与最多 30 分钟随机延迟。Certbot 自行判断
是否进入续期窗口，systemd 不强制签发新证书。

## 首次配置流程

1. 备份容器中的 `/etc/letsencrypt/renewal/www.goodcms.cn.conf`，记录 SHA-256。
2. 创建 CAM 子用户、API 密钥和仅限 `goodcms.cn` 的自定义策略。
3. 用一个随机探针 TXT 调用 `CreateRecord`，从权威 DNS 验证后按返回 RecordId 删除。
4. 安装宿主机 hook、root-only 凭据、systemd service 与 timer。
5. 将临时运行文件复制进容器。
6. 使用 `certbot reconfigure --cert-name www.goodcms.cn` 配置 manual auth/cleanup hook。
   Certbot `reconfigure` 先通过 Let’s Encrypt staging 测试，成功后才保存 lineage 配置。
7. 再执行一次 `certbot renew --cert-name www.goodcms.cn --dry-run --run-deploy-hooks`，验证完整续期与
   Nginx deploy hook。
8. 确认没有遗留 `_acme-challenge.www` TXT 后启用并启动 timer。

在 reconfigure 和 dry-run 成功之前，不启用 timer，也不改动当前 live 证书软链接。

## 测试与验证

实现采用测试先行，至少覆盖：

- 腾讯云官方固定输入的 TC3 签名向量。
- 只接受 `www.goodcms.cn`，拒绝根域、其他子域和尾点绕过。
- 只创建 `_acme-challenge.www` TXT，API payload 不包含其他记录类型或主机名。
- API 错误不会被吞掉，也不会把凭据或挑战值写入错误日志。
- cleanup 只能删除 auth 返回并保存在状态文件中的 RecordId。
- DNS 响应解析、超时、NXDOMAIN、多个 TXT 和权威服务器不一致。
- systemd unit 在 Certbot 失败、Nginx 校验失败时返回失败，并始终清理容器临时凭据。

生产验收证据包括：

- CAM 策略只包含两项 Action，资源只指向 `goodcms.cn` 的 DomainId。
- `/etc/gooes/dnspod-www-cert.env` 为 `root:root 0600`。
- API 探针 create/authoritative-query/delete 全部成功且无 TXT 遗留。
- `certbot reconfigure` staging 测试成功。
- `certbot renew --dry-run --run-deploy-hooks` 成功。
- `nginx -t` 成功，`https://www.goodcms.cn` 返回 200，证书链与域名匹配。
- `systemctl is-enabled gooes-www-cert-renew.timer` 为 enabled，能看到下次触发时间。
- service 和 timer journal 中没有 SecretId、SecretKey、Authorization 或挑战值。
- 现有发布编排契约测试和新增 hook/unit 契约测试全部通过。

## 失败处理与回滚

- CAM/API 探针失败：删除探针记录与新密钥，不修改 Certbot lineage。
- staging reconfigure 失败：保留当前 live 证书，恢复 renewal 配置备份，不启用 timer。
- dry-run 或 Nginx deploy hook 失败：禁用 timer，恢复 renewal 配置并调查；当前证书继续服务。
- timer 上线后失败：timer 可保留用于下次重试，但连续失败必须先禁用并通过 journal 定位，不强制签发。
- 完整回滚：`disable --now` timer，恢复 renewal 配置备份，删除 systemd unit、宿主机 hook 和凭据，
  删除 CAM 密钥/子用户策略，并验证当前证书与 Nginx 不受影响。

所有删除动作先精确核对目标。CAM 密钥删除发生在服务器不再依赖该密钥之后；证书私钥和当前 live
证书不属于本次回滚删除范围。

## 验收标准

- 生产续期不再需要人工添加 TXT。
- DNSPod 凭据不能管理腾讯云其他产品，也不能修改或删除域名配置。
- 续期链路只临时创建 `_acme-challenge.www.goodcms.cn` TXT，并在成功或失败清理阶段删除。
- Certbot staging 和 dry-run 均成功，Nginx 仅在配置校验通过后 reload。
- timer 已启用且下次运行时间可查，日志无敏感信息。
- `www.goodcms.cn` 在配置前后持续可访问，当前有效证书不会因首次配置被强制替换。
