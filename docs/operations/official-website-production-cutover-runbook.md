# 官网生产切流交接 Runbook

## 1. 适用范围、实际架构与硬边界

本 Runbook 只用于将 `www.goodcms.cn` 切到独立的 `gooes-web`，以及把
`admin.goodcms.cn/partners` 精确 301 到新官网。Web 容器部署与入口切流是两次独立
操作：GitHub Actions 只构建、部署并通过 loopback Host smoke，不安装或重载生产入口。

生产 80/443 入口是容器 `supabase-nginx`，镜像固定为
`jonasal/nginx-certbot:6.0.1-nginx1.29.5`，不是宿主机 Nginx 服务。生产配置关系如下：

- 宿主模板：`/opt/supabase/docker/volumes/proxy/nginx/supabase-nginx.conf.tpl`；
- 容器只读挂载：`/etc/nginx/supabase-nginx.conf.tpl`；
- 容器生效配置：`/etc/nginx/user_conf.d/nginx.conf`；
- 模板以 `envsubst '${PROXY_DOMAIN}'` 渲染，生产模板已有全局 Docker resolver；
- Web 与 Admin upstream 分别是 Docker DNS `gooes-web:3020`、`gooes-admin:3010`；
- Let's Encrypt volume 的宿主路径是
  `/var/lib/docker/volumes/supabase_nginx_letsencrypt/_data`，容器挂载点是
  `/etc/letsencrypt`；
- 80 端口已有默认 ACME webroot `/var/www/letsencrypt`。

仓库 `deploy/nginx/gooes-web.conf` 只是待合并的 reviewed merge baseline，不能独立安装，
也不能覆盖完整生产模板。以下动作不在自动工作流中：DNS 修改、证书签发、模板安装、
`nginx -t`、reload、回滚演练和旧页面删除。切流期间不修改数据库，不回滚 CMS 数据，
也不复制 `.env`、证书私钥或其他 secret 文件。

## 2. 角色、窗口与发布证据

- 操作人：具有生产主机 Docker、模板和 systemd 权限的值班工程师。
- 复核人：独立核对镜像 SHA、候选模板 diff、证书、smoke 和回滚结果。
- 观察窗口：切流后至少 30 分钟；旧 Admin 公开实现至少保留一个完整发布周期。
- 变更记录：填写工单/发布记录 ID、Git SHA、GitHub Actions run ID、开始和结束时间。

任何必填证据缺失都停止切流。不得把“稍后补证据”当作通过。将下表写入发布记录，
禁止记录环境变量值、ACME 账户内容或私钥。

| 字段 | 获取方式 | 记录值 |
| --- | --- | --- |
| Git SHA / build run ID | Actions 运行页 | |
| Admin 镜像 | `docker inspect -f '{{.Config.Image}}' gooes-admin` | |
| Admin revision | 容器 OCI revision label | |
| Web 镜像 | `docker inspect -f '{{.Config.Image}}' gooes-web` | |
| Web revision | 容器 OCI revision label，必须等于 Git SHA | |
| Ingress 镜像 | `docker inspect -f '{{.Config.Image}}' supabase-nginx` | |
| Nginx 配置 SHA-256 | 宿主模板与容器生效配置各记录一次 | |
| DNS TTL | 权威 DNS 查询结果，记录 A/AAAA/CNAME 各自 TTL | |
| 旧 `/partners` 响应头 | 状态、Location、Server、Cache-Control、ETag | |
| Sitemap URL 数量 | 下载 XML 后仅统计 `<loc>` 数量 | |
| 容器重启计数 | Admin、API、Web、ingress 的 restart count | |
| 基线错误率和延迟 | 最近 30 分钟 5xx、P95、P99 | |

同时确认容器镜像、模板挂载、Web/Admin 容器网络可见性和当前证书目录均与第 1 节一致；
任一事实不符都停止，先更新并复核 Runbook，禁止临场猜测路径。

## 3. 部署 Web，但不切入口

以下三个 workflow 必须在同一 release Tag 上依次执行，并绑定同一个 Git SHA：

1. `Build Docker Images`
   - 输入 `target_environment=production`、`service=web`。
   - 记录成功 run 的 `build_run_id` 和 Git SHA。
   - Build run 必须完成 production pull verification，证明生产 runner 可按 digest 拉取镜像。
2. `Verify Production Web Deployment Gate`
   - 输入与 Build 完全一致的 `commit_sha`，以及已应用的 `migration_version`。
   - 记录成功 run 的 `gate_run_id`。
3. `Deploy Docker Services`
   - 输入 `service=web`、`built_image_sha`、`build_run_id`、`gate_run_id`、
     `web_smoke_content_path` 和 `confirm_text=确认部署生产环境`。
   - `web_smoke_content_path` 必须是已发布的文章、案例或城市详情路径，例如
     `/articles/example-slug`。
