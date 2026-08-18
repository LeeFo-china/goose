# PR #71/#72 回退与供应商目录重实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留 Git 与数据库审计历史的前提下，撤销 PR #71/#72 的应用行为，并重新严格执行已批准的租户私有目录、商品与价格实施计划。

**Architecture:** Git 使用反向 revert，不改写 `main` 历史；开发库中已执行的 migration 文件永久保留，并增加由 RED tests 驱动的最小应用查询边界和前向兼容 migration，保证旧商品/SKU/价格路径不跨租户读写且原子写入归属。重实施继续保留 PR #66 的所有权、私有供应商和内部编码基础，重新执行计划 3，完成审查后再进入计划 4。

**Tech Stack:** Git、Bun、TypeScript、Fastify、Supabase/PostgreSQL migration、Next.js 15、React 19、Playwright、GitHub Actions。

---

## 不可变边界

- 不删除或改写 GitHub PR #71/#72 记录。
- 不 force push `main`，不删除已经执行过的 migration 文件。
- 不回退 PR #66；它是计划 3 的前置基础。
- 不手工对远端数据库执行 DDL/DML；远端 schema 变更只通过受控 migration workflow，远端验证只读。
- 生产库未应用本批 migration，不对生产库执行回退动作。
- 在前向兼容 migration 与计划 3 v2 均合并、开发环境验收通过并审查 production plan 前，Production Database Migration apply 固定为 `HOLD`。
- 开发库审计完成前，不执行任何破坏性补偿 migration。

### Task 1: 建立隔离工作区并完成开发库只读审计

**Files:**
- Create: `docs/audit/2026-08-18-pr71-pr72-rollback-readiness.md`
- Reference: `supabase/migrations/20260813170000_create_tenant_private_catalog.sql`
- Reference: `supabase/migrations/20260813180000_scope_supplier_products_and_prices.sql`
- Reference: `supabase/migrations/20260813185000_scope_catalog_codes.sql`
- Reference: `supabase/migrations/20260813195000_allow_platform_product_write.sql`

- [ ] **Step 1: 创建独立回退 worktree**

执行 `using-git-worktrees` 技能，在已忽略的 `.worktrees/` 下创建：

```bash
git worktree add .worktrees/revert-supplier-catalog-pr71-pr72 \
  -b revert/supplier-catalog-pr71-pr72 origin/main
```

期望：新 worktree 的 HEAD 为 `631b741d`，分支跟踪 `origin/main`。

- [ ] **Step 2: 记录 Git 和 PR 边界**

运行：

```bash
git status --short --branch
git log --oneline --decorate -5 main
gh pr view 71 --json number,state,mergedAt,mergeCommit,headRefName,baseRefName,url
gh pr view 72 --json number,state,mergedAt,mergeCommit,headRefName,baseRefName,url
```

期望：工作树干净；`main` 顶部依次为 `631b741d`、`447196bb`、`b5b048a1`。

- [ ] **Step 3: 只读查询开发库新增数据和回退阻塞项**

通过仓库配置的 `mcp:supabase:query` 对开发库执行以下只读 SQL：

```sql
select version
from supabase_migrations.schema_migrations
where version in (
  '20260813170000',
  '20260813180000',
  '20260813185000',
  '20260813195000'
)
order by version;

select
  (select count(*) from public.catalog_spec_definitions) as spec_count,
  (select count(*) from public.catalog_unit_suggestions) as unit_suggestion_count,
  (select count(*) from public.supplier_sku_unit_conversions) as conversion_count,
  (select count(*) from public.supplier_products
    where ownership_scope = 'platform') as platform_product_count,
  (select count(*) from public.supplier_skus
    where ownership_scope = 'platform') as platform_sku_count,
  (select count(*) from public.catalog_categories
    where ownership_scope = 'tenant') as tenant_category_count,
  (select count(*) from public.catalog_brands
    where ownership_scope = 'tenant') as tenant_brand_count;

select upper(btrim(code)) as normalized_code, count(*) as duplicate_count
from public.catalog_categories
group by upper(btrim(code))
having count(*) > 1
order by normalized_code;

select upper(btrim(code)) as normalized_code, count(*) as duplicate_count
from public.catalog_brands
group by upper(btrim(code))
having count(*) > 1
order by normalized_code;
```

