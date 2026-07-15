# 腾讯 CCR 美国仓库迁移 Runbook

本 Runbook 用于把后续镜像构建和拉取统一迁移到腾讯 CCR 美国仓库。开发环境执行完整
迁移；生产环境执行 Strategy B，只构建并由生产 Runner 拉取校验候选镜像，不部署容器，
不切换流量。实际执行结果和 Run ID 应写入独立执行记录，不能把本 Runbook 当作已完成
生产部署的证据。

## 当前配置

- Registry：`useccr.ccs.tencentyun.com`
- Namespace：`america_goose`
- Repository Variable `TENCENT_CCR_REGISTRY`：`useccr.ccs.tencentyun.com`
- Repository Variable `TENCENT_CCR_NAMESPACE`：`america_goose`
- Repository Secret 只核对名称：`TENCENT_CCR_USERNAME`、`TENCENT_CCR_PASSWORD`；禁止记录或输出值。
- 服务镜像：
  - `useccr.ccs.tencentyun.com/america_goose/goose-api`
  - `useccr.ccs.tencentyun.com/america_goose/goose-admin`
  - `useccr.ccs.tencentyun.com/america_goose/goose-web`
  - `useccr.ccs.tencentyun.com/america_goose/goose-social-video-worker`
- `gooes-cos-reconcile-worker` 不单独构建镜像，复用 `goose-api`。

Repository Variable 的精确值为：

```text
TENCENT_CCR_REGISTRY=useccr.ccs.tencentyun.com
TENCENT_CCR_NAMESPACE=america_goose
```

## 发布边界

### Development

可信链路固定为：可信 `origin/main` push -> `build-docker-images.yml` 生成并验证
`dev-build-plan` -> `auto-deploy-dev.yml` 按该计划部署。

本次迁移的开发计划必须精确得到：

```text
build_services = api, admin, web, social-video-worker
deploy_services = api, admin, web, social-video-worker, cos-reconcile-worker
```

即构建四个镜像并部署五个服务。若计划不满足该断言，立即停止并修复 resolver；不能用
`release-dev.yml service=all` 代替可信 main push 链路，因为服务编排器的 `all` 有意不包含
Web。

### Production 服务候选

`release-production.yml` 的 `operation=build` 只构建不可变生产候选。`service=all` 解析为
API、Admin、social-video-worker 和复用 API 镜像的 cos-reconcile-worker；实际构建三个镜像，
Web 有意排除并保持独立。

每个 production 构建都必须等待 `build-docker-images.yml` 中的生产 Runner 校验任务成功：

1. 验证 release Tag、commit SHA、production build plan 和镜像 manifest。
2. 校验远端 run-scoped evidence Tag `run-<Run ID>-<commit SHA>` 的 digest 与 manifest 一致，
   且 manifest 中数值类型的 `build_run_id` 等于本次 Run ID。
3. 以 manifest 中 run-scoped image 的仓库和不可变 digest 引用拉取镜像。
4. 校验本地 `org.opencontainers.image.revision` 等于目标 commit SHA、
   `com.goodcms.github.run_id` 等于本次 Run ID，且 RepoDigest 与 manifest 一致。
5. 只清理本次新增且未使用的 digest 引用。

构建仍推送 `dev`/`main` branch Tag 和 `<commit SHA>` Tag，供人工定位与兼容使用；两者都可能被
后续构建覆盖，禁止作为自动部署证据。所有自动 dev/production 部署只能接受 manifest 中的
`run-<Run ID>-<commit SHA>` image，并最终使用该 image 的 `repository@digest`。

任何失败的 `build-docker-images.yml` 构建都禁止使用 GitHub Actions 的 **Re-run jobs** 或
**Re-run all jobs**。重新运行会保留同一个 Run ID，存在覆盖同名 run-scoped evidence Tag 的风险；
必须重新发起 workflow dispatch，或由新的 push/caller 创建全新的 workflow run。工作流在
`validate-request` 的首个可信步骤强制要求 `GITHUB_RUN_ATTEMPT=1`，对 push、
`workflow_dispatch` 和 `workflow_call` 一视同仁；attempt 大于 1 会 fail-closed，因此
`run-<Run ID>-<commit SHA>` Tag 在允许执行的构建中保持不可变。

该任务不执行 `docker compose`、不创建或重启容器、不修改 Nginx。正常生产服务部署仍必须
再次运行 `release-production.yml operation=deploy`，提供候选 `build_run_id`、`commit_sha`，
并输入第二次确认文本 `确认部署生产环境`；本次 Strategy B 禁止执行该步骤。

