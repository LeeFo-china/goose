# 技术服务限时活动本地验证证据

最新状态（2026-09-17 北京时间）：**开发发布 DONE_WITH_CONCERNS**。五条迁移已应用、631 条 Local/Remote 对齐、API/Admin 同 SHA 发布与无支付 API smoke 通过；类型生成、浏览器交互及 Orange/支付验收仍有独立门禁。下文前半部分保留本地验证和首次阻塞的历史，最新开发发布结论见末尾。

验证时间：2026-09-16 UTC（北京时间 2026-09-17）。本轮非数据库复验记录时间为 17:37 UTC。
分支：`feature/platform-service-promotion`。
证据提交前最新 reviewed feature SHA：`df2ee19ef9a1512ae1a32f6348889ccecbae40b3`。
前次数据库尝试 SHA：`f6f11a67d7093c66ddb3b6eb76ed362611b1bd6d`；本轮没有重跑数据库，详见隔离迁移章节。
工作区：`.worktrees/platform-service-promotion`。

结论：**DONE_WITH_CONCERNS**。API/Admin 聚焦测试、静态检查和构建通过；隔离 Supabase 完整迁移链被既有非事务索引 migration 的 CLI 执行限制阻断，活动 migration 尚未应用，真实 RPC 和 Admin 交互 smoke 未完成。本记录不是完整数据库验收或开发发布放行凭证。

## 聚焦测试

以下非数据库命令已在最新 reviewed SHA 上重新实际运行，Bun 1.3.2。

API cwd：`apps/api`。

```bash
bun test \
  src/services/platform-service-promotions-migration-contract.test.ts \
  src/repositories/platform-service-promotions.test.ts \
  src/services/platform-service-promotions.test.ts \
  src/controllers/platform-service-promotions/routes.test.ts \
  src/repositories/platform-service-orders.test.ts \
  src/repositories/platform-service-order-trial-attribution.test.ts \
  src/services/platform-service-order-views.test.ts \
  src/services/tenant-platform-service-orders.test.ts \
  src/services/tenant-platform-service-orders-trial-attribution.test.ts \
  src/services/platform-service-products.test.ts \
  src/controllers/platform-service-products/routes.test.ts \
  src/schema/platform-service-products.test.ts \
  src/services/platform-service-order-payment-confirmation.test.ts
```

结果：exit 0；13 个文件，115 pass、0 fail、648 次 `expect()`。
包含 migration 文本契约、活动 schema/repository/service/routes、有效价格边界、订单快照与试用归因、套餐及支付确认适配测试。文本契约和 mock RPC 通过不代表真实 PostgreSQL RPC 通过。

Admin cwd：`apps/admin`。

```bash
bun test \
  components/platform-service-promotions/platform-service-promotion-form-data.test.ts \
  components/platform-service-promotions/platform-service-promotions-page.test.ts \
  components/platform-service-products/platform-service-products-page.test.ts \
  components/platform-service-products/platform-service-product-action-rules.test.ts
```

结果：exit 0；4 个文件，31 pass、0 fail、238 次 `expect()`。
覆盖默认 2 折草稿、金额预览、北京时间展示、分页 Tabs、发布前刷新、确认金额和 pending 状态契约；这些不是浏览器交互测试。

本轮新增边界证据：

- 商品版本确认：预览携带三档 `product_version_id`，发布 DTO 只接受三档唯一正式商品及版本 UUID、不接受客户端价格；repository/service 透传 `expected_product_versions`。migration 文本契约检查先取统一的价格互斥锁（`pg_advisory_xact_lock` 排他事务锁），再比对商品版本，冲突发生在替换旧活动之前；错误映射为 409。真实数据库并发行为仍待 RPC gate。
- 北京时间：输入、回填、展示和表单提示统一 UTC+08:00；拒绝不存在的日期/越界时间。对美国 DST 缺失小时的输入仍按北京时间解释。
- 超管：五个活动路由在 service 委托前拒绝非超管；service 对每个操作复核显式超管身份；Admin 服务端读取前拦截并隐藏入口；数据库拒绝映射为安全的 403。
- 422：套餐发布触发 `SERVICE_PROMOTION_PRICE_NOT_LOWER` 时返回业务 422 和调整/停止活动提示；未知数据库错误保留原安全包装，不误映射。