期望：查询只返回计数和编码，不输出联系人、价格、合同等敏感明细。

- [ ] **Step 4: 写入审计报告**

报告必须记录：精确查询时间、开发项目标识、4 个 migration 的执行状态、七类新增数据计数、分类/品牌全局重复编码数量、无敏感信息的原始结果摘要、开发环境自动部署记录、生产 workflow 未执行的证据范围，以及是否允许进入 Git 回退。

- [ ] **Step 5: 验证隔离工作区基线**

```bash
bun run api:typecheck
bun run admin:check
bun test packages/domain/src/supplier-catalog.test.ts \
  packages/domain/src/supplier-product.test.ts
```

期望：全部退出码为 0。

### Task 2: 提交审计证据并建立恢复锚点

**Files:**
- Create: `docs/audit/2026-08-18-pr71-pr72-rollback-readiness.md`
- Create: `docs/superpowers/plans/2026-08-18-revert-pr71-pr72-and-reimplement-supplier-catalog.md`

- [ ] **Step 1: 暂存并检查两个文档**

```bash
git add \
  docs/audit/2026-08-18-pr71-pr72-rollback-readiness.md \
  docs/superpowers/plans/2026-08-18-revert-pr71-pr72-and-reimplement-supplier-catalog.md
git diff --cached --check
git diff --cached --stat
```

- [ ] **Step 2: 提交审计和执行计划**

```bash
git commit -m "docs(supplier): 记录目录回退执行计划"
```

- [ ] **Step 3: 创建回退前备份 tag**

```bash
git tag -a backup/pr71-pr72-before-revert 631b741d -m "backup before reverting PR #71 and #72"
git push origin backup/pr71-pr72-before-revert
```

- [ ] **Step 4: 确认恢复锚点和分支状态**

```bash
git status --short --branch
git rev-parse backup/pr71-pr72-before-revert
git show --stat --oneline HEAD
```

期望：tag 指向 `631b741d`；HEAD 为审计文档提交；工作树干净。

### Task 3: 反向撤销应用代码并保留 migration 历史

**Files:**
- Revert: PR #72 application/domain/admin changes.
- Revert: PR #71 application/domain/admin changes.
- Preserve: the four `20260813*.sql` migration files listed in Task 1.

- [ ] **Step 1: 无提交地反向撤销两个合并提交**

```bash
git revert --no-commit 631b741de12b8c4351f75ca221fb484747a718a2
git revert --no-commit 447196bb680e4ccce51f5c82d235b0bd524b22de
```

- [ ] **Step 2: 恢复已在开发库执行的 migration 文件**

```bash
git restore --source=631b741d --staged --worktree -- \
  supabase/migrations/20260813170000_create_tenant_private_catalog.sql \
  supabase/migrations/20260813180000_scope_supplier_products_and_prices.sql \
  supabase/migrations/20260813185000_scope_catalog_codes.sql \
  supabase/migrations/20260813195000_allow_platform_product_write.sql
```

- [ ] **Step 3: 校验回退范围**

```bash
git diff --cached --name-status
git diff --cached --check
git diff --cached --exit-code b5b048a1 -- . \
  ':(exclude)supabase/migrations/20260813170000_create_tenant_private_catalog.sql' \
  ':(exclude)supabase/migrations/20260813180000_scope_supplier_products_and_prices.sql' \
  ':(exclude)supabase/migrations/20260813185000_scope_catalog_codes.sql' \
  ':(exclude)supabase/migrations/20260813195000_allow_platform_product_write.sql' \
  ':(exclude)docs/audit/2026-08-18-pr71-pr72-rollback-readiness.md' \
  ':(exclude)docs/superpowers/plans/2026-08-18-revert-pr71-pr72-and-reimplement-supplier-catalog.md'
```

期望：应用代码与 `b5b048a1` 一致；仅保留四个历史 migration 和审计文档差异。

- [ ] **Step 4: 运行回退后的静态门禁**

```bash
bun run api:typecheck
bun run admin:check
bun run check:file-size
git diff --cached --check
```

期望：全部退出码为 0，不使用 `--no-verify`。

- [ ] **Step 5: 提交回退**

```bash
git add -A
git diff --cached --check
git diff --cached --stat
git commit -m "revert(supplier): 回退目录商品阶段实现"
```