4. `container_ready_for_manual_cutover`
   - 只有 Deploy summary 显示该状态，才可进入后续人工证书和入口步骤。

工作流必须通过以下 loopback 检查：

- `Host: www.goodcms.cn` 下 `/`、`/partners`、`/sitemap.xml` 返回非错误响应；
- 指定文章、案例或城市详情返回非错误响应；
- 响应含 `x-gooes-service: web` 和当前 `x-gooes-revision`；
- 无 token 的 `/api/preview` 返回 `303 /preview-error` 与 `Cache-Control: no-store`；
- `gooes-web` health 为 healthy，restart count 没有持续增长。

工作流不得访问或修改完整 Nginx 模板、生效配置、证书或 systemd unit，也不得执行
入口 reload。失败时只处理 Web 容器镜像回滚，不能以修改入口绕过 smoke。

## 4. 切流前快照与双份备份

先生成 UTC 时间戳，备份宿主完整模板，并在 `supabase-nginx` 内备份当前生效配置。
下列输出中的路径与 checksum 必须原样写入发布记录，后续失败恢复和人工回滚均从记录
复制，禁止重新推算。

```bash
set -euo pipefail
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
HOST_TEMPLATE_PATH=/opt/supabase/docker/volumes/proxy/nginx/supabase-nginx.conf.tpl
HOST_TEMPLATE_BACKUP_PATH="${HOST_TEMPLATE_PATH}.bak.${TIMESTAMP}"
EFFECTIVE_PATH=/etc/nginx/user_conf.d/nginx.conf
EFFECTIVE_BACKUP_PATH="${EFFECTIVE_PATH}.bak.${TIMESTAMP}"

sudo install -m 0644 "${HOST_TEMPLATE_PATH}" "${HOST_TEMPLATE_BACKUP_PATH}"
docker exec supabase-nginx cp "${EFFECTIVE_PATH}" "${EFFECTIVE_BACKUP_PATH}"
EXPECTED_BACKUP_SHA256="$(sudo sha256sum "${HOST_TEMPLATE_BACKUP_PATH}" | awk '{print $1}')"
EFFECTIVE_BACKUP_SHA256="$(docker exec supabase-nginx sha256sum "${EFFECTIVE_BACKUP_PATH}" | awk '{print $1}')"
printf 'HOST_TEMPLATE_BACKUP_PATH=%s\nEFFECTIVE_BACKUP_PATH=%s\n' \
  "${HOST_TEMPLATE_BACKUP_PATH}" "${EFFECTIVE_BACKUP_PATH}"
printf 'EXPECTED_BACKUP_SHA256=%s\nEFFECTIVE_BACKUP_SHA256=%s\n' \
  "${EXPECTED_BACKUP_SHA256}" "${EFFECTIVE_BACKUP_SHA256}"
```

用 `sha256sum -c` 校验宿主备份，并在容器内校验生效配置备份。备份不得包含 `.env`、
证书私钥、basic-auth 密码文件或导出的 secret。确认 volume 的宿主目录只用于核对挂载，
禁止直接编辑 `/var/lib/docker/volumes/supabase_nginx_letsencrypt/_data`。

## 5. 先签发证书，再加入 TLS block

生产当前没有 `www.goodcms.cn` 证书。必须先签发 `www.goodcms.cn` 证书，再把 Web TLS
block 合并进单体模板；反过来操作会让缺失的证书路径导致整个单体配置校验失败，进而
影响无关 Supabase、API、H5 和业务域名。

签发前必须执行下列 fail-closed 预检。它逐项校验预发布宿主模板的精确 SHA、DNS 只有
`A 1.13.20.39` 且没有 AAAA、Certbot 中不存在任何同名 lineage、默认 ACME webroot
存在且 HTTP-01 探针可从公网读取。生产主机必须已有真实的 `dig` 命令；缺少命令、任一
输出不精确或探针清理失败都会在签发前停止。由复核人检查固定的生产 ACME server、
http-01、ECDSA 曲线、域名、证书名与运维邮箱后执行一次：

