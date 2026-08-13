# 供应商所有权与权限基础 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为供应商、商品、SKU、分类和品牌建立不可变所有权模型、权限和统一可见性契约，同时保持现有平台业务可用。

**Architecture:** Domain 先定义所有权和值对象；forward-only migration 增加所有权列、约束、索引和守卫函数，现有供应商/目录按平台归属回填，商品归属暂保留待迁移状态。API 通过共享 access policy 计算可见和可写范围，controller 不直接访问数据库。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL。

**Prerequisite:** 已批准 `docs/superpowers/specs/2026-08-13-tenant-private-supplier-catalog-design.md`。

---

## File Map

- `packages/domain/src/supplier-ownership.ts`：所有权、来源和可见性契约。
- `packages/domain/src/permission.ts`：新增平台商品、租户主档和目录权限。
- `supabase/migrations/20260813100000_add_supplier_ownership_foundation.sql`：所有权列、约束、索引、守卫、灰度字段和权限 seed。
- `apps/api/src/services/supplier-ownership-access.ts`：纯访问策略。
- `apps/api/src/repositories/supplier-ownership.ts`：集合式归属与关系读取。
- `apps/api/src/types/database.ts`：应用 migration 后重新生成。

### Task 1: 定义 Domain 所有权与权限

**Files:**
- Create: `packages/domain/src/supplier-ownership.ts`
- Create: `packages/domain/src/supplier-ownership.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/permission.ts`
- Modify: `packages/domain/src/permission.test.ts`

- [ ] **Step 1: 写 RED 测试**

```ts
expect(SUPPLIER_OWNERSHIP_SCOPE_VALUES).toEqual(["platform", "tenant"]);
expect(PERMISSION_CODE_VALUES).toContain("platform.supplier-product.manage");
expect(PERMISSION_CODE_VALUES).toContain("supplier.master.manage");
expect(PERMISSION_CODE_VALUES).toContain("supplier.catalog.manage");
```

同时断言新增权限 metadata 正确，并用 `@ts-expect-error` 证明联合类型禁止 `platform + tenantId` 和 `tenant + null`。

- [ ] **Step 2: 运行 RED**

```bash
bun test packages/domain/src/supplier-ownership.test.ts packages/domain/src/permission.test.ts
```

Expected: 新模块和权限不存在。

- [ ] **Step 3: 实现稳定契约**

```ts
export const SUPPLIER_OWNERSHIP_SCOPE_VALUES = ["platform", "tenant"] as const;
export type SupplierOwnershipRef =
  | { ownershipScope: "platform"; ownerTenantId: null }
  | { ownershipScope: "tenant"; ownerTenantId: string };
```

权限职责固定为：`platform.supplier-product.manage` 管平台共享商品；`supplier.master.manage` 管本租户私有供应商主档；`supplier.catalog.manage` 管本租户分类、品牌和规格模板。保留现有 `supplier.manage` 作为合作关系权限。

- [ ] **Step 4: 运行 GREEN 并提交**

```bash
bun test packages/domain/src/supplier-ownership.test.ts packages/domain/src/permission.test.ts
git add packages/domain/src/supplier-ownership.ts packages/domain/src/supplier-ownership.test.ts packages/domain/src/index.ts packages/domain/src/permission.ts packages/domain/src/permission.test.ts
git commit -m "feat(domain): 定义供应商所有权与权限"
```

### Task 2: 以 migration 建立所有权字段和数据库不变量

**Files:**
- Create: `apps/api/src/services/supplier-ownership-migration-contract.test.ts`
- Create: `supabase/migrations/20260813100000_add_supplier_ownership_foundation.sql`

- [ ] **Step 1: 写 migration RED 测试**

断言 migration 对 `suppliers`、`supplier_products`、`supplier_skus`、`catalog_categories`、`catalog_brands` 增加 `ownership_scope` 和 `owner_tenant_id`；对 `tenant_supplier_settings` 增加 `ownership_reads_enabled`、`private_supplier_writes_enabled`、`private_catalog_writes_enabled`、`procurement_snapshot_v1_enabled` 四个默认 false 的灰度字段；断言 check constraint、不可变 trigger、组合索引、RLS/FORCE RLS、权限 seed、REVOKE/GRANT 以及回滚注释存在。