### Production Web

生产 Web 始终独立于生产服务 `all`。未来实际部署必须在同一个 release Tag、同一个 Git SHA
上执行。该未来流程的前置条件是：生产 API 已经部署并健康运行在精确的 `commit_sha`，且
生产库已应用 deploy verifier 当前要求的精确 migration version `20260711120000`。

满足前置条件后按以下顺序执行：

1. **Build**：运行 `build-docker-images.yml`，输入 `target_environment=production`、
   `service=web`，记录 `build_run_id` 和 SHA；该 run 必须先通过生产 Runner 的 pull、digest、
   revision 校验。
2. **Wrapper Gate**：运行 `verify-production-web-deployment-gate.yml`，使用同一 Tag，输入同一个
   `commit_sha` 和 `migration_version=20260711120000`，记录 `gate_run_id`。
3. **Digest Deploy**：运行 `deploy-docker-services.yml`，使用同一 Tag，输入 `service=web`、
   `built_image_sha`、`build_run_id`、`gate_run_id`、`web_smoke_content_path` 和
   `confirm_text=确认部署生产环境`。工作流必须按 build manifest 的 digest 部署。
4. **Manual Nginx cutover**：只有部署摘要达到 `container_ready_for_manual_cutover`，才按
   `docs/operations/official-website-production-cutover-runbook.md` 执行人工 Nginx 候选配置、
   双人复核、`nginx -t`、reload、smoke 和观察。

本次 Strategy B 只执行第 1 步的 Web Build 和生产 Runner 拉取校验；不得执行 Gate、Digest
Deploy 或人工 Nginx 切流。

## Rollout strategy

- Development 完整迁移：四个镜像构建成功，五个服务部署成功并运行美国仓库镜像。
- Production 使用 Strategy B：构建并由生产 Runner 拉取校验所有服务候选镜像和独立 Web
  镜像；不得 recreate、restart 或启动任何生产容器，不得 reload 或修改 Nginx。
- 只有对应镜像 manifest 和生产 Runner pull 检查全部通过后，才允许更新服务器 active
  `.env` 中的后续默认镜像引用。
- 所有历史时间戳 `.env` 备份都是审计和回滚证据，禁止编辑、覆盖或批量替换。

## Repository variable setup

以下命令只修改和核对 GitHub Repository 配置，不输出 secret 值：

```bash
gh variable set TENCENT_CCR_REGISTRY --repo LeeFo-china/goose --body useccr.ccs.tencentyun.com
gh variable set TENCENT_CCR_NAMESPACE --repo LeeFo-china/goose --body america_goose
gh variable list --repo LeeFo-china/goose
gh secret list --repo LeeFo-china/goose
```

变量列表必须显示两个精确值；secret 列表只确认 `TENCENT_CCR_USERNAME` 和
`TENCENT_CCR_PASSWORD` 名称存在，禁止读取、打印或抄录 secret 值。

工作流只接受精确耦合的美国仓库变量组合，或紧急回滚章节定义的 legacy 组合。新旧值混用、
空值和任何未知 Registry/Namespace 组合都会被拒绝。

## Operator commands

### Release Tag preflight

以下预检只能在合并完成后的隔离、干净 migration worktree 中执行，不能进入可能有本地改动的
root checkout。所有 production workflow dispatch 必须与预检在同一个 shell 会话中执行；任一
校验失败都立即停止。