```bash
set -euo pipefail
HOST_TEMPLATE_PATH=/opt/supabase/docker/volumes/proxy/nginx/supabase-nginx.conf.tpl
PREPUBLISHED_HOST_TEMPLATE_SHA256=cdc0647c1ea045b8c15c3c555f3865bd9c2fbe2bf362b27b88f9ddefa84059c9
ACME_WEBROOT=/var/www/letsencrypt
ACME_ACCOUNT_EMAIL='<从变更记录填写运维邮箱>'

printf '%s  %s\n' "${PREPUBLISHED_HOST_TEMPLATE_SHA256}" "${HOST_TEMPLATE_PATH}" | sudo sha256sum -c -
command -v dig >/dev/null
DNS_A_RECORDS="$(dig +short A www.goodcms.cn | sort -u)"
test "${DNS_A_RECORDS}" = 1.13.20.39
DNS_AAAA_RECORDS="$(dig +short AAAA www.goodcms.cn | sort -u)"
test -z "${DNS_AAAA_RECORDS}"
docker exec supabase-nginx sh -eu -c 'for path in /etc/letsencrypt/renewal/www.goodcms.cn*.conf /etc/letsencrypt/live/www.goodcms.cn* /etc/letsencrypt/archive/www.goodcms.cn*; do test ! -e "$path"; done'
docker exec supabase-nginx test -d "${ACME_WEBROOT}/.well-known/acme-challenge"
[[ "${ACME_ACCOUNT_EMAIL}" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]

ACME_PROBE_NAME="gooes-cutover-$(date -u +%Y%m%dT%H%M%SZ)-$$"
ACME_PROBE_PATH="${ACME_WEBROOT}/.well-known/acme-challenge/${ACME_PROBE_NAME}"
ACME_PROBE_BODY="${ACME_PROBE_NAME}-reachable"
ACME_PROBE_DIR="$(mktemp -d)"
cleanup_acme_probe() {
  docker exec supabase-nginx rm -f "${ACME_PROBE_PATH}"
  rm -rf "${ACME_PROBE_DIR}"
}
trap cleanup_acme_probe EXIT
docker exec supabase-nginx sh -eu -c 'printf "%s" "$2" > "$1"' \
  sh "${ACME_PROBE_PATH}" "${ACME_PROBE_BODY}"
ACME_PROBE_STATUS="$(curl --show-error --silent --proto '=http' --connect-timeout 5 --max-time 30 \
  --output "${ACME_PROBE_DIR}/body" --write-out '%{http_code}' \
  "http://www.goodcms.cn/.well-known/acme-challenge/${ACME_PROBE_NAME}")"
test "${ACME_PROBE_STATUS}" = 200
test "$(cat "${ACME_PROBE_DIR}/body")" = "${ACME_PROBE_BODY}"
cleanup_acme_probe
trap - EXIT

docker exec supabase-nginx certbot certonly \
  --server https://acme-v02.api.letsencrypt.org/directory \
  --webroot --webroot-path /var/www/letsencrypt \
  --preferred-challenges http \
  --key-type ecdsa --elliptic-curve secp256r1 \
  --cert-name www.goodcms.cn \
  --domain www.goodcms.cn \
  --non-interactive --agree-tos \
  --email "${ACME_ACCOUNT_EMAIL}"
docker exec supabase-nginx certbot certificates --cert-name www.goodcms.cn
docker exec supabase-nginx test -s /etc/letsencrypt/live/www.goodcms.cn/fullchain.pem
docker exec supabase-nginx test -s /etc/letsencrypt/live/www.goodcms.cn/privkey.pem
docker exec supabase-nginx test -s /etc/letsencrypt/live/www.goodcms.cn/chain.pem
docker exec supabase-nginx openssl x509 -in /etc/letsencrypt/live/www.goodcms.cn/fullchain.pem -noout -ext subjectAltName | grep -Fq 'DNS:www.goodcms.cn'
docker exec supabase-nginx openssl x509 -in /etc/letsencrypt/live/www.goodcms.cn/fullchain.pem -noout -checkhost www.goodcms.cn
docker exec supabase-nginx openssl x509 -in /etc/letsencrypt/live/www.goodcms.cn/fullchain.pem -noout -checkend 2592000
docker exec supabase-nginx openssl x509 -in /etc/letsencrypt/live/www.goodcms.cn/fullchain.pem -noout -enddate
```

把 DNS 输出、HTTP 探针状态、Certbot 摘要、SAN/checkhost、至少 30 天有效期检查与
`notAfter` 写入发布记录。任何 ACME、DNS、模板或文件检查失败都停止切流，保留现有入口
配置，不加入 TLS block。不得把证书内容或 ACME 账户材料粘贴到发布记录。

## 6. 从完整实时模板生成候选

候选必须从实时宿主完整模板复制生成，不得从仓库 fragment 拼出一个独立配置。操作人
在候选副本中只做两类变更：

1. 追加或替换 `www.goodcms.cn` TLS block，使其逐行符合
   `deploy/nginx/gooes-web.conf`，Docker upstream 为 `gooes-web:3020`；
2. 在既有 `admin.goodcms.cn` TLS block 中仅增加精确
   `location = /partners`，保留 `$is_args$args`，其余路径继续代理
   `gooes-admin:3010`。

