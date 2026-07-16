# 官网生产切流交接 Runbook

## 1. 适用范围与硬边界

本 Runbook 只用于将 `www.goodcms.cn` 切到独立的 `gooes-web`，以及把
`admin.goodcms.cn/partners` 精确 301 到新官网。Web 容器部署与 Nginx 切流是两次
独立操作：GitHub Actions 只构建、部署并通过 loopback Host smoke，不安装、不重载
生产 Nginx。

以下动作不在自动化工作流中：DNS 修改、Nginx 配置覆盖、`nginx -t`、reload、回滚
演练和旧页面删除。切流期间不修改数据库，不回滚 CMS 数据，也不复制 `.env`、证书
私钥或其他 secret 文件。

## 2. 角色与变更窗口

- 操作人：具有生产主机 Nginx 权限的值班工程师。
- 复核人：独立核对镜像 SHA、候选配置 diff、smoke 和回滚结果。
- 观察窗口：切流后至少 30 分钟；旧 Admin 公开实现至少保留一个完整发布周期。
- 变更记录：填写工单/发布记录 ID、Git SHA、GitHub Actions run ID、开始和结束时间。

任何必填证据缺失都停止切流。不得把“稍后补证据”当作通过。

## 3. 切流前快照

将下表写入本次发布记录，禁止记录环境变量值或密钥内容。

| 字段 | 获取方式 | 记录值 |
| --- | --- | --- |
| Git SHA / build run ID | Actions 运行页 | |
| Admin 镜像 | `docker inspect -f '{{.Config.Image}}' gooes-admin` | |
| Admin revision | 容器 OCI revision label | |
| Web 镜像 | `docker inspect -f '{{.Config.Image}}' gooes-web` | |
| Web revision | 容器 OCI revision label，必须等于 Git SHA | |
| Nginx 配置 SHA-256 | `sha256sum /etc/nginx/sites-enabled/reverse-proxy` | |
| DNS TTL | 权威 DNS 查询结果，记录 A/AAAA/CNAME 各自 TTL | |
| 旧 `/partners` 响应头 | 状态、Location、Server、Cache-Control、ETag | |
| Sitemap URL 数量 | 下载 XML 后仅统计 `<loc>` 数量 | |
| 容器重启计数 | Admin、API、Web 的 restart count | |
| 基线错误率和延迟 | 最近 30 分钟 5xx、P95、P99 | |

同时备份当前非 secret 配置：

```bash
set -euo pipefail
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_PATH="/etc/nginx/sites-enabled/reverse-proxy.bak.${TIMESTAMP}"
sudo install -m 0644 \
  /etc/nginx/sites-enabled/reverse-proxy \
  "${BACKUP_PATH}"
EXPECTED_BACKUP_SHA256="$(sha256sum "${BACKUP_PATH}" | awk '{print $1}')"
printf 'BACKUP_PATH=%s\nEXPECTED_BACKUP_SHA256=%s\n' \
  "${BACKUP_PATH}" "${EXPECTED_BACKUP_SHA256}"
```

将输出的绝对 `BACKUP_PATH` 与 `EXPECTED_BACKUP_SHA256` 原样保存到发布记录；后续安装
失败恢复和人工回滚均从记录复制，禁止重新推算。备份文件不得包含 `.env`、证书私钥、
basic-auth 密码文件或导出的 secret。

## 4. 部署 Web，但不切域名

以下三个 workflow 必须在同一 release Tag 上依次执行，并绑定同一个 Git SHA：

1. `Build Docker Images`（同一 release Tag）
   - 输入 `target_environment=production`、`service=web`。
   - 记录成功 run 的 `build_run_id` 和 Git SHA。
   - Build run 必须完成 production pull verification，证明生产 runner 可按 digest 拉取镜像。
2. `Verify Production Web Deployment Gate`（同一 release Tag）
   - 输入与 Build 完全一致的 `commit_sha`，以及已应用的 `migration_version`。
   - 记录成功 run 的 `gate_run_id`。
3. `Deploy Docker Services`（同一 release Tag）
   - 输入 `service=web`、`built_image_sha`、`build_run_id`、`gate_run_id`、
     `web_smoke_content_path` 和 `confirm_text=确认部署生产环境`。
   - `web_smoke_content_path` 必须是已发布的文章、案例或城市详情路径，例如
     `/articles/example-slug`。