为直接验证输入不受宿主时区影响，还在 `apps/admin` 分别执行：

```bash
TZ=UTC bun test components/platform-service-promotions/platform-service-promotion-form-data.test.ts
TZ=America/New_York bun test components/platform-service-promotions/platform-service-promotion-form-data.test.ts
```

两条命令分别 exit 0，每次 12 pass、0 fail、61 次 `expect()`。这是同一组 12 项用例在两个额外时区的复验，不计作新增独立用例。

## 静态检查、构建和仓库边界

以下命令 cwd 为 worktree 根目录。

| 命令 | 实际结果 |
| --- | --- |
| `bun run api:check` | exit 0；TypeScript 检查通过，985 modules 构建成功；API 文件上限 500 行、豁免 0，生成的 database.ts 单独排除 |
| `pnpm --dir apps/admin check` | exit 0；1,627 个 TS/TSX 文件均不超过 500 行；Next route typegen 和 tsc 通过 |
| `pnpm --dir apps/admin build` | exit 0；Next.js 15.5.15，101/101 页面生成，standalone assets 同步完成 |
| `bun run check:file-size` | exit 0；API 上限 500 行、豁免 0；Admin 1,627 文件通过 |
| `bun run check:permission-boundaries` | exit 0，权限边界检查通过 |
| `bun run audit:supabase-writes` | exit 0，但报告 17 个 candidate，不能解读为零风险 |
| `git diff --check` | exit 0 |
| `git diff -- apps/api/src/types/database.ts` | 无输出，生成类型未修改 |
| `git status --short` | 写证据前无输出 |
| `git log --oneline -8` | 核对 reviewed SHA 及下列最近提交 |

Admin 构建包含 `/platform/service-products`（13.4 kB；First Load JS 184 kB）和 `/platform/service-orders`。构建结果只说明路由能够编译，不证明浏览器操作或已部署。

写入审计的 17 个候选分布在 10 个既有文件（访客项目关注、验收模板、合作伙伴收益、图库、虚拟支付渠道和若干测试），与 `git diff --name-only main...HEAD` 的活动功能改动文件交集为空。本次只记录结果，不调整无关代码。审计脚本默认有候选仍返回 0，未使用 `--fail-on-candidates`。

最近提交核对：

```text
df2ee19ef fix(admin): 统一活动表单北京时间提示
4d7d512fb fix(service-promotion): 修复发布确认与权限及时间边界
47255e923 docs(operations): 补充隔离数据库验证复现步骤
02008767a docs(operations): 记录限时活动本地验证
f6f11a67d docs(miniprogram): 说明活动示例为节选
7bd07ac3f docs(miniprogram): 修正限时活动刷新契约
d0b39caa5 docs(miniprogram): 交接技术服务限时活动
881427027 fix(admin): 统一限时活动展示为北京时间
```

## 隔离 Supabase 完整迁移尝试（前次结果，本轮未重跑）

本轮只做文件核对：`supabase/migrations` 仍有 631 个 SQL 文件，`20260826141500_prepare_supplier_purchase_batch_catalog_search.sql` 和 `20260916170000_create_platform_service_promotions.sql` 均存在。通过 `git diff --exit-code f6f11a67d7093c66ddb3b6eb76ed362611b1bd6d HEAD -- supabase/migrations/20260826141500_prepare_supplier_purchase_batch_catalog_search.sql` 确认历史阻塞 migration 未变。活动 migration 已随集成修复增加商品版本校验，但仍未经过真实数据库执行。

**本轮没有重启容器，没有重跑 start/reset/migration list 或 SQL smoke。** 以下 631/521、SQLSTATE 和清理状态是前次 SHA 的实测历史结果，不是最新 SHA 的数据库通过证据。历史阻塞文件与本地 CLI 路径未变，原阻塞继续作为未解决 gate；不得将最新文本契约通过理解为新增 SQL 已可应用。

前次环境：Darwin arm64；Docker client 29.7.1 / server 29.5.2；Supabase CLI 2.99.0；隔离 PostgreSQL 17.6；pnpm 10.33.0。