Task 3 的回退提交只是本地原子历史节点；在 Task 4 全部 GREEN 前禁止推送、部署或创建 PR。

### Task 4: 建立旧应用读写路径的前向兼容门禁

**Files:**
- Modify: `apps/api/src/repositories/supplier-products.ts`
- Modify: `apps/api/src/repositories/supplier-products.test.ts`
- Modify: `apps/api/src/services/supplier-products.ts`
- Modify: `apps/api/src/services/supplier-products.test.ts`
- Modify: `apps/api/src/repositories/supplier-price-lists.ts`
- Modify: `apps/api/src/repositories/supplier-price-lists.test.ts`
- Modify: `apps/api/src/services/supplier-price-lists.ts`
- Modify: `apps/api/src/services/supplier-price-lists.test.ts`
- Create: `apps/api/src/services/supplier-catalog-revert-compatibility-migration-contract.test.ts`
- Create: `supabase/migrations/20260818120000_preserve_pre_v2_supplier_catalog_boundaries.sql`
- Create: `scripts/smoke-supplier-catalog-revert-compatibility.sql`

- [ ] **Step 1: 在回退分支运行供应商基础测试**

```bash
cd apps/api
bun test src/services/tenant-suppliers.test.ts \
  src/services/tenant-supplier-private-commands.test.ts
cd ../..
pnpm --dir apps/admin test:e2e:supplier-catalog
pnpm --dir apps/admin test:e2e:supplier-product-pricing
```

期望：私有供应商和内部编码基础仍可用。API 测试必须从 `apps/api` 执行，否则 `@/` 路径别名不会按 API tsconfig 解析。

- [ ] **Step 2: 写 RED repository/service 隔离测试**

测试必须先证明回退后的旧代码存在以下缺口：

- 商品列表、详情、SKU 列表和直接更新没有限制为 platform、历史 NULL 或当前 tenant；
- 价格列表、详情、条目列表和直接更新没有限定当前 `tenant_id`；
- service 没有把认证范围中的 `tenantId` 传入这些 repository 方法。

```bash
cd apps/api
bun test \
  src/repositories/supplier-products.test.ts \
  src/services/supplier-products.test.ts \
  src/repositories/supplier-price-lists.test.ts \
  src/services/supplier-price-lists.test.ts
```

期望：新增边界断言 FAIL，且失败原因是缺少目标过滤条件。

- [ ] **Step 3: 写 RED migration contract**

测试必须证明：

- 商品/SKU 创建 RPC 所经过的 `BEFORE` guard 在单个事务内写入 `ownership_scope='tenant'` 和 `owner_tenant_id=acting_tenant_id`；
- 商品/SKU 更新、启停及子资源命令由兼容期写 guard 阻断 platform、历史 NULL 或其他租户数据；
- 价格 RPC 所经过的 `BEFORE` guard 在价格簿和条目 INSERT 时显式派生 `tenant_id`，并校验新版本来源、价格簿父项和 SKU 租户范围；
- 会在写入前返回版本/状态的 lifecycle RPC 必须先按 tenant/ownership 校验目标，不得向其他租户暴露 `version`、`current_status` 或冲突原因；
- 保留幂等键、乐观版本、合作关系校验和审计；
- 禁止 DROP 四个历史 migration 创建的表、字段、触发器或索引。

```bash
cd apps/api
bun test src/services/supplier-catalog-revert-compatibility-migration-contract.test.ts
```

期望：因前向兼容 migration 尚不存在而 FAIL。

- [ ] **Step 4: 实现最小应用读边界并运行 GREEN**

Service 只从 `SupplierProxyScope` 传递可信 `tenantId`。Repository：

- 商品读取允许 platform、历史 NULL 和当前 tenant；写操作只允许当前 tenant；
- 价格所有读写同时限定 `supplier_id` 和当前 `tenant_id`；
- 列表保持 `.range()` 分页和必要字段选择；不新增依赖或跨层访问 Supabase。

重复运行 Step 2 命令，期望 PASS。

- [ ] **Step 5: 实现最小前向兼容 migration 并运行 GREEN**