4. `container_ready_for_manual_cutover`
   - 只有 Deploy summary 显示该状态，才可进入后续人工 Nginx 候选配置和切流步骤。

工作流必须通过以下 loopback 检查，并在 summary 中显示
`container_ready_for_manual_cutover`：

- `Host: www.goodcms.cn` 下 `/`、`/partners`、`/sitemap.xml` 返回非错误响应；
- 指定文章、案例或城市详情返回非错误响应；
- 响应含 `x-gooes-service: web` 和当前 `x-gooes-revision`；
- 无 token 的 `/api/preview` 返回 `303 /preview-error` 与 `Cache-Control: no-store`；
- `gooes-web` health 为 healthy，restart count 没有持续增长。

工作流不得访问或修改 `/etc/nginx`，也不得执行 reload。失败时只处理 Web 容器镜像
回滚，不能以修改 Nginx 绕过 smoke。

## 5. 生成并复核 Nginx 候选配置

仓库中的 `deploy/nginx/gooes-web.conf` 是 `www.goodcms.cn` 与
`admin.goodcms.cn` 两个 server block 的审核基线，不是对生产
`reverse-proxy` 中 API、H5、WebSocket、证书等其他 server block 的授权删除清单。

操作人以生产现有 `/etc/nginx/sites-enabled/reverse-proxy` 为底稿生成完整候选文件，
只替换上述两个 server block，并逐行对照仓库基线。复核人必须确认：

1. `www.goodcms.cn` 代理到 `127.0.0.1:3020`；
2. `/_next/static/` 带一年 immutable 缓存；
3. Host、真实 IP、Forwarded-For、Forwarded-Proto 均转发；
4. 只有 `location = /partners` 返回 301，查询参数由 `$is_args$args` 保留；
5. Admin 其余路径仍代理 `127.0.0.1:3010`，`/login`、`/platform/partners` 和
   `/api/backend` 不得误重定向；
6. API、H5、WebSocket、TLS 和其他既有 server block 与快照相比无意外变化。

将完整候选文件暂存到受控路径并生成 diff；发现不相关删除立即停止。

## 6. 安装、语法检查与 reload

安装目标固定为 `/etc/nginx/sites-enabled/reverse-proxy`。确认第 3 节备份存在且 checksum
已记录后，才可安装已双人复核的完整候选文件。

```bash
set -euo pipefail
TARGET_PATH=/etc/nginx/sites-enabled/reverse-proxy
BACKUP_PATH=/etc/nginx/sites-enabled/reverse-proxy.bak.20260712T000000Z
EXPECTED_BACKUP_SHA256='<从发布记录复制 64 位 SHA-256>'
CANDIDATE_PATH=/path/to/reviewed/reverse-proxy.candidate

test -r "${BACKUP_PATH}"
printf '%s  %s\n' "${EXPECTED_BACKUP_SHA256}" "${BACKUP_PATH}" | sha256sum -c -
sudo install -m 0644 "${CANDIDATE_PATH}" "${TARGET_PATH}"
if ! (sudo nginx -t && sudo systemctl reload nginx); then
  sudo install -m 0644 "${BACKUP_PATH}" "${TARGET_PATH}"
  sudo nginx -t && sudo systemctl reload nginx
  exit 1
fi
```

候选配置的 `nginx -t` 或 reload 任一失败都会恢复已校验 checksum 的备份，再执行
`nginx -t && reload`；备份恢复后的语法检查失败时不会 reload，并由严格模式终止。
禁止把 `nginx -t` 和 reload 写成无条件顺序命令，禁止使用 restart 代替 reload，也禁止
用 `|| true` 忽略错误。

## 7. 切流 smoke

reload 后立即记录状态、Location、revision、耗时和 requestId：

```bash
curl -fsSI https://www.goodcms.cn/
curl -fsSI https://www.goodcms.cn/partners
curl -fsSI https://www.goodcms.cn/sitemap.xml
curl -fsSI "https://admin.goodcms.cn/partners?utm_source=cutover-smoke"
curl -fsSI https://admin.goodcms.cn/login
curl -fsSI https://admin.goodcms.cn/platform/partners
```

