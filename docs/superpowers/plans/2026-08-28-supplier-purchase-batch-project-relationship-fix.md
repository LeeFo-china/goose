# Supplier Purchase Batch Project Relationship Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复采购批次列表和详情的 PostgREST 项目复合外键关系解析错误，并发布 dev。

**Architecture:** 保留 controller/service/repository 与响应 Schema，唯一生产代码改动是让共享 SELECT 使用 migration 中真实的复合外键约束名。通过契约断言防止单列 hint 再次被复制进复合外键查询。

**Tech Stack:** Bun、TypeScript、Supabase JS、PostgREST、Zod、GitHub Actions

---

### Task 1: 固化关系 hint 回归测试

**Files:**
- Modify: `apps/api/src/repositories/supplier-purchase-batches.test.ts`
- Reference: `apps/api/src/repositories/supplier-purchase-batch-records.ts`
- Reference: `supabase/migrations/20260826141000_create_supplier_purchase_batches.sql`

- [ ] **Step 1: 写入失败测试**

在 repository 测试中增加：

```ts
test("uses the tenant-safe batch-project foreign key for project embedding", () => {
  expect(SUPPLIER_PURCHASE_BATCH_SELECT).toContain(
    "project:projects!supplier_purchase_batches_project_tenant_fkey" +
      "(id,name,status)",
  );
  expect(SUPPLIER_PURCHASE_BATCH_SELECT).not.toContain(
    "project:projects!project_id(",
  );
});
```

- [ ] **Step 2: 确认 RED**

Run:

```bash
cd apps/api && bun test src/repositories/supplier-purchase-batches.test.ts
```

Expected: 新测试因当前 SELECT 仍使用 `!project_id` 而失败。

### Task 2: 最小修复共享 SELECT

**Files:**
- Modify: `apps/api/src/repositories/supplier-purchase-batch-records.ts:43`
- Test: `apps/api/src/repositories/supplier-purchase-batches.test.ts`

- [ ] **Step 1: 替换关系 hint**

```ts
"project:projects!supplier_purchase_batches_project_tenant_fkey(id,name,status)",
```

- [ ] **Step 2: 确认 GREEN**

Run:

```bash
cd apps/api && bun test \
  src/repositories/supplier-purchase-batches.test.ts \
  src/services/supplier-purchase-batch-foundation-migration-contract.test.ts
```

Expected: `21 pass, 0 fail`。

### Task 3: 验证、审查与发布

**Files:**
- Verify only: API 与 workspace 配置

- [ ] **Step 1: 静态与构建验证**

```bash
bun run api:typecheck
bun run api:build
bun run test
```

Expected: 所有命令退出码为 0，默认稳定门禁无失败。

- [ ] **Step 2: 提交与代码审查**

```bash
git add apps/api/src/repositories/supplier-purchase-batch-records.ts \
  apps/api/src/repositories/supplier-purchase-batches.test.ts \
  docs/superpowers/specs/2026-08-28-supplier-purchase-batch-project-relationship-fix-design.md \
  docs/superpowers/plans/2026-08-28-supplier-purchase-batch-project-relationship-fix.md
git commit -m "fix(api): 修复采购批次项目关联查询"
```

Expected: reviewer 无 Critical/Important 问题。

- [ ] **Step 3: 合入 main 并发布 dev**

将提交快进合入最新 `main`，推送 `origin/main`，等待 Build Docker Images 与
Auto Deploy Dev 成功，并确认部署 revision 包含修复提交。

- [ ] **Step 4: 发布后 smoke**

```bash
curl -i 'https://api-dev.goodcms.cn/supplier-purchase-batches?page=1&pageSize=20'
```

Expected: 无凭证返回 `401 TOKEN_MISSING`；员工态复测不得返回 `PGRST200`，
具备权限且模块启用时返回 200。