`/login`、`/platform/partners`、`/api/backend` 不得重定向。仓库 fragment 使用生产模板
已有的全局 Docker resolver，不得再增加冲突 resolver。`/_next/static/` 必须有一年
immutable 缓存；Host、Real-IP、Forwarded-For、Forwarded-Proto 与超时设置必须保留。

```bash
set -euo pipefail
TIMESTAMP='<从第 4 节发布记录复制>'
HOST_TEMPLATE_PATH=/opt/supabase/docker/volumes/proxy/nginx/supabase-nginx.conf.tpl
CANDIDATE_TEMPLATE_PATH="/tmp/supabase-nginx.conf.tpl.candidate.${TIMESTAMP}"
sudo install -m 0644 "${HOST_TEMPLATE_PATH}" "${CANDIDATE_TEMPLATE_PATH}"

# 在受控编辑器中仅执行本节列出的两个变更，然后复核完整 diff。
if sudo diff -u "${HOST_TEMPLATE_PATH}" "${CANDIDATE_TEMPLATE_PATH}"; then
  printf 'Candidate has no reviewed changes\n' >&2
  exit 1
else
  DIFF_STATUS=$?
  test "${DIFF_STATUS}" -eq 1
fi
CANDIDATE_SHA256="$(sudo sha256sum "${CANDIDATE_TEMPLATE_PATH}" | awk '{print $1}')"
printf 'CANDIDATE_TEMPLATE_PATH=%s\nCANDIDATE_SHA256=%s\n' \
  "${CANDIDATE_TEMPLATE_PATH}" "${CANDIDATE_SHA256}"
```

复核人必须从候选和实时模板分别提取所有未改动 server block 做 checksum 对比，确认
Supabase、API、H5、WebSocket、ACME 和其他业务域名完全相同，并把对比结果附到发布
记录。任何未改动 server block checksum 不一致、无关行删除、未知格式化或顺序变化都
立即停止。候选内容、完整 diff、候选 SHA-256 和双人确认是安装前置证据。

## 7. 安装、渲染、校验与 reload

只有第 4 至 6 节全部通过后，才把已复核的完整候选安装到宿主模板。安装后，在
`supabase-nginx` 内从只读挂载模板渲染候选生效配置，先执行 `nginx -t`，成功后才
reload。以下失败分支会同时恢复宿主模板和容器生效配置，重新校验旧配置并 reload；
禁止使用 restart、`|| true` 或无条件 reload。

该模板是单文件 bind mount；更新实时宿主模板时必须保留现有 inode。禁止用会先删除
目标的 `install` 替换实时模板，否则运行中容器可能仍读取旧 inode，而容器重建后才
意外读到新配置。候选写入和回滚均使用 `tee` 截断同一 inode，并在渲染前从容器内校验
挂载模板 checksum。首次写入前必须紧邻使用 `EXPECTED_BACKUP_SHA256` 校验实时宿主模板；
不一致表示快照后发生了并发变更，必须在 `tee` 前 fail closed 并重新生成候选。