替换既有归属 guard function 并新增兼容期写 guard，使旧商品、SKU 和价格 RPC 在原事务内原子写入归属；将旧 lifecycle 函数重命名为撤销 `service_role` 权限的内部实现，再用同签名 wrapper 先做 fail-closed 租户预检并保留同租户幂等 replay。兼容期复用已有查询索引，不在本次显式事务 migration 中增加可能阻塞生产写入的普通索引；确需新索引时依据开发库执行计划另建前向 migration。不删除四个历史 migration 的 schema，不恢复目录、规格、平台商品或 Admin 功能。

```bash
cd apps/api
bun test src/services/supplier-catalog-revert-compatibility-migration-contract.test.ts
```

期望：PASS。

- [ ] **Step 6: 本地应用 migration 并执行事务回滚 smoke**

`scripts/smoke-supplier-catalog-revert-compatibility.sql` 必须使用 `BEGIN`/`ROLLBACK`，在事务内创建两个租户及 active 合作关系测试夹具，以真实 `service_role` 调用旧商品、SKU 和价格写 RPC，并断言：wrapper 为 `SECURITY DEFINER`、固定 `search_path` 且仅 `service_role` 可执行；新增商品/SKU 属于调用租户；价格表和条目的 `tenant_id` 等于调用租户；另一租户无法修改这些数据；平台及历史 NULL 商品/SKU 即使 `acting_tenant_id=NULL` 也不可写。脚本不得留下业务记录。

smoke 必须在事务内自建固定 UUID 的 tenant、employee、supplier、active `tenant_supplier`、product、SKU 和单位夹具，不依赖 `supabase/seed.sql`。只允许连接固定本地端口：

```bash
supabase start
supabase migration up --local

CATALOG_LOCAL_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
case "${CATALOG_LOCAL_DB_URL}" in
  postgresql://postgres:postgres@127.0.0.1:54322/*) ;;
  *) echo "refusing non-local database target" >&2; exit 1 ;;
esac

psql "${CATALOG_LOCAL_DB_URL}" \
  -v ON_ERROR_STOP=1 \
  -f scripts/smoke-supplier-catalog-revert-compatibility.sql
```

期望：脚本输出兼容断言通过，最后执行 `ROLLBACK`；重新查询固定 UUID 返回 0 行。

- [ ] **Step 7: 提交并推送前向兼容变更**

```bash
git add \
  apps/api/src/services/supplier-catalog-revert-compatibility-migration-contract.test.ts \
  apps/api/src/repositories/supplier-products.ts \
  apps/api/src/repositories/supplier-products.test.ts \
  apps/api/src/services/supplier-products.ts \
  apps/api/src/services/supplier-products.test.ts \
  apps/api/src/repositories/supplier-price-lists.ts \
  apps/api/src/repositories/supplier-price-lists.test.ts \
  apps/api/src/services/supplier-price-lists.ts \
  apps/api/src/services/supplier-price-lists.test.ts \
  supabase/migrations/20260818120000_preserve_pre_v2_supplier_catalog_boundaries.sql \
  scripts/smoke-supplier-catalog-revert-compatibility.sql
git diff --cached --check
git commit -m "fix(supplier): 保持目录回退租户边界"
git push -u origin revert/supplier-catalog-pr71-pr72
```

- [ ] **Step 8: 在开发环境先 plan、后 apply，再核对历史**

通过 `Migrate Dev Database` workflow 先运行 `mode=plan`，确认唯一 pending migration 为 `20260818120000`；审查后运行 `mode=apply`：