既有 `supabase_db_gooes` 正在运行，因此没有对共享项目 reset。临时项目位于 Git 忽略的 `node_modules/.cache/promotion-verification`，project ID 为 `gooes-promotion-verification`，端口由 543xx 改为 553xx。临时 config 复制自仓库，未复制 `.env`、linked project 或远端连接配置；migrations 链接到仓库完整目录，不筛选或修改 SQL。为先启动 Supabase 自身完整基线，临时禁用 migrations 和 seed；start 成功后重新开启 migrations，保留 seed 禁用，然后实际执行完整 reset。

以下按实际执行顺序记录准备与验证命令，cwd 均为 worktree 根目录。本次仅复制 `supabase/config.toml`，再创建指向完整 `supabase/migrations` 的符号链接；没有复制 seed、functions、`.env` 或 `supabase/.temp`。以下临时目录在执行前不存在，执行后已清理；这些命令用于复现记录，本次补充文档没有重新运行数据库验证。

```bash
python3 - <<'PY'
from pathlib import Path
import re

root = Path.cwd()
target = root / 'node_modules/.cache/promotion-verification'
(target / 'supabase').mkdir(parents=True, exist_ok=True)
config = (root / 'supabase/config.toml').read_text()
config = config.replace(
    'project_id = "gooes"',
    'project_id = "gooes-promotion-verification"',
)
config = re.sub(r'\b543(\d\d)\b', r'553\1', config)
config = config.replace(
    '[db.migrations]\n'
    '# If disabled, migrations will be skipped during a db push or reset.\n'
    'enabled = true',
    '[db.migrations]\n'
    '# Initially disabled to start the isolated baseline.\n'
    'enabled = false',
)
config = config.replace(
    '[db.seed]\n'
    '# If enabled, seeds the database after migrations during a db reset.\n'
    'enabled = true',
    '[db.seed]\n'
    '# Seed disabled for disposable migration verification.\n'
    'enabled = false',
)
(target / 'supabase/config.toml').write_text(config)
(target / 'supabase/migrations').symlink_to(
    root / 'supabase/migrations', target_is_directory=True,
)
PY

supabase start --workdir node_modules/.cache/promotion-verification \
  --exclude analytics,vector,studio,edge-runtime,realtime,imgproxy,inbucket \
  > node_modules/.cache/promotion-verification/start.log 2>&1
```

端口替换覆盖 config 中全部独立的 `543xx` 数值，例如 API `54321→55321`、数据库 `54322→55322`、shadow `54320→55320`。准备脚本对配置中已有的 `env(...)` 引用只保留变量名，不读取或写入其值。CLI 自动创建本地实例凭据；本记录不包含这些值，也不使用完整连接串。`start.log` 可能含本地凭据，未提交，已随临时目录删除。

确认 start exit 0 后，仅重新开启临时 config 的 migrations 开关，seed 仍为 false：

```bash
python3 - <<'PY'
from pathlib import Path

p = Path('node_modules/.cache/promotion-verification/supabase/config.toml')
config = p.read_text().replace(
    '# Initially disabled to start the isolated baseline.\nenabled = false',
    '# Full repository migration chain enabled for isolated reset.\nenabled = true',
)
p.write_text(config)
PY

supabase db reset --local --no-seed --yes \
  --workdir node_modules/.cache/promotion-verification \
  > node_modules/.cache/promotion-verification/reset.log 2>&1

# reset 失败后单独执行此只读命令，获取实际 applied / pending 状态。
supabase migration list --local \
  --workdir node_modules/.cache/promotion-verification \
  > node_modules/.cache/promotion-verification/migration-list.log 2>&1
```

前次结果：start exit 0；reset **exit 1**；migration list exit 0。完整链执行到历史文件：

```text
20260826141500_prepare_supplier_purchase_batch_catalog_search.sql
ERROR: CREATE INDEX CONCURRENTLY cannot be executed within a pipeline (SQLSTATE 25001)
At statement: 2
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  supplier_products_product_code_batch_catalog_trgm_idx
ON public.supplier_products
USING gin (product_code extensions.gin_trgm_ops)
```

Root Cause：该 migration 首行已有 `-- gooes:migration-mode=nontransactional`。Supabase CLI reset 使用 pipeline 执行，无法按仓库 marker 把该并发索引文件放在事务外执行。此问题先于本功能 migration，不能据此判断本功能 SQL 已通过或失败。