```bash
set -euo pipefail
HOST_TEMPLATE_PATH=/opt/supabase/docker/volumes/proxy/nginx/supabase-nginx.conf.tpl
MOUNTED_TEMPLATE_PATH=/etc/nginx/supabase-nginx.conf.tpl
HOST_TEMPLATE_BACKUP_PATH='<从第 4 节发布记录复制>'
EFFECTIVE_PATH=/etc/nginx/user_conf.d/nginx.conf
EFFECTIVE_BACKUP_PATH='<从第 4 节发布记录复制>'
EXPECTED_BACKUP_SHA256='<从第 4 节发布记录复制 64 位 SHA-256>'
EFFECTIVE_BACKUP_SHA256='<从第 4 节发布记录复制 64 位 SHA-256>'
CANDIDATE_TEMPLATE_PATH='<从第 6 节发布记录复制>'
CANDIDATE_SHA256='<从第 6 节发布记录复制 64 位 SHA-256>'

printf '%s  %s\n' "${EXPECTED_BACKUP_SHA256}" "${HOST_TEMPLATE_BACKUP_PATH}" | sudo sha256sum -c -
printf '%s  %s\n' "${CANDIDATE_SHA256}" "${CANDIDATE_TEMPLATE_PATH}" | sudo sha256sum -c -
docker exec supabase-nginx sh -eu -c \
  "printf '%s  %s\\n' '${EFFECTIVE_BACKUP_SHA256}' '${EFFECTIVE_BACKUP_PATH}' | sha256sum -c -"

printf '%s  %s\n' "${EXPECTED_BACKUP_SHA256}" "${HOST_TEMPLATE_PATH}" | sudo sha256sum -c -

if sudo tee "${HOST_TEMPLATE_PATH}" < "${CANDIDATE_TEMPLATE_PATH}" > /dev/null \
  && printf '%s  %s\n' "${CANDIDATE_SHA256}" "${HOST_TEMPLATE_PATH}" | sudo sha256sum -c - \
  && docker exec supabase-nginx sh -eu -c \
    "printf '%s  %s\\n' '${CANDIDATE_SHA256}' '${MOUNTED_TEMPLATE_PATH}' | sha256sum -c -" \
  && docker exec supabase-nginx sh -eu -c \
    "envsubst '\${PROXY_DOMAIN}' < '${MOUNTED_TEMPLATE_PATH}' > /etc/nginx/user_conf.d/nginx.conf.candidate && cp /etc/nginx/user_conf.d/nginx.conf.candidate '${EFFECTIVE_PATH}'" \
  && docker exec supabase-nginx nginx -t \
  && docker exec supabase-nginx nginx -s reload; then
  printf 'Nginx candidate installed and reloaded\n'
else
  sudo tee "${HOST_TEMPLATE_PATH}" < "${HOST_TEMPLATE_BACKUP_PATH}" > /dev/null
  printf '%s  %s\n' "${EXPECTED_BACKUP_SHA256}" "${HOST_TEMPLATE_PATH}" | sudo sha256sum -c -
  docker exec supabase-nginx sh -eu -c \
    "printf '%s  %s\\n' '${EXPECTED_BACKUP_SHA256}' '${MOUNTED_TEMPLATE_PATH}' | sha256sum -c -"
  docker exec supabase-nginx cp "${EFFECTIVE_BACKUP_PATH}" "${EFFECTIVE_PATH}"
  docker exec supabase-nginx nginx -t
  docker exec supabase-nginx nginx -s reload
  exit 1
fi

INSTALLED_HOST_TEMPLATE_SHA256="$(sudo sha256sum "${HOST_TEMPLATE_PATH}" | awk '{print $1}')"
INSTALLED_EFFECTIVE_SHA256="$(docker exec supabase-nginx sha256sum "${EFFECTIVE_PATH}" | awk '{print $1}')"
[[ "${INSTALLED_HOST_TEMPLATE_SHA256}" =~ ^[0-9a-f]{64}$ ]]
[[ "${INSTALLED_EFFECTIVE_SHA256}" =~ ^[0-9a-f]{64}$ ]]
test "${INSTALLED_HOST_TEMPLATE_SHA256}" = "${CANDIDATE_SHA256}"
printf 'INSTALLED_HOST_TEMPLATE_SHA256=%s\nINSTALLED_EFFECTIVE_SHA256=%s\n' \
  "${INSTALLED_HOST_TEMPLATE_SHA256}" "${INSTALLED_EFFECTIVE_SHA256}"
```

把上述两个安装后 checksum 原样写入发布记录，并重做第 6 节未改动 server block 对比。
渲染结果必须只体现 `${PROXY_DOMAIN}` 替换和已批准 diff；第 10 节人工回滚必须使用这两个
值重新确认当前 live 状态仍是本次安装结果。

## 8. 安装隔离的证书续期 units

镜像的通用自动续期会解析单体配置中的全部域名，本次不依赖该路径。安装仓库中已版本
控制的 `gooes-www-cert-renew.service` 与 `gooes-www-cert-renew.timer`，它们只续期
`www.goodcms.cn`，且仅在实际续期后通过单个 deploy hook 先执行 `nginx -t` 再 reload。
`--no-directory-hooks` 禁用共享 `/etc/letsencrypt/renewal-hooks/{pre,deploy,post}` 目录中的
自动 hooks；本 unit 只允许运行经过版本控制和审阅的 CLI `--deploy-hook`。
Certbot 官方语义不会仅因 hook 非零而让 `renew` 非零，因此 unit 在每次运行前清理失败
marker，hook 的校验或 reload 失败时写 marker，最后由未忽略失败的 `ExecStartPost` 检查
marker 并使 unit 失败；禁止给该检查加 `-` 前缀或以 `|| true` 中和。

```bash
set -euo pipefail
sudo install -m 0644 deploy/systemd/gooes-www-cert-renew.service \
  /etc/systemd/system/gooes-www-cert-renew.service
sudo install -m 0644 deploy/systemd/gooes-www-cert-renew.timer \
  /etc/systemd/system/gooes-www-cert-renew.timer
sudo systemd-analyze verify \
  /etc/systemd/system/gooes-www-cert-renew.service \
  /etc/systemd/system/gooes-www-cert-renew.timer
sudo systemctl daemon-reload
sudo systemctl enable --now gooes-www-cert-renew.timer
test "$(sudo systemctl is-enabled gooes-www-cert-renew.timer)" = enabled
test "$(sudo systemctl is-active gooes-www-cert-renew.timer)" = active
sudo systemctl start gooes-www-cert-renew.service
sudo systemctl show --no-pager \
  --property=Result,ExecMainStatus,ActiveState \
  gooes-www-cert-renew.service
test "$(sudo systemctl show --property=Result --value gooes-www-cert-renew.service)" = success
test "$(sudo systemctl show --property=ExecMainStatus --value gooes-www-cert-renew.service)" = 0
sudo systemctl list-timers --all gooes-www-cert-renew.timer
```