```bash
CATALOG_EXPECTED_SHA="$(git rev-parse HEAD)"
CATALOG_BEFORE_PLAN_RUN_ID="$(gh run list \
  --workflow migrate-dev-database.yml \
  --branch revert/supplier-catalog-pr71-pr72 \
  --event workflow_dispatch \
  --limit 1 \
  --json databaseId \
  --jq '.[0].databaseId // 0')"

gh workflow run migrate-dev-database.yml \
  --ref revert/supplier-catalog-pr71-pr72 \
  -f mode=plan \
  -f confirm_dev_project_ref=fclnkyatvfvmzgzdqlba

CATALOG_PLAN_RUN_ID=""
for CATALOG_ATTEMPT in $(seq 1 30); do
  CATALOG_RUN_ROW="$(gh run list \
    --workflow migrate-dev-database.yml \
    --branch revert/supplier-catalog-pr71-pr72 \
    --event workflow_dispatch \
    --limit 1 \
    --json databaseId,headSha \
    --jq '.[0] | [.databaseId, .headSha] | @tsv')"
  IFS=$'\t' read -r CATALOG_CANDIDATE_ID CATALOG_CANDIDATE_SHA \
    <<< "${CATALOG_RUN_ROW}"
  if [ -n "${CATALOG_CANDIDATE_ID}" ] \
    && [ "${CATALOG_CANDIDATE_ID}" != "${CATALOG_BEFORE_PLAN_RUN_ID}" ] \
    && [ "${CATALOG_CANDIDATE_SHA}" = "${CATALOG_EXPECTED_SHA}" ]; then
    CATALOG_PLAN_RUN_ID="${CATALOG_CANDIDATE_ID}"
    break
  fi
  sleep 2
done
test -n "${CATALOG_PLAN_RUN_ID}"
gh run watch "${CATALOG_PLAN_RUN_ID}" --exit-status
gh run view "${CATALOG_PLAN_RUN_ID}" --log > /tmp/catalog-plan-run.log
rg -q 'mode=plan([^[:alnum:]_]|$)' /tmp/catalog-plan-run.log
rg -q 'pending_count=1([^0-9]|$)' /tmp/catalog-plan-run.log
rg -q 'pending_versions=20260818120000([^0-9]|$)' /tmp/catalog-plan-run.log

gh workflow run migrate-dev-database.yml \
  --ref revert/supplier-catalog-pr71-pr72 \
  -f mode=apply \
  -f confirm_dev_project_ref=fclnkyatvfvmzgzdqlba

CATALOG_APPLY_RUN_ID=""
for CATALOG_ATTEMPT in $(seq 1 30); do
  CATALOG_RUN_ROW="$(gh run list \
    --workflow migrate-dev-database.yml \
    --branch revert/supplier-catalog-pr71-pr72 \
    --event workflow_dispatch \
    --limit 1 \
    --json databaseId,headSha \
    --jq '.[0] | [.databaseId, .headSha] | @tsv')"
  IFS=$'\t' read -r CATALOG_CANDIDATE_ID CATALOG_CANDIDATE_SHA \
    <<< "${CATALOG_RUN_ROW}"
  if [ -n "${CATALOG_CANDIDATE_ID}" ] \
    && [ "${CATALOG_CANDIDATE_ID}" != "${CATALOG_PLAN_RUN_ID}" ] \
    && [ "${CATALOG_CANDIDATE_SHA}" = "${CATALOG_EXPECTED_SHA}" ]; then
    CATALOG_APPLY_RUN_ID="${CATALOG_CANDIDATE_ID}"
    break
  fi
  sleep 2
done
test -n "${CATALOG_APPLY_RUN_ID}"
gh run watch "${CATALOG_APPLY_RUN_ID}" --exit-status
gh run view "${CATALOG_APPLY_RUN_ID}" --log > /tmp/catalog-apply-run.log
rg -q 'mode=apply([^[:alnum:]_]|$)' /tmp/catalog-apply-run.log
rg -q 'applied_count=1([^0-9]|$)' /tmp/catalog-apply-run.log
rg -q 'applied_versions=20260818120000([^0-9]|$)' /tmp/catalog-apply-run.log
```

apply 后通过开发服务器执行只读 migration list，不输出连接串：

```bash
ssh gooes-dev '
  set -euo pipefail
  set -a
  . /opt/gooes-dev/docker/.env.dev.db
  set +a
  pnpm dlx supabase@2.99.0 migration list \
    --db-url "${SUPABASE_DB_DIRECT_URL}"
' > /tmp/catalog-migration-history.txt

node scripts/verify-migration-history.mjs \
  /tmp/catalog-migration-history.txt \
  supabase/migrations \
  20260818120000
```

期望：五个版本的 Local/Remote 均存在且对齐。

- [ ] **Step 9: 对开发环境执行只读 schema 和 API smoke**

通过受保护 runner 的只读查询核对目标 RPC 定义包含显式商品所有权和价格 `tenant_id` 写入及目标行校验；再通过 development API 读取供应商、合作关系、商品和价格列表。禁止直接对 development DB 调用写 RPC；真实写兼容性由本地数据库事务回滚 smoke 证明。

- [ ] **Step 10: 固化数据库处理决策**

固定决策规则：