```bash
set -euo pipefail
RELEASE_TAG=v2026.07.15.1
WORKTREE_ROOT="$(git rev-parse --show-toplevel)"
GIT_DIR="$(cd "$(git rev-parse --git-dir)" && pwd -P)"
GIT_COMMON="$(cd "$(git rev-parse --git-common-dir)" && pwd -P)"
test "${GIT_DIR}" != "${GIT_COMMON}"
test -z "$(git status --porcelain)"

git fetch origin 'refs/heads/main:refs/remotes/origin/main' --tags
MERGED_MAIN_SHA="$(git rev-parse 'refs/remotes/origin/main^{commit}')"
[[ "${MERGED_MAIN_SHA}" =~ ^[a-f0-9]{40}$ ]]

if git show-ref --verify --quiet "refs/tags/${RELEASE_TAG}"; then
  test "$(git rev-parse "refs/tags/${RELEASE_TAG}^{commit}")" = "${MERGED_MAIN_SHA}"
else
  git tag -a "${RELEASE_TAG}" "${MERGED_MAIN_SHA}" \
    -m "Tencent CCR US migration candidate"
fi

if ! git ls-remote --exit-code --refs origin "refs/tags/${RELEASE_TAG}" >/dev/null 2>&1; then
  git push origin "refs/tags/${RELEASE_TAG}"
fi

LOCAL_TAG_OBJECT="$(git rev-parse "refs/tags/${RELEASE_TAG}")"
REMOTE_TAG_OBJECT="$(git ls-remote --exit-code --refs origin \
  "refs/tags/${RELEASE_TAG}" | awk 'NR == 1 {print $1}')"
REMOTE_TAG_COMMIT="$(git ls-remote --exit-code origin \
  "refs/tags/${RELEASE_TAG}^{}" | awk 'NR == 1 {print $1}')"
test -n "${REMOTE_TAG_OBJECT}"
test "${REMOTE_TAG_OBJECT}" = "${LOCAL_TAG_OBJECT}"
test "${REMOTE_TAG_COMMIT}" = "${MERGED_MAIN_SHA}"
test "$(git rev-parse "refs/tags/${RELEASE_TAG}^{commit}")" = "${MERGED_MAIN_SHA}"
printf 'WORKTREE_ROOT=%s\nRELEASE_TAG=%s\nMERGED_MAIN_SHA=%s\n' \
  "${WORKTREE_ROOT}" "${RELEASE_TAG}" "${MERGED_MAIN_SHA}"
```

该脚本先更新 `origin/main` 和 tags，再把 `MERGED_MAIN_SHA` 绑定到合并后的不可变
`origin/main` commit。Tag 不存在时只在该 SHA 创建 annotated tag 并推送；Tag 已存在时必须
peel 到同一 SHA。最后再次核对远端 `refs/tags/${RELEASE_TAG}` 存在、对象与本地一致且解析到
`MERGED_MAIN_SHA`，然后才允许 dispatch。

### Production baseline before dispatch

完成 Release Tag preflight 后、运行下面任何 production workflow dispatch 之前，必须先在生产
服务器记录 baseline。稳定快照包含 container ID、name、`Config.Image`、image ID、
`org.opencontainers.image.revision`、`.State.StartedAt` 和 `.RestartCount`；后两个字段用于证明
期间没有 restart。health/status 单独记录，不能混入稳定 diff。下面两个 Bash 块都必须在同一
生产服务器会话执行；完成后回到仍保留 `RELEASE_TAG` 的预检 shell 再 dispatch。

```bash
set -euo pipefail
mapfile -t containers < <(
  docker ps -a --format '{{.Names}}' | grep '^gooes-' | LC_ALL=C sort
)
test "${#containers[@]}" -gt 0
docker inspect --format \
  '{{.Id}}|{{.Name}}|{{.Config.Image}}|{{.Image}}|{{index .Config.Labels "org.opencontainers.image.revision"}}|{{.State.StartedAt}}|{{.RestartCount}}' \
  "${containers[@]}" \
  | LC_ALL=C sort -t '|' -k2,2 \
  > /tmp/gooes-prod-before-ccr-migration.immutable.txt
docker ps -a --format '{{.Names}}|{{.Status}}' \
  | grep '^gooes-' \
  | LC_ALL=C sort \
  > /tmp/gooes-prod-before-ccr-migration.health-status.txt
```

baseline 文件存在且非空后，才允许继续；否则禁止 dispatch：

```bash
test -s /tmp/gooes-prod-before-ccr-migration.immutable.txt
test -s /tmp/gooes-prod-before-ccr-migration.health-status.txt
```

生产服务候选构建和校验：

```bash
: "${RELEASE_TAG:?先执行 Release Tag preflight}"
gh workflow run release-production.yml --repo LeeFo-china/goose --ref "${RELEASE_TAG}" -f operation=build -f service=all -f confirm_text='确认构建生产候选' -f reason='build america_goose production service candidate without deployment'
```

独立生产 Web 镜像构建和校验：

```bash
: "${RELEASE_TAG:?先执行 Release Tag preflight}"
gh workflow run build-docker-images.yml --repo LeeFo-china/goose --ref "${RELEASE_TAG}" -f target_environment=production -f service=web
```

