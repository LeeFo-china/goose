# 技术服务限时活动本地验证证据

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