- 四个历史 migration 保持只读，兼容性只由 `20260818120000` 前向 migration 修复。
- 不删除字段、表或开发数据。
- 只有审计计数全部为 0、全局编码无重复且存在单独备份时，才另行制定破坏性清理计划；本计划不执行该清理。

### Task 5: 创建并合并回退 PR

**Files:**
- PR body only.

- [ ] **Step 1: 推送分支并创建 PR**

```bash
git push -u origin revert/supplier-catalog-pr71-pr72
gh pr create \
  --base main \
  --head revert/supplier-catalog-pr71-pr72 \
  --title "revert(supplier): 回退目录商品阶段实现" \
  --body-file /tmp/pr71-pr72-revert-body.md
```

PR 说明必须包含：为什么不删除 PR 历史、为什么保留四个 migration、开发库审计结果、生产库未应用、验证命令和重新实施入口。

- [ ] **Step 2: 请求代码审查并修复阻塞项**

执行 `requesting-code-review` 技能，阻塞级问题清零后重新运行 Task 3/4 门禁。

- [ ] **Step 3: 合并后验证自动部署**

确认 Auto Deploy Dev 成功，并核查开发 migration history 仍与仓库对齐。

- [ ] **Step 4: 保持生产 migration apply 为 HOLD**

在计划 3 v2 完成、前向兼容 migration 随回退 PR 合并、开发环境验收通过，并审查 Production Database Migration `plan` 输出前，不运行生产 `apply`。Production plan 必须明确列出四个历史 migration、`20260818120000` 和已审查的 v2 migrations，且不得包含未审查版本。

### Task 6: 严格重新执行目录、商品与价格计划

**Files:**
- Requirements source: `docs/superpowers/plans/2026-08-13-tenant-private-supplier-catalog-products.md`
- Preserve prerequisite: PR #66 and `docs/superpowers/plans/2026-08-13-tenant-private-suppliers.md`
- Preserve immutable migrations: `20260813170000`、`20260813180000`、`20260813185000`、`20260813195000`

- [ ] **Step 1: 从清理后的最新 main 创建新 worktree**

```text
branch: feature/tenant-private-supplier-catalog-v2
base: latest origin/main after the revert PR
```

- [ ] **Step 2: 按原计划需求逐项重实施 Task 1～9**

原计划作为业务需求和验收来源，不字面执行其中创建或修改四个历史 migration 的命令。Task 2/5 改为先对历史 migration 写只读 contract；若发现缺失，只能创建 `20260818*` 新版本前向 migration。其他 Task 必须遵循 RED → GREEN → 静态检查 → 聚焦提交，不能把缺失交互放到后续补丁 PR。

- [ ] **Step 3: 增加本次审查发现的强制回归门禁**

必须覆盖：

- 平台商品详情只能读取 `ownership_scope='platform'`。
- service 不得直接调用 `SupabaseDB`，数据库访问全部进入 repository/RPC gateway。
- 规格、单位建议、商品和 SKU 的写命令都具备幂等、版本和审计边界。
- 平台 SKU 完整持久化 `spec_values`、管理标记和单位换算链。
- repository 不使用 `select("*")`，列表分页默认 20、最大 100。
- Admin 使用组件交互测试和 Playwright，不以源码字符串匹配代替行为测试。
- 两租户 + 平台账号完成共享、私有、越权和非 active 历史只读 smoke。
- 对目录合并、商品分页、SKU 搜索和当前价格执行 `EXPLAIN ANALYZE`。

- [ ] **Step 4: 阶段审查后创建新的实现 PR**

新 PR 只包含计划 3，不混入采购快照和存量迁移。

### Task 7: 单独进入采购快照与存量迁移

**Files:**
- Follow exactly: `docs/superpowers/plans/2026-08-13-supplier-procurement-migration-cutover.md`

- [ ] **Step 1: 等待计划 3 PR 合并和开发环境验收通过**

- [ ] **Step 2: 从最新 main 建立独立分支执行计划 4**

- [ ] **Step 3: 异常表清零、快照稳定性和两租户采购闭环通过后再申请合并**

## 完成标准

- #71/#72 的应用代码行为已从 `main` 撤销，PR 和 migration 审计历史保留。
- 开发环境无数据丢失，migration history 对齐，生产库未受影响。
- 新实现满足 approved design、计划 3 Task 1～9 和新增回归门禁。
- 计划 3 与计划 4 分 PR、分阶段审查和部署。