Strategy B 期间不要运行 `release-production.yml operation=deploy`、
`verify-production-web-deployment-gate.yml` 或 `deploy-docker-services.yml`。未来 Web 实际发布
必须按“Build -> Wrapper Gate -> Digest Deploy -> Manual Nginx cutover”顺序，并完整提供上一节
列出的 `commit_sha`、`migration_version`、`built_image_sha`、`build_run_id`、`gate_run_id`、
`web_smoke_content_path` 和 `confirm_text` 字段。

## Server active configuration

以下命令必须在相应 GitHub Actions 构建、manifest、pull 校验和运行时检查通过后执行。它们只
修改 active `.env`；任何文件名含历史时间戳或既有 `backup`/`bak` 标记的备份都不得编辑。

### Development

开发环境五个服务部署成功后，在 `/opt/gooes-dev/docker` 备份 active `.env` 为
`.env.bak.ccr-us-<stamp>`，再更新 API、Admin、Web 和 social-video-worker 的 `:dev` 引用。
cos-reconcile-worker 继续复用 API 镜像，不新增独立镜像变量。

```bash
set -euo pipefail
cd /opt/gooes-dev/docker
stamp="$(date +%Y%m%d%H%M%S)"
backup=".env.bak.ccr-us-${stamp}"
test ! -e "${backup}"
cp -p .env "${backup}"
update_key() {
  key="$1"
  value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s#^${key}=.*#${key}=${value}#" .env
  else
    printf '%s=%s\n' "${key}" "${value}" >> .env
  fi
}
base=useccr.ccs.tencentyun.com/america_goose
update_key GOOES_API_IMAGE "${base}/goose-api:dev"
update_key GOOES_ADMIN_IMAGE "${base}/goose-admin:dev"
update_key GOOES_WEB_IMAGE "${base}/goose-web:dev"
update_key GOOES_SOCIAL_VIDEO_WORKER_IMAGE "${base}/goose-social-video-worker:dev"
printf 'Development backup: %s\n' "${backup}"
```

仅做配置解析和公开健康检查：

```bash
set -euo pipefail
cd /opt/gooes-dev/docker
docker compose --env-file .env -f docker-compose.dev.yml config --images
curl --noproxy '*' -fsS https://api-dev.goodcms.cn/ >/dev/null
curl --noproxy '*' -fsS https://admin-dev.goodcms.cn/login >/dev/null
curl --noproxy '*' -fsS https://www-dev.goodcms.cn/ >/dev/null
```

### Production

四个 production 镜像均完成 manifest 和生产 Runner pull 校验后，在
`/opt/supabase/docker` 同时备份 active `.env` 和 `.env.admin`。只更新 API、Admin 和
social-video-worker 的 `:main` 引用；cos-reconcile-worker 继续复用 API。生产 Web 配置保持
不变，因为本次迁移没有部署 Web。这里使用 workflow dispatch 之前已经生成的 production
baseline，不得在构建后重新生成或覆盖 baseline。

```bash
set -euo pipefail
cd /opt/supabase/docker
stamp="$(date +%Y%m%d%H%M%S)"
env_backup=".env.bak.ccr-us-${stamp}"
admin_backup=".env.admin.bak.ccr-us-${stamp}"
test ! -e "${env_backup}"
test ! -e "${admin_backup}"
cp -p .env "${env_backup}"
cp -p .env.admin "${admin_backup}"
update_key() {
  file="$1"
  key="$2"
  value="$3"
  if grep -q "^${key}=" "${file}"; then
    sed -i "s#^${key}=.*#${key}=${value}#" "${file}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}
base=useccr.ccs.tencentyun.com/america_goose
update_key .env GOOES_API_IMAGE "${base}/goose-api:main"
update_key .env GOOES_ADMIN_IMAGE "${base}/goose-admin:main"
update_key .env GOOES_SOCIAL_VIDEO_WORKER_IMAGE "${base}/goose-social-video-worker:main"
update_key .env.admin GOOES_ADMIN_IMAGE "${base}/goose-admin:main"
printf 'Production backups: %s %s\n' \
  "${env_backup}" "${admin_backup}"
```

本次迁移禁止执行 `docker compose pull`、`docker compose up`、`docker restart`，也禁止
`docker stop/start/run/rm/kill`、容器重建或任何其他容器生命周期与 Nginx 操作。只允许用
`docker compose ... config --images` 解析未来默认引用，并再次比较生产容器快照；运行中的
生产容器 ID、镜像、启动时间和重启计数必须保持不变。