一次性检查必须成功；`certbot renew` 在证书未到期时不触发 deploy hook 属于正常结果。
若证书实际续期但 `nginx -t` 或 reload 失败，marker 检查必须让 one-shot 进入 failed，
不得把新证书部署失败记录成成功。记录 unit 文件 SHA-256、verify 输出、one-shot 结果、
timer enabled/active 状态和下一次触发时间。units 中禁止写入邮箱、token、密码、证书或
其他凭据。

## 9. 严格 HTTPS smoke 与 30 分钟观察

reload 后立即执行严格 HTTPS smoke，禁止 `--insecure`，记录状态、Location、revision、
证书域名、耗时和 requestId：

```bash
set -euo pipefail
RELEASE_CANDIDATE_SHA='<从发布记录复制 40 位发布候选 Git SHA>'
EXPECTED_WEB_REVISION='<从发布记录复制 Web revision>'
WEB_SMOKE_CONTENT_PATH='<从发布记录复制已发布内容路径>'
[[ "${RELEASE_CANDIDATE_SHA}" =~ ^[0-9a-f]{40}$ ]]
[[ "${EXPECTED_WEB_REVISION}" =~ ^[0-9a-f]{40}$ ]]
test "${EXPECTED_WEB_REVISION}" = "${RELEASE_CANDIDATE_SHA}"
SMOKE_DIR="$(mktemp -d)"
trap 'rm -rf "${SMOKE_DIR}"' EXIT

get_https() {
  local name="${1}"
  local url="${2}"

  curl --fail --show-error --silent \
    --proto '=https' --tlsv1.2 \
    --connect-timeout 5 --max-time 30 \
    --dump-header "${SMOKE_DIR}/${name}.headers" \
    --output "${SMOKE_DIR}/${name}.body" \
    --write-out '%{http_code} %{time_total}\n' \
    "${url}" > "${SMOKE_DIR}/${name}.metrics"
}

read_header() {
  local name="${1}"
  local header_name="${2}"

  awk -v target="${header_name}:" '
    index(tolower($0), tolower(target)) == 1 {
      value = substr($0, length(target) + 1)
      sub(/^[[:space:]]+/, "", value)
      sub(/\r$/, "", value)
    }
    END { print value }
  ' "${SMOKE_DIR}/${name}.headers"
}

record_smoke() {
  local name="${1}"
  local status="${2}"
  local elapsed_seconds="${3}"
  local request_id
  request_id="$(read_header "${name}" x-request-id)"
  printf 'smoke name=%s status=%s elapsed_seconds=%s requestId=%s\n' \
    "${name}" "${status}" "${elapsed_seconds}" "${request_id:-missing}"
}

assert_not_www_redirect() {
  local name="${1}"
  local location
  location="$(read_header "${name}" location)"

  case "${location}" in
    http://www.goodcms.cn*|https://www.goodcms.cn*|//www.goodcms.cn*)
      printf 'Unexpected Admin redirect for %s: %s\n' "${name}" "${location}" >&2
      exit 1
      ;;
  esac
}

get_https web-home https://www.goodcms.cn/
read -r HOME_STATUS HOME_ELAPSED < "${SMOKE_DIR}/web-home.metrics"
test "${HOME_STATUS}" = 200
test "$(read_header web-home x-gooes-service)" = web
test "$(read_header web-home x-gooes-revision)" = "${EXPECTED_WEB_REVISION}"
record_smoke web-home "${HOME_STATUS}" "${HOME_ELAPSED}"

get_https web-partners https://www.goodcms.cn/partners
read -r PARTNERS_STATUS PARTNERS_ELAPSED < "${SMOKE_DIR}/web-partners.metrics"
test "${PARTNERS_STATUS}" = 200
test "$(read_header web-partners x-gooes-service)" = web
test "$(read_header web-partners x-gooes-revision)" = "${EXPECTED_WEB_REVISION}"
record_smoke web-partners "${PARTNERS_STATUS}" "${PARTNERS_ELAPSED}"

get_https sitemap https://www.goodcms.cn/sitemap.xml
read -r SITEMAP_STATUS SITEMAP_ELAPSED < "${SMOKE_DIR}/sitemap.metrics"
test "${SITEMAP_STATUS}" = 200
test "$(read_header sitemap x-gooes-service)" = web
test "$(read_header sitemap x-gooes-revision)" = "${EXPECTED_WEB_REVISION}"
grep -q "<loc>" "${SMOKE_DIR}/sitemap.body"
record_smoke sitemap "${SITEMAP_STATUS}" "${SITEMAP_ELAPSED}"

case "${WEB_SMOKE_CONTENT_PATH}" in
  /articles/*|/cases/*|/cities/*) ;;
  *) printf 'Invalid WEB_SMOKE_CONTENT_PATH\n' >&2; exit 1 ;;
esac
get_https web-content "https://www.goodcms.cn${WEB_SMOKE_CONTENT_PATH}"
read -r CONTENT_STATUS CONTENT_ELAPSED < "${SMOKE_DIR}/web-content.metrics"
test "${CONTENT_STATUS}" = 200
test "$(read_header web-content x-gooes-service)" = web
test "$(read_header web-content x-gooes-revision)" = "${EXPECTED_WEB_REVISION}"
record_smoke web-content "${CONTENT_STATUS}" "${CONTENT_ELAPSED}"

get_https admin-partners \
  'https://admin.goodcms.cn/partners?utm_source=cutover-smoke'
read -r ADMIN_PARTNERS_STATUS ADMIN_PARTNERS_ELAPSED < "${SMOKE_DIR}/admin-partners.metrics"
test "${ADMIN_PARTNERS_STATUS}" = 301
test "$(read_header admin-partners location)" = "https://www.goodcms.cn/partners?utm_source=cutover-smoke"
record_smoke admin-partners "${ADMIN_PARTNERS_STATUS}" "${ADMIN_PARTNERS_ELAPSED}"

get_https admin-login https://admin.goodcms.cn/login
read -r ADMIN_LOGIN_STATUS ADMIN_LOGIN_ELAPSED < "${SMOKE_DIR}/admin-login.metrics"
test "${ADMIN_LOGIN_STATUS}" = 200
assert_not_www_redirect admin-login
record_smoke admin-login "${ADMIN_LOGIN_STATUS}" "${ADMIN_LOGIN_ELAPSED}"

get_https admin-platform-partners https://admin.goodcms.cn/platform/partners
read -r ADMIN_PLATFORM_STATUS ADMIN_PLATFORM_ELAPSED < "${SMOKE_DIR}/admin-platform-partners.metrics"
case "${ADMIN_PLATFORM_STATUS}" in
  200|302|303|307|308) ;;
  *) printf 'Unexpected Admin platform status: %s\n' "${ADMIN_PLATFORM_STATUS}" >&2; exit 1 ;;
esac
assert_not_www_redirect admin-platform-partners
record_smoke admin-platform-partners "${ADMIN_PLATFORM_STATUS}" "${ADMIN_PLATFORM_ELAPSED}"

STATIC_PATH="$(
  awk 'match($0, /\/_next\/static\/[^"?#[:space:]]+/) {
    print substr($0, RSTART, RLENGTH)
    exit
  }' "${SMOKE_DIR}/web-home.body"
)"
test -n "${STATIC_PATH}"
get_https web-static "https://www.goodcms.cn${STATIC_PATH}"
read -r STATIC_STATUS STATIC_ELAPSED < "${SMOKE_DIR}/web-static.metrics"
test "${STATIC_STATUS}" = 200
test "$(read_header web-static x-gooes-service)" = web
test "$(read_header web-static x-gooes-revision)" = "${EXPECTED_WEB_REVISION}"
test "$(read_header web-static cache-control)" = "public, max-age=31536000, immutable"
record_smoke web-static "${STATIC_STATUS}" "${STATIC_ELAPSED}"
```