已查阅 [非事务索引操作手册](../../runbooks/supplier-purchase-batch-nontransactional-migrations.md)、`.github/workflows/migrate-dev-database.yml`、对应 production workflow，以及 `scripts/verify-warehouse-stage-b-database.ts`。正式 workflow 内嵌 runner 会在事务外执行标记文件、核验索引元数据后登记 history；dev workflow 固定开发项目确认、host 和 `/opt/gooes-dev/docker/.env.dev.db`，没有可直接调用的本地完整链模式。现有 warehouse 隔离脚本只选采购域且排除特定数据修复，明确不等同于完整链。因此未触发远端 workflow、未删改历史 migration、未跳过失败版本、未手工补 history，也未只执行活动单文件。

前次 `supabase migration list --local` 及隔离容器只读 psql 核对结果：

```text
Local migration files: 631
Applied migrations in isolated local database: 521
Latest applied: 20260826141000
Target row:
20260916170000 |                | 2026-09-16 17:00:00
```

这里 CLI 的 Remote 列指向隔离本地数据库，**并未对齐**，110 个版本仍 pending。未连接云端开发或生产数据库。只读核对命令：

```bash
docker exec supabase_db_gooes-promotion-verification \
  psql -U postgres -d postgres -X -At \
  -c "select current_setting('server_version'),count(*),max(version) from supabase_migrations.schema_migrations;"
```

## 未完成门禁与回滚

- **真实 RPC smoke：NOT_RUN。** 完整链在前述历史 migration 停止，`20260916170000` 未应用；没有活动对象可供验证。默认 2000、三档预览、future/active、半开区间、有效套餐列表、重叠拒绝、停止恢复及订单 snapshot/amount 仅有前述契约/mock 测试证据，均待完整 schema 上真实 SQL 验证。未插入临时员工、套餐或订单。
- **生成类型：NOT_RUN。** `apps/api/src/types/database.ts` 保持不变；等待 Task 9 dev migration 后生成/核对。只有指定 development project 确认迁移应用后才能运行 `bun run gen`，本次未连接该项目或伪造类型。本轮也核对了前次 SHA 至最新 HEAD 的该文件差异，结果为空。
- **Admin 交互 smoke：NOT_RUN。** 当前隔离数据库未完成活动 schema，未建立可用的本地活动 API/平台登录数据；现有 service-access E2E mock 是其他业务流程。没有为此修改配置、绕过鉴权或发送远端请求。Tabs、弹窗、pending 的真实交互仍为开发联调门禁。
- 未执行真实支付、Orange 真机验收、development migration/apply/deploy 或 production 操作；未修改或操作 Orange 工作区。
- 本次清理只销毁新建隔离实例及其数据卷；共享 `gooes` 本地实例继续运行。未对任何真实数据执行回滚。
- 将来活动回退按 migration 内既定说明：先使用带审计的 stop 命令停止已发布活动，再以审查后的 forward migration 恢复之前订单/产品 RPC 并撤销活动 RPC 权限；保留活动版本历史和已有订单冻结快照，不能删除历史或重新定价旧订单。本次没有执行该远端回退。

隔离环境清理命令：

```bash
supabase stop --project-id gooes-promotion-verification --no-backup --yes \
  --workdir node_modules/.cache/promotion-verification
```

清理命令 exit 0；确认隔离实例容器不存在，共享 `supabase_db_gooes` 仍 healthy。临时 config、日志和迁移链接已删除。

证据只提交本 Markdown；本地凭据、连接串、支付字段、签名 URL、OpenID 和用户明细不进入证据。提交前再次检查 `git diff --check`、`git diff --cached --check`、证据敏感信息及类型文件差异；提交后核对工作区 clean。


## Task 9 开发发布门禁（2026-09-17 北京时间）

本轮结论：**BLOCKED**。2026-09-16 17:44 UTC（北京时间 2026-09-17 01:44）的正式开发迁移 plan 成功，但返回 5 条 pending migration，其中 4 条不是本次活动 migration；因此未执行 apply、类型生成、API/Admin release 或活动 smoke。前文 Task 8 本地检查结果保持历史记录，不能替代本节开发发布门禁。

### 固定发布版本与预检