```bash
set -euo pipefail
cd /opt/supabase/docker
docker compose --env-file .env -f docker-compose.api.yml -f docker-compose.admin.yml config --images
mapfile -t containers < <(
  docker ps -a --format '{{.Names}}' | grep '^gooes-' | LC_ALL=C sort
)
test "${#containers[@]}" -gt 0
docker inspect --format \
  '{{.Id}}|{{.Name}}|{{.Config.Image}}|{{.Image}}|{{index .Config.Labels "org.opencontainers.image.revision"}}|{{.State.StartedAt}}|{{.RestartCount}}' \
  "${containers[@]}" \
  | LC_ALL=C sort -t '|' -k2,2 \
  > /tmp/gooes-prod-after-ccr-build.immutable.txt
docker ps -a --format '{{.Names}}|{{.Status}}' \
  | grep '^gooes-' \
  | LC_ALL=C sort \
  > /tmp/gooes-prod-after-ccr-build.health-status.txt
diff -u \
  /tmp/gooes-prod-before-ccr-migration.immutable.txt \
  /tmp/gooes-prod-after-ccr-build.immutable.txt
curl -fsS https://api.goodcms.cn/ >/dev/null
curl -fsS https://admin.goodcms.cn/login >/dev/null
curl -fsS https://www.goodcms.cn/ >/dev/null
```

## Emergency rollback variables

以下变量只用于有明确事故审批的紧急回滚，必须成对设置，禁止与美国仓库变量混用：

```text
TENCENT_CCR_REGISTRY=ccr.ccs.tencentyun.com
TENCENT_CCR_NAMESPACE=gooes-goodcms
```

回滚后只能使用旧仓库中已经存在、且能关联不可变 build manifest、数值 `build_run_id`、
run-scoped evidence Tag、commit SHA、digest、revision 和 run label 证据的镜像。不得仅凭可变
branch Tag 或 SHA Tag 回滚。紧急状态解除后必须恢复美国仓库成对
变量；所有正常后续发布一律使用 `useccr.ccs.tencentyun.com/america_goose`。

## Acceptance/evidence

执行记录至少包含以下证据，不得包含凭据、Docker auth、`.env` 内容或 secret 值：

| 范围 | 必须记录的证据 |
| --- | --- |
| Repository | 合并 PR、不可变 main SHA、生产 release Tag、两个 Repository Variable 精确值、两个 Secret 名称 |
| Development build | `build-docker-images.yml` Run ID、`dev-build-plan`，以及 API/Admin/Web/social-video-worker 四个 manifest 的 run-scoped image、数值 `build_run_id`、SHA、digest |
| Development deploy | `auto-deploy-dev.yml` Run ID；五个容器的 ID、`repository@digest` image、revision、run label、health；cos-reconcile-worker 复用 API 的证据 |
| Development config | 实际 `.env.bak.ccr-us-<stamp>` 文件名；`docker compose ... config --images` 输出；API/Admin/Web 健康端点结果 |
| Production service candidate | `release-production.yml` Run ID、不可变 `production-release-candidate` artifact、API/Admin/social-video-worker manifest 的 run-scoped image/build_run_id 和生产 Runner pull 校验结果 |
| Production Web candidate | 独立 `build-docker-images.yml` Run ID、Web manifest、远端 run-scoped evidence Tag digest、不可变 digest pull、revision/run label 校验结果；没有 Gate 或 deploy run |
| Production safety | 首次 production workflow dispatch 前和候选构建后的稳定 `docker inspect` 快照及其无差异 diff，字段包含 container ID、name、`Config.Image`、image ID、revision、`.State.StartedAt`、`.RestartCount`；health/status 单独记录；API/Admin/官网状态无回归；没有 Compose、容器生命周期变更或 Nginx reload 记录 |
| Production config | 实际 `.env.bak.ccr-us-<stamp>` 与 `.env.admin.bak.ccr-us-<stamp>` 文件名；API/Admin/social/cos 未来引用解析到美国仓库；Web 配置保持不变 |

生产验收的硬条件是构建前后稳定 immutable snapshot 的 `diff -u` 无输出，尤其是所有生产
容器 ID、`Config.Image`、image ID、revision、`.State.StartedAt` 和 `.RestartCount` 不变。
health/status 只作为单独运行状态证据，不能用于该 immutable diff。只要出现容器 restart、
重建或其他生命周期变更、Web Gate/Deploy、Nginx 配置变化或 reload，本次操作就不再符合
Strategy B，必须停止并按事故流程记录和处置。