验收要求：

- 官网响应来自 Web 且 revision 等于已部署 SHA；
- Admin `/partners?utm_source=cutover-smoke` 返回 301，Location 精确保留查询参数；
- Admin `/login` 和 `/platform/partners` 不跳到 `www`；
- Sitemap 可解析，URL 数量相对快照的变化有发布记录解释；
- 提交一条标记为 cutover smoke 的城市合伙人申请，API 与后台列表可按 requestId 追踪；
- 历史 UTM 链接保留查询参数，canonical 指向 `www.goodcms.cn`。

## 8. 30 分钟观察

在第 0、5、10、15、20、25、30 分钟各记录一次：

- Nginx/Web/API 5xx 数量和比例；
- `gooes-web`、`gooes-api`、`gooes-admin` 状态、restart count、CPU 和内存；
- Web access log 的 `/`、`/partners`、内容详情和静态资源状态；
- API 错误日志及可追踪的 requestId；
- 合伙人申请提交成功率和后台可见性；
- `/_next/static/` Cache-Control 和缓存命中情况；
- 移动端首页与 `/partners` 的 LCP，及相对发布前基线的变化；
- canonical、301 与带 UTM 历史链接。

观察期内不得删除 Admin 旧页面、旧表单代理或旧静态资源。

## 9. P0/P1 与回滚条件

满足任一条件立即停止观察并回滚 Nginx：

- **P0**：官网或 Admin 大面积不可用、申请数据错误/丢失、认证或隐私边界失效；
- **P1**：持续 5xx、容器重启循环、申请无法提交、Admin 关键后台被误重定向；
- 301 丢失查询参数、canonical 指错域名、内容详情或 Sitemap 大面积失败；
- LCP 或资源错误显著恶化且无法在变更窗口内确认安全修复。

回滚只恢复上一份 Nginx 非 secret 配置，使 `/partners` 重新由旧 Admin 提供：

```bash
set -euo pipefail
TARGET_PATH=/etc/nginx/sites-enabled/reverse-proxy
BACKUP_PATH=/etc/nginx/sites-enabled/reverse-proxy.bak.20260712T000000Z
EXPECTED_BACKUP_SHA256='<从发布记录复制 64 位 SHA-256>'

test -r "${BACKUP_PATH}"
printf '%s  %s\n' "${EXPECTED_BACKUP_SHA256}" "${BACKUP_PATH}" | sha256sum -c -
sudo install -m 0644 "${BACKUP_PATH}" "${TARGET_PATH}"
sudo nginx -t && sudo systemctl reload nginx
```

随后验证旧 `admin.goodcms.cn/partners`、Admin 登录、API 与 H5。记录回滚时间、原因、
操作者、旧/新 checksum、镜像 SHA 和 smoke 结果。Nginx 回滚不回滚 CMS，不删除已发布
内容，不执行数据库 down migration。若 Web 容器本身也需回退，使用已保留的不可变
rollback image，并单独记录。

正式切流前应在同一候选配置上完成一次回滚演练：切到 Web、验证、恢复旧 Admin、
验证，再切回 Web。演练同样要求每次 `nginx -t` 成功后才 reload。

## 10. 旧 Admin 公开入口删除门

只有同时满足以下条件，才创建后续独立清理提交：

- 切流后至少一个完整发布周期且没有发生回滚；
- 30 分钟观察记录和后续周期监控均通过；
- 历史 UTM、canonical、Sitemap、申请提交和平台后台均有生产证据；
- 回滚方案已改为上一版 Web 镜像，不再依赖旧 Admin 公开页面；
- 产品、运营、值班工程师共同确认清理窗口。

清理提交必须先写失败测试，证明 Admin 不再暴露公开 `/partners`，然后才删除：

- `apps/admin/app/(site)/partners/page.tsx`
- `apps/admin/components/official-site/partner-application-form.tsx`
- `apps/admin/components/official-site/city-partner-site.test.ts`
- `apps/admin/app/api/public/partner-applications/route.ts`

`apps/admin/app/(console)/platform/partners/page.tsx` 必须保留。清理后运行 Admin/Web
测试、check 和 build，再以独立 Conventional Commit 提交；该提交不得与本次切流准备
提交混在一起。