验收要求：

- 官网响应来自 Web，revision 等于已部署 SHA，证书 SAN 包含 `www.goodcms.cn`；
- Admin `/partners?utm_source=cutover-smoke` 返回 301，Location 精确保留查询参数；
- Admin `/login` 和 `/platform/partners` 不跳到 `www`；
- Sitemap 可解析，URL 数量相对快照的变化有发布记录解释；
- 提交一条标记为 cutover smoke 的城市合伙人申请，API 与后台列表可按 requestId 追踪；
- 历史 UTM 链接保留查询参数，canonical 指向 `www.goodcms.cn`。

在第 0、5、10、15、20、25、30 分钟各记录一次：

- ingress/Web/API 5xx 数量和比例；
- `supabase-nginx`、`gooes-web`、`gooes-api`、`gooes-admin` 的状态、restart count、CPU、内存；
- Web access log 的 `/`、`/partners`、内容详情和静态资源状态；
- API 错误日志及可追踪的 requestId；
- 合伙人申请提交成功率和后台可见性；
- `/_next/static/` Cache-Control 和缓存命中情况；
- 移动端首页与 `/partners` 的 LCP，及相对发布前基线的变化；
- canonical、301、证书和带 UTM 历史链接。

观察期内不得删除 Admin 旧页面、旧表单代理或旧静态资源。