- 工作区：`.worktrees/platform-service-promotion`；操作前 `git status --porcelain` 为空。
- reviewed release SHA：`07c7da008118c97fb2203b3cf68d820d58b9bacc`。
- release branch：`release/platform-service-promotion-dev-20260917`。
- origin：`https://github.com/LeeFo-china/goose.git`；GitHub CLI 已认证。
- 推送前确认远端同名分支不存在；仅创建、推送该独立分支，随后 `git ls-remote --heads` 精确核对远端 SHA。未推送 main。
- 本节证据提交位于 `feature/platform-service-promotion`，不移动已固定的 release branch。

### 正式 workflow 结果

| 阶段 | Run ID / URL | 结果 |
| --- | --- | --- |
| Migration plan | [35130052574](https://github.com/LeeFo-china/goose/actions/runs/35130052574) | workflow success；发布门禁 BLOCKED：pending 5 条 |
| Migration apply | 未触发 | 被 pending 范围门禁阻断 |
| API/Admin release | 未触发 | 未应用 migration，不允许发布 |

plan 使用 `migrate-dev-database.yml`，输入 `mode=plan`、`confirm_dev_project_ref=fclnkyatvfvmzgzdqlba`；触发 ref 为上述 release branch。run 的 `event=workflow_dispatch`、`headBranch` 和完整 `headSha` 均已核对，createdAt 为 `2026-09-16T17:44:31Z`，completed/updatedAt 为 `2026-09-16T17:44:44Z`。`gh run watch --exit-status` 返回 0；随后再次读取完成态元数据和白名单过滤的迁移摘要。

脱敏摘要：

```text
mode=plan
before_count=626
before_latest=20260914191000
after_count=626
after_latest=20260914191000
pending_count=5
pending_versions=20260914202700 20260915090000 20260915092804 20260916133000 20260916170000
applied_count=0
applied_versions=
```

与本地 migration 文件对应的完整待执行清单：

1. `20260914202700_accept_douyin_official_lead_attribution.sql`
2. `20260915090000_remove_douyin_clue_component_dependency.sql`
3. `20260915092804_douyin_source_dashboard_stats.sql`
4. `20260916133000_supplier_purchase_receipt_delivery_note_attachments.sql`
5. `20260916170000_create_platform_service_promotions.sql`（本次目标）

这表明开发库缺少当前 release SHA 中的四条前置迁移。没有删改待执行文件、修改迁移历史、手工执行远端 DDL/DML 或绕过 gate。解除阻塞需要先由对应范围的开发迁移流程审查并处理四条非目标 migration，再重新执行本活动 plan，不能直接用本次 plan 结果执行 apply。

### 未完成门禁

- **Migration list：NOT_RUN。** 本次停在只读 plan，未发生 apply。现有 `migrate-dev-database.yml` 本身只输出 migration history 数量/版本摘要，没有运行 `supabase migration list`；后续 apply 后仍须独立取得严格 Local/Remote 对齐证据。`release-dev.yml` 的部署前 reusable migration gate 会运行 `supabase@2.99.0 migration list`，但本轮未触发 release，不能引用它为已完成检查。
- **数据库类型：NOT_RUN。** 因活动 migration 未应用，未运行 `bun run gen`；`git diff -- apps/api/src/types/database.ts` 为空。
- **API/Admin 部署与健康：NOT_RUN。** 没有新的 release run、镜像 revision 或部署后健康结果。
- **认证 Admin/API smoke：NOT_RUN。** 未创建、发布或停止活动，没有 promotion ID/version 可记录；默认 2 折、空时间、未来一小时三档价格与 `product_version_id`、scheduled → stopped、租户商品恢复日常价仍待开发联调。
- **浏览器交互、Orange 真机与真实支付验收仍未完成。** 本轮未触发支付，未访问或改写 Orange 工作区，未执行 production workflow 或数据库操作。

本轮仅提交本 Markdown。提交前核对 `git diff --check`、暂存差异、敏感信息模式和生成类型差异；不保存原始 workflow 日志、凭据、签名、OpenID 或用户信息。


## Task 9 继续执行：五条开发迁移与发布（2026-09-17 北京时间）

用户确认按推荐方案继续，明确授权通过正式开发 workflow 顺序应用上述 5 条 pending migration，随后发布 API/Admin 并做无真实支付 smoke。固定 release branch/SHA 仍为 `release/platform-service-promotion-dev-20260917` / `07c7da008118c97fb2203b3cf68d820d58b9bacc`，未改变 release branch。

### 重跑 plan 与正式 apply

| 阶段 | Run | 结果 |
| --- | --- | --- |
| 重跑 plan | [35160075051](https://github.com/LeeFo-china/goose/actions/runs/35160075051) | success；2026-09-16T22:56:54Z 创建；pending 恰好授权 5 条，626 → 626，applied 0 |
| 正式 apply | [35160138552](https://github.com/LeeFo-china/goose/actions/runs/35160138552) | success；2026-09-16T22:57:48Z 创建；626 → 631，applied 5，latest `20260916170000` |

两次 workflow 均经 `gh run watch --exit-status` 和完成态元数据核验，headSha 与上述固定 SHA 精确一致。plan 前本地 631 个唯一 migration 版本减去 5 条 pending 恰好等于 remote history 626 条，结合 pending 集合推导没有 remote-only 版本；这不是内容 checksum 校验。

实际 applied_versions 按顺序为：

```text
20260914202700 20260915090000 20260915092804 20260916133000 20260916170000
```

应用通过现有 `migrate-dev-database.yml` 执行；未手工执行远端 DDL/DML、db push 或 migration repair。工作流逐 migration 提交，不宣称五条为同一事务。

应用后通过现有开发 runner 的 CLI 执行只读 `supabase@2.99.0 migration list --db-url`。先核对 runner checkout 固定 SHA，再使用仓库 `validate-dev-database-target.mjs --direct-migration-history` 校验开发 project/host，连接串仅在远端进程环境中使用。远端与本地 `verify-migration-history.mjs` 均确认 **631 条 Local/Remote 严格对齐**，目标显式为 `20260916170000`。日志不含连接串或凭据；完整列表仅暂存于忽略目录。

### 类型生成门禁

已执行 `bun run gen`，指定 project ref 为 `fclnkyatvfvmzgzdqlba`。Supabase 管理 API 返回 `failed to retrieve generated types: {"message":"Project must be active and healthy."}`，exit 1；一次只读诊断重试得到相同错误。由于脚本输出重定向会截断文件，失败后立即恢复原始 `apps/api/src/types/database.ts`，核对无差异。

因此 **类型生成仍未完成**，没有伪造 promotion/attachments 类型或将失败空文件提交。该错误来自管理 API 的项目状态，不等同于迁移实际使用的 self-hosted 开发数据库状态；后者已通过上述严格 history 验证。继续使用已通过本地检查的固定 release SHA，类型文件保持不变。

### 首次发布失败与开发 runner 恢复

首次 [Release Dev 35160393023](https://github.com/LeeFo-china/goose/actions/runs/35160393023) 创建于 `2026-09-16T23:01:06Z`，结束于 `2026-09-16T23:02:30Z`，headSha 正确。API 镜像构建 failure，Admin job cancelled，workflow 内迁移 gate 与 API/Admin deploy 均 skipped。没有部署本次版本；不可将 prepare/认证预检成功描述为发布成功。

根因证据：GitHub job annotation 为 `System.IO.IOException: No space left on device`，runner 无法写 `_diag/Worker_20260916-230136-utc.log`，完整失败 job 日志未能上传（`log not found`）。只读 `df -h /` 显示 59G 分区 100%、可用 0；早期 annotation 仅剩 51 MB。磁盘耗尽随后导致开发 PostgreSQL 写 `postmaster.pid`/恢复文件失败，DB、realtime 和 social-video-worker 自动重启，REST/pooler 短暂 unhealthy。API/Admin 容器仍 healthy、根路径/登录页 HTTP 200，但这不表示当时全部数据库功能可用。

只读容量审计显示 Images 152 个/33.94GB、Build Cache 157 项/5.846GB（active 0，全部 reclaimable）、Containers 29 个、Volumes 13 个。`/opt/gooes-dev/docker/backups` 不存在；`/tmp` 中仍有四份历史 preapply 备份，未删除。runner 日志约 584MB、系统日志约 521MB，均未删除；既有 rollback 镜像和配置备份保持。

经单独授权，仅执行 `docker builder prune --all --force`，exit 0，输出回收 **5.846GB**。此前首次包装命令在只读容器快照阶段即退出，尚未到达 prune；随后直接执行上述获授权命令。没有执行 image/container/volume/system prune，没有删除备份、runner work、日志或配置，没有手动 restart/recreate/down。

清理后 `df` 可用约 4.9G、使用率 92%；Build Cache 归零，Images 仍 152、Containers 仍 29、Volumes 仍 13。共享层释放使 Docker 报告的 Images 占用降至 28.73GB，未执行镜像删除命令。DB、REST、realtime、pooler、social-video-worker 均自行恢复 healthy；API/Admin 保持 healthy。恢复后重新执行只读 migration list 和本地严格 verifier，再次确认 631 条对齐、目标活动 migration 存在。

已按 runbook 以全新 dispatch 启动 [Release Dev 35161044686](https://github.com/LeeFo-china/goose/actions/runs/35161044686)，createdAt `2026-09-16T23:09:42Z`，同一固定 SHA、`service=api,admin`、`operation=release`；没有对旧 run 使用 Re-run。


第二次合并服务 release `35161044686` 的 API build 成功，可信 `dev-build-plan` 的 build/deploy services 均精确为 `api,admin`。API manifest 绑定本 run/SHA。Admin 冷构建时磁盘由 4.9G → 3.6G → 1.9G → 959MB；为避免再次满盘，主动取消该 run，最终结论 cancelled，所有 deploy 与内建 history gate skipped。DB/API/Admin/REST/realtime 持续 healthy，未发生第二次数据库故障。取消后临时构建层释放，磁盘恢复约 1.9G。

随后只读审计：48 项 unused build cache 共 2.989GB，dangling image 列表为空；保留所有 tagged/current/rollback images。`docker system df` 曾在构建取消收尾期间返回 snapshot NotFound，稍后复查成功；未通过重启 Docker 或删除存储修复。

为降低峰值，获授权改为同一固定 SHA 分两次正式 release：先 API 发布健康，再清 unused build cache，再 Admin 发布。第二次仅 `docker builder prune --all --force` 回收 2.989GB，磁盘恢复 4.4G/93%；29 个容器均保留，所有带 healthcheck 服务 healthy。已核对 workflow service 为字符串输入，仓库 resolver 单独接受 `api` 和 `admin`。

API 单服务 [Release Dev 35161715441](https://github.com/LeeFo-china/goose/actions/runs/35161715441) 创建于 `2026-09-16T23:18:31Z`，headSha 仍为固定 `07c7da008118c97fb2203b3cf68d820d58b9bacc`。


API 单服务 release **success**，内建严格迁移历史 gate 于 `23:21:04Z` 完成，API deploy 于 `23:21:48Z` 完成，run 最终于 `2026-09-16T23:22:05Z` success。下载的 migration evidence 经本地 `verify-dev-migration-evidence.mjs` 复验通过，绑定 development/固定 SHA；gate 的既有目标为 `20260711120000`，本次活动版本另由前述目标 `20260916170000` 的完整列表校验覆盖。

独立 Docker inspect：API running/healthy，revision 为固定 SHA、run label `35161715441`，镜像 digest `sha256:37a09add4c487c6e5e52ba03e0ffeabb4c9bed74e312dec84e9a7b44212d6ef5`，与下载的本 run API manifest 精确一致。Admin 此时仍旧版本 healthy，证明 API 先于 Admin。新 API 的正常超管鉴权活动列表返回 HTTP 200、total 0，属于只读检查。

第三次仅清 unused build cache 回收 **1.135GB**，可用空间恢复至 `4,268,978,176` bytes（`df -h` 显示 4.0G，93%）；API/Admin/DB/REST/realtime 全部 healthy。随后新建 Admin 单服务 [Release Dev 35162095785](https://github.com/LeeFo-china/goose/actions/runs/35162095785)，createdAt `2026-09-16T23:23:44Z`，仍使用固定 SHA。


### 最终开发发布结果与镜像核验

Admin 单服务 release **success**，内建严格迁移 gate 于 `23:31:45Z` 完成，Admin deploy 于 `23:32:16Z` 完成，run 最终于 `2026-09-16T23:32:27Z` success。下载的 Admin build-plan 确认 build/deploy services 均仅为 `admin`；migration evidence 再次通过本地 verifier。

| 服务 | 最终成功 run | 独立 inspect revision | manifest 与容器一致的 digest |
| --- | --- | --- | --- |
| API | [35161715441](https://github.com/LeeFo-china/goose/actions/runs/35161715441) | `07c7da008118c97fb2203b3cf68d820d58b9bacc` | `sha256:37a09add4c487c6e5e52ba03e0ffeabb4c9bed74e312dec84e9a7b44212d6ef5` |
| Admin | [35162095785](https://github.com/LeeFo-china/goose/actions/runs/35162095785) | `07c7da008118c97fb2203b3cf68d820d58b9bacc` | `sha256:149e987a968083aa439a3be1c3cded9c0a59de94728c078816e5a09c01fa698f` |

两个容器独立 inspect 均 running/healthy，run label 分别等于各自成功 run。API deploy 完成早于 Admin deploy 开始，发布顺序符合要求。两个正式 workflow 都成功通过部署前 migration list 门禁和既有健康/登录态 project-health smoke；production 镜像校验任务未执行。没有把失败或取消 run 的镜像证据混入最终发布结果。

### 认证 Admin/API 无支付 smoke

通过现有开发登录流程取得平台超管和租户测试会话，凭据只在进程内存中使用。所有业务操作经 `https://admin-dev.goodcms.cn/api/backend` 代理请求已发布 API，未伪造身份、直接调用 service-role RPC 或手工写数据库。开始前正常分页列表确认没有 active/scheduled 活动；未触碰其他活动。

实际通过 13 项检查，流程为：

1. 默认创建草稿，确认 `discount_rate_basis_points=2000`、开始/结束时间均为 null。
2. 以响应的 `server_time` 为基准设为未来一小时开始、持续一小时，保存成功。
3. 确认预览恰好为三档正式商品，每档均有有效 UUID `product_version_id` 及正整数原价/日常价/活动价。
4. 发布携带三档唯一商品版本，重新分页读取活动为 `phase=scheduled`。
5. 调用正式 stop 命令并重新读取为 `phase=stopped`。
6. 租户 `GET /billing/service-products?page=1&pageSize=20` 三档均 `promotion=null`，`amount_fen=base_amount_fen`，且等于 smoke 前的日常价。

活动 ID（脱敏）：`d71304…9441`；最终 aggregate version：`4`；活动已停止。只保留停用后的审计历史，没有创建订单或提交支付。预览金额单位为分：

| 商品 | 原价 `list_amount_fen` | 日常价 `base_amount_fen` | 活动价 `effective_amount_fen` |
| --- | --- | --- | --- |
| `platform_service_1y` | 980000 | 980000 | 196000 |
| `platform_service_2y` | 1960000 | 1568000 | 313600 |
| `platform_service_3y` | 2940000 | 2058000 | 411600 |

这是开发数据库真实认证 API/BFF 流程验证，不是浏览器点击或 Orange 真机验收，也不覆盖真实支付、并发锁或时间边界的全部数据库验收场景。

### 最终容量、状态和剩余门禁

smoke 完成后，按单独授权第四次仅执行 `docker builder prune --all --force`，exit 0，回收 **3.199GB**。最终磁盘约 **3.9G 可用 / 94%**，Build Cache 为 0，运行容器 29 个、Volumes 13 个；全部带 healthcheck 的业务/Supabase 服务 healthy，API 根和 Admin 登录页均 HTTP 200。所有清理均仅针对 unused build cache，未删除 tagged/current/rollback images、容器、volume、备份、日志或配置。

最终结论：**DONE_WITH_CONCERNS**。

- 开发迁移、严格 history 对齐、API 先 Admin 同 SHA 发布、真实认证无支付 smoke 已完成。
- 管理 API 的 `bun run gen` 仍失败，`database.ts` 恢复原样且无差异；需要单独恢复/确认指定项目的类型生成通道，不伪造 schema 类型。
- 浏览器 Tabs/弹窗/pending 交互、Orange 真机、真实支付及更完整并发/时间边界数据库验收仍未完成；未执行 production 发布或生产数据库操作，未改写 Orange。
- 开发 runner 总磁盘仍偏紧；本次靠分服务发布与清 unused cache完成，长期容量和构建缓存治理另行处理，不在本任务扩展清理范围。

本次仅更新本证据文件并在功能分支提交；release branch 继续指向固定 `07c7da008118c97fb2203b3cf68d820d58b9bacc`。原始认证响应、token、支付参数、签名、OpenID 和用户明细均未写入证据。最终执行差异/敏感信息检查，确认生成类型未变。