```ts
expect(sql).toContain("ADD COLUMN ownership_scope text");
expect(sql).toMatch(/ownership_scope = 'platform'[\s\S]*owner_tenant_id IS NULL/);
expect(sql).toMatch(/ownership_scope = 'tenant'[\s\S]*owner_tenant_id IS NOT NULL/);
expect(sql).toContain("guard_supplier_ownership_immutable");
```

- [ ] **Step 2: 运行 RED 并创建 migration**

```bash
cd apps/api && bun test src/services/supplier-ownership-migration-contract.test.ts
cd ../.. && supabase migration new add_supplier_ownership_foundation
```

- [ ] **Step 3: 实现兼容回填和索引**

按以下顺序：所有权列先 nullable；现有 `suppliers`、`catalog_categories`、`catalog_brands` 回填 `platform/null` 并设 NOT NULL；现有商品/SKU 不猜测租户，字段保持 nullable 到最终迁移；建立 `(ownership_scope, owner_tenant_id, status, id)`、父分类和供应商归属索引。

不可变 trigger 在 UPDATE 发现任一所有权字段变化时抛出 `SUPPLIER_OWNERSHIP_IMMUTABLE`。平台记录租户 ID 必须为空，租户记录必须非空。注释明确回滚只允许停用新写入口，不能删除已产生的租户数据。

- [ ] **Step 4: seed 权限**

平台管理员获得 `platform.supplier-product.manage`；租户管理员获得 `supplier.master.manage` 和 `supplier.catalog.manage`。复用现有权限表 upsert 模式，重复运行结果一致。

- [ ] **Step 5: 运行 GREEN 并提交**

```bash
cd apps/api && bun test src/services/supplier-ownership-migration-contract.test.ts
cd ../.. && git diff --check
git add apps/api/src/services/supplier-ownership-migration-contract.test.ts supabase/migrations/20260813100000_add_supplier_ownership_foundation.sql
git commit -m "feat(db): 建立供应商所有权基础"
```

### Task 3: 生成数据库类型并补归属读取

**Files:**
- Modify: `apps/api/src/types/database.ts`
- Create: `apps/api/src/repositories/supplier-ownership.ts`
- Create: `apps/api/src/repositories/supplier-ownership.test.ts`

- [ ] **Step 1: 写 repository RED 测试**

覆盖平台记录、同租户记录和其他租户记录；集合查询只选择 `id,ownership_scope,owner_tenant_id,status`，输入最多 100 个 ID，禁止逐条查询。

- [ ] **Step 2: 运行 RED**

```bash
cd apps/api && bun test src/repositories/supplier-ownership.test.ts
```

- [ ] **Step 3: 迁移并生成类型**

先运行 `supabase db push --dry-run` 确认只有本阶段 migration，再应用到本地数据库并用仓库约定的 `supabase gen types typescript` 命令更新 `apps/api/src/types/database.ts`；不得手写生成字段。

- [ ] **Step 4: 实现集合接口**

```ts
findSupplierOwnerships(ids: readonly string[]): Promise<Map<string, SupplierOwnershipRow>>;
findProductOwnerships(ids: readonly string[]): Promise<Map<string, SupplierOwnershipRow>>;
findCatalogOwnerships(input: {
  kind: "category" | "brand";
  ids: readonly string[];
}): Promise<Map<string, SupplierOwnershipRow>>;
```

空数组不访问数据库；Supabase 错误统一使用 `Errors.dbError()`。

- [ ] **Step 5: 运行 GREEN 并提交**

```bash
cd apps/api && bun test src/repositories/supplier-ownership.test.ts
cd ../.. && bun run api:typecheck
git add apps/api/src/types/database.ts apps/api/src/repositories/supplier-ownership.ts apps/api/src/repositories/supplier-ownership.test.ts
git commit -m "feat(api): 增加供应商归属读取"
```

### Task 4: 建立统一可见与可写策略

**Files:**
- Create: `apps/api/src/services/supplier-ownership-access.ts`
- Create: `apps/api/src/services/supplier-ownership-access.test.ts`
- Modify: `apps/api/src/services/supplier-product-access.ts`
- Modify: `apps/api/src/services/supplier-product-access.test.ts`