## 10. P0/P1 与 Nginx 回滚

满足任一条件立即停止观察并回滚 Nginx：

- **P0**：官网或 Admin 大面积不可用、申请数据错误/丢失、认证或隐私边界失效；
- **P1**：持续 5xx、容器重启循环、申请无法提交、Admin 关键后台被误重定向；
- 301 丢失查询参数、canonical 指错域名、内容详情或 Sitemap 大面积失败；
- TLS/证书异常、LCP 或资源错误显著恶化且无法在窗口内确认安全修复。

切流回滚只恢复上一份 Nginx 宿主模板和容器生效配置，不回退已发布数据：

```bash
set -euo pipefail
HOST_TEMPLATE_PATH=/opt/supabase/docker/volumes/proxy/nginx/supabase-nginx.conf.tpl
MOUNTED_TEMPLATE_PATH=/etc/nginx/supabase-nginx.conf.tpl
HOST_TEMPLATE_BACKUP_PATH='<从第 4 节发布记录复制>'
EFFECTIVE_PATH=/etc/nginx/user_conf.d/nginx.conf
EFFECTIVE_BACKUP_PATH='<从第 4 节发布记录复制>'
EXPECTED_BACKUP_SHA256='<从第 4 节发布记录复制 64 位 SHA-256>'
EFFECTIVE_BACKUP_SHA256='<从第 4 节发布记录复制 64 位 SHA-256>'
INSTALLED_HOST_TEMPLATE_SHA256='<从第 7 节发布记录复制 64 位 SHA-256>'
INSTALLED_EFFECTIVE_SHA256='<从第 7 节发布记录复制 64 位 SHA-256>'

printf '%s  %s\n' "${EXPECTED_BACKUP_SHA256}" "${HOST_TEMPLATE_BACKUP_PATH}" | sudo sha256sum -c -
docker exec supabase-nginx sh -eu -c \
  "printf '%s  %s\\n' '${EFFECTIVE_BACKUP_SHA256}' '${EFFECTIVE_BACKUP_PATH}' | sha256sum -c -"
printf '%s  %s\n' "${INSTALLED_HOST_TEMPLATE_SHA256}" "${HOST_TEMPLATE_PATH}" | sudo sha256sum -c -
docker exec supabase-nginx sh -eu -c \
  "printf '%s  %s\\n' '${INSTALLED_EFFECTIVE_SHA256}' '${EFFECTIVE_PATH}' | sha256sum -c -"
sudo tee "${HOST_TEMPLATE_PATH}" < "${HOST_TEMPLATE_BACKUP_PATH}" > /dev/null
printf '%s  %s\n' "${EXPECTED_BACKUP_SHA256}" "${HOST_TEMPLATE_PATH}" | sudo sha256sum -c -
docker exec supabase-nginx sh -eu -c \
  "printf '%s  %s\\n' '${EXPECTED_BACKUP_SHA256}' '${MOUNTED_TEMPLATE_PATH}' | sha256sum -c -"
docker exec supabase-nginx cp "${EFFECTIVE_BACKUP_PATH}" "${EFFECTIVE_PATH}"
docker exec supabase-nginx nginx -t
docker exec supabase-nginx nginx -s reload
```

上面两个 installed checksum 校验必须紧邻并位于人工回滚的第一次写入之前。任一不一致都
表示切流后出现了并发修改；此时命令在 `tee` 前退出并保持零写入，禁止覆盖。操作人必须
停止自动回滚，由入口维护者基于“第 4 节备份 / 第 7 节已安装版本 / 当前 live 版本”做
three-way merge 并升级复核，生成新的回滚候选后再执行。

随后验证旧 `admin.goodcms.cn/partners`、Admin 登录、API、H5 和其他未改动 server
block。记录回滚时间、原因、操作者、旧/新 checksum、镜像 SHA 和 smoke 结果。Nginx
回滚不回滚 CMS，不删除已发布内容，不执行数据库 down migration；发布后已有数据时尤其
禁止通过回滚 CMS migrations 处理入口问题。

正式切流前应在同一候选配置上完成一次回滚演练：切到 Web、验证、恢复旧 Admin、
验证，再切回 Web。演练同样要求每次 `nginx -t` 成功后才 reload。

## 11. 旧 Admin 公开入口删除门

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
