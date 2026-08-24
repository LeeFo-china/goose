# PR #71/#72 回退与供应商目录重实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留 Git 与数据库审计历史的前提下，撤销 PR #71/#72 的应用行为，并重新严格执行已批准的租户私有目录、商品与价格实施计划。

**Architecture:** Git 使用反向 revert，不改写 `main` 历史；开发库中已执行的 migration 文件永久保留，先验证旧应用与扩展 schema 的兼容性，只在真实不兼容时增加前向修复 migration。重实施继续保留 PR #66 的所有权、私有供应商和内部编码基础，重新执行计划 3，完成审查后再进入计划 4。

**Tech Stack:** Git、Bun、TypeScript、Fastify、Supabase/PostgreSQL migration、Next.js 15、React 19、Playwright、GitHub Actions。

---

## 不可变边界

- 不删除或改写 GitHub PR #71/#72 记录。
- 不 force push `main`，不删除已经执行过的 migration 文件。
- 不回退 PR #66；它是计划 3 的前置基础。
- 不手工对远端数据库执行 DDL/DML。
- 生产库未应用本批 migration，不对生产库执行回退动作。
- 开发库审计完成前，不执行任何破坏性补偿 migration。

### Task 1: 固化当前证据并完成开发库只读审计

**Files:**
- Create: `docs/audit/2026-08-18-pr71-pr72-rollback-readiness.md`
- Reference: `supabase/migrations/20260813170000_create_tenant_private_catalog.sql`
- Reference: `supabase/migrations/20260813180000_scope_supplier_products_and_prices.sql`
- Reference: `supabase/migrations/20260813185000_scope_catalog_codes.sql`
- Reference: `supabase/migrations/20260813195000_allow_platform_product_write.sql`

- [ ] **Step 1: 记录 Git 和 PR 边界**

运行：

```bash
git status --short --branch
git log --oneline --decorate -5 main
gh pr view 71 --json number,state,mergedAt,mergeCommit,headRefName,baseRefName,url
gh pr view 72 --json number,state,mergedAt,mergeCommit,headRefName,baseRefName,url
```

期望：工作树干净；`main` 顶部依次为 `631b741d`、`447196bb`、`b5b048a1`。

- [ ] **Step 2: 只读查询开发库新增数据和回退阻塞项**

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

- [ ] **Step 3: 写入审计报告**

报告必须记录：4 个 migration 的执行状态、七类新增数据计数、分类/品牌全局重复编码数量、开发环境自动部署记录、生产 migration 未执行的证据，以及是否允许进入 Git 回退。

- [ ] **Step 4: 提交审计证据**

```bash
git add docs/audit/2026-08-18-pr71-pr72-rollback-readiness.md
git commit -m "docs(supplier): 记录目录回退前审计"
```

### Task 2: 建立可恢复的隔离工作区

**Files:**
- No application files changed.

- [ ] **Step 1: 创建回退前备份 tag**

```bash
git tag -a backup/pr71-pr72-before-revert 631b741d -m "backup before reverting PR #71 and #72"
git push origin backup/pr71-pr72-before-revert
```

- [ ] **Step 2: 使用独立 worktree 创建回退分支**

执行 `using-git-worktrees` 技能，在仓库既有 worktree 目录约定下创建：

```text
branch: revert/supplier-catalog-pr71-pr72
base: origin/main
```

- [ ] **Step 3: 确认隔离工作区基线**

```bash
git status --short --branch
git rev-parse HEAD
```

期望：HEAD 为 `631b741d`，工作树干净。

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
git restore --source=631b741d -- \
  supabase/migrations/20260813170000_create_tenant_private_catalog.sql \
  supabase/migrations/20260813180000_scope_supplier_products_and_prices.sql \
  supabase/migrations/20260813185000_scope_catalog_codes.sql \
  supabase/migrations/20260813195000_allow_platform_product_write.sql
```

- [ ] **Step 3: 校验回退范围**

```bash
git diff --name-status
git diff --check
git diff --exit-code b5b048a1 -- . \
  ':(exclude)supabase/migrations/20260813170000_create_tenant_private_catalog.sql' \
  ':(exclude)supabase/migrations/20260813180000_scope_supplier_products_and_prices.sql' \
  ':(exclude)supabase/migrations/20260813185000_scope_catalog_codes.sql' \
  ':(exclude)supabase/migrations/20260813195000_allow_platform_product_write.sql' \
  ':(exclude)docs/audit/2026-08-18-pr71-pr72-rollback-readiness.md'
```

期望：应用代码与 `b5b048a1` 一致；仅保留四个历史 migration 和审计文档差异。

- [ ] **Step 4: 运行回退后的静态门禁**

```bash
bun run api:typecheck
bun run admin:check
bun run check:file-size
git diff --check
```

期望：全部退出码为 0，不使用 `--no-verify`。

- [ ] **Step 5: 提交回退**

```bash
git add -A
git commit -m "revert(supplier): 回退目录商品阶段实现"
```

### Task 4: 验证旧应用与开发库扩展 schema 的兼容性

**Files:**
- Test only; no database mutation in the first pass.

- [ ] **Step 1: 在回退分支运行供应商基础测试**

```bash
bun test apps/api/src/services/tenant-suppliers.test.ts \
  apps/api/src/services/tenant-supplier-private-commands.test.ts
pnpm --dir apps/admin test:e2e:supplier-catalog
pnpm --dir apps/admin test:e2e:supplier-product-pricing
```

期望：私有供应商和内部编码基础仍可用；目录/商品旧链路不因额外数据库列失效。

- [ ] **Step 2: 对开发环境执行只读/可回滚 smoke**

验证：供应商列表、合作关系、现有商品列表和价格列表可读取；不创建分类、品牌、规格、平台商品或换算数据。

- [ ] **Step 3: 作出数据库处理决策**

固定决策规则：

- 若回退代码可兼容当前开发库 schema：不新增补偿 migration，保留扩展 schema，后续重实施通过前向 migration 修正。
- 若回退代码因约束或函数签名不兼容：先根据具体失败写 RED migration contract，再新增一个最小前向兼容 migration；不得删除字段、表或开发数据。
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

### Task 6: 严格重新执行目录、商品与价格计划

**Files:**
- Follow exactly: `docs/superpowers/plans/2026-08-13-tenant-private-supplier-catalog-products.md`
- Preserve prerequisite: PR #66 and `docs/superpowers/plans/2026-08-13-tenant-private-suppliers.md`

- [ ] **Step 1: 从清理后的最新 main 创建新 worktree**

```text
branch: feature/tenant-private-supplier-catalog-v2
base: latest origin/main after the revert PR
```

- [ ] **Step 2: 逐项执行原计划 Task 1～9**

每个 Task 必须遵循 RED → GREEN → 静态检查 → 聚焦提交，不能把缺失交互放到后续补丁 PR。

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