- [ ] **Step 1: 写访问矩阵 RED 测试**

覆盖设计文档 6.3：平台共享可读、同租户私有可读写、其他租户不可见；商品读要求存在合作关系；非 active 关系仅历史读；平台商品租户不可写；权限缺失拒绝。

- [ ] **Step 2: 运行 RED**

```bash
cd apps/api && bun test src/services/supplier-ownership-access.test.ts src/services/supplier-product-access.test.ts
```

- [ ] **Step 3: 实现纯策略并适配现有服务**

```ts
type SupplierAccessDecision = {
  visible: boolean;
  writable: boolean;
  historicalOnly: boolean;
  reason: "allowed" | "foreign_tenant" | "inactive_relationship" |
    "platform_read_only" | "permission_denied";
};
```

策略只消费已加载的 auth、ownership 和 relationship，不访问数据库。`supplier-product-access.ts` 调用该策略，并保留现有模块开通校验和 `Errors.business()` 包装。

- [ ] **Step 4: 运行 GREEN 并提交**

```bash
cd apps/api && bun test src/services/supplier-ownership-access.test.ts src/services/supplier-product-access.test.ts
git add src/services/supplier-ownership-access.ts src/services/supplier-ownership-access.test.ts src/services/supplier-product-access.ts src/services/supplier-product-access.test.ts
git commit -m "refactor(api): 统一供应商访问策略"
```

### Task 5: 扩展租户级灰度控制面

**Files:**
- Modify: `apps/api/src/schema/platform-suppliers.ts`
- Modify: `apps/api/src/repositories/platform-suppliers.ts`
- Modify: `apps/api/src/services/platform-suppliers.ts`
- Modify: `apps/api/src/controllers/platform-suppliers/index.ts`
- Modify: corresponding `*.test.ts` files
- Modify: `apps/admin/components/platform-suppliers/*`
- Modify: `apps/admin/e2e/supplier-foundation-smoke.spec.ts`

- [ ] **Step 1: 写 RED 测试**

扩展现有 `GET/PATCH /platform/tenant-supplier-settings/:tenantId`，断言四个开关只能按 `ownership read → private supplier → private catalog → procurement snapshot` 顺序开启，关闭时按反向顺序；`module_enabled=false` 时四个子开关均不生效。PATCH 使用 expected_version 和 Idempotency-Key。

- [ ] **Step 2: 实现 API 和 Admin**

复用现有平台租户供应商 settings 命令和面板，增加四个带依赖说明的 Switch。service 校验状态顺序，数据库命令以乐观锁原子更新；租户 API 只读取最终 effective flags，不允许租户自行开启。

- [ ] **Step 3: 运行 GREEN 并提交**

```bash
cd apps/api && bun test src/services/platform-suppliers.test.ts src/repositories/platform-suppliers.test.ts
cd ../admin && bun test components/platform-suppliers
git add ../api/src/schema/platform-suppliers.ts ../api/src/repositories/platform-suppliers.ts ../api/src/services/platform-suppliers.ts ../api/src/controllers/platform-suppliers/index.ts components/platform-suppliers e2e/supplier-foundation-smoke.spec.ts
git commit -m "feat(supplier): 增加租户供应商灰度开关"
```

### Task 6: 阶段验证和数据库门禁

- [ ] **Step 1: 运行静态与目标测试**

```bash
bun run api:typecheck
bun test packages/domain/src/supplier-ownership.test.ts packages/domain/src/permission.test.ts
cd apps/api && bun test src/repositories/supplier-ownership.test.ts src/services/supplier-ownership-access.test.ts src/services/supplier-ownership-migration-contract.test.ts
```

- [ ] **Step 2: 验证 migration 与性能**

```bash
supabase db push --dry-run
supabase migration list
```

应用后核对 Local/Remote；对供应商和目录 ownership 过滤运行 `EXPLAIN ANALYZE`，确认使用新索引。若只能验证本地，PR 中明确远端未验证风险，禁止手工 SQL 修库。

- [ ] **Step 3: 检查工作树**

运行 `git diff --check` 和 `git status --short`，确保阶段 PR 不包含 `packages/domain/gooes-domain-1.13.0.tgz`，并把测试、migration list 和执行计划摘要写入 PR 描述。
