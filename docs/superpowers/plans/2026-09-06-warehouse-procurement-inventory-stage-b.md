# 仓库采购入库与库存台账 Stage B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Stage A 的仓库主数据和采购目的地基础上，补齐仓库采购收货入库、库存流水、库存余额、应付归属和 Admin 库存核对页面，并在库存过账具备事务保障后开放仓库补货采购入口。

**Architecture:** Supabase migration 建立不可变库存流水、库存余额投影、仓库采购收货原子过账和供应商应付双目的地字段；Fastify 按 controller/service/repository 分层提供库存余额和流水分页读取；现有采购批次和履约命令扩展 `project | warehouse` 目的地分支；Admin 在采购供应下展示仓库库存，并在新增采购批次中以分段控件选择“项目采购 / 仓库补货”。项目直采路径保持原行为。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL、Next.js、React、shadcn/ui、Tailwind CSS

**Approved design:** `docs/superpowers/specs/2026-09-05-warehouse-procurement-inventory-mvp-design.md`

---

## Scope Boundary

本计划只交付设计阶段 B：

- 创建 `inventory_transactions` 和 `inventory_balances`。
- 仓库采购合格收货写入库存流水和余额，按移动加权平均维护成本。
- 仓库采购收货继续生成 `supplier_payable_events`，但不生成 `project_cost_events`，不消耗项目预算承诺。
- `supplier_payable_events`、`supplier_payment_requests`、`supplier_payments` 支持项目或仓库归属的读取和约束。
- Admin 提供库存余额、库存流水、仓库采购财务核对的最小页面。
- 采购批次创建页开放“仓库补货”入口，但只在租户 `warehouse_procurement_enabled = true` 且存在启用仓库时可用。

明确不包含：

- 项目领料、退料、项目成本出库和反向成本。
- 多仓调拨、盘点、库位、批号、安全库存。
- Orange 仓库改动。
- 手工维护库存成本或库存单价。

Stage C 之前，仓库库存只允许通过采购收货增加，不允许由用户手工出库。

## Data Invariants

- 库存事实以 `inventory_transactions` 为准，余额可由流水重算。
- `(tenant_id, source_type, source_id)` 唯一，重复收货不能重复入库或重复应付。
- 仓库收货数量必须为正，拒收数量不入库。
- 仓库入库的 `unit_cost` 和 `value_delta` 来自采购单冻结金额分摊，前端不得提交成本。
- 同一租户、仓库、SKU 的余额更新必须在数据库事务内锁定，禁止并发写出错。
- 仓库采购应付必须能继续走付款申请和付款记录，但项目财务报表不能把仓库补货计入项目成本。
- 现有项目采购的收货、项目成本、应付、承诺消耗和付款路径保持兼容。

## File Structure

- Create: `supabase/migrations/20260906110000_create_inventory_ledger_stage_b.sql`
  - 库存流水、余额、供应商应付/付款双目的地字段、收货过账函数、读取 RPC 和索引。
- Create: `apps/api/src/services/warehouse-inventory-migration-contract.test.ts`
  - migration 静态契约测试。
- Create: `packages/domain/src/inventory.ts`
  - 库存流水类型、标签和共享类型。
- Create: `packages/domain/src/inventory.test.ts`
  - Domain 契约测试。
- Modify: `packages/domain/src/index.ts`
  - 导出库存领域契约。
- Create: `apps/api/src/schema/inventory.ts`
  - 库存余额和流水分页查询 schema。
- Create: `apps/api/src/schema/inventory.test.ts`
  - 分页、筛选和状态边界测试。
- Create: `apps/api/src/repositories/inventory.ts`
  - 调用库存读取 RPC，并解析分页结果。
- Create: `apps/api/src/repositories/inventory.test.ts`
  - 分页参数、错误包装和字段解析测试。
- Create: `apps/api/src/services/inventory.ts`
  - 库存读取权限编排。
- Create: `apps/api/src/services/inventory.test.ts`
  - `inventory.stock.view` 权限和租户隔离测试。
- Create: `apps/api/src/controllers/inventory/index.ts`
  - `GET /inventory/balances`、`GET /inventory/transactions`。
- Create: `apps/api/src/controllers/inventory/routes.test.ts`
  - 路由、Zod 和 ResponseHandler 测试。
- Modify: `apps/api/src/routes/index.ts`
  - 注册库存 controller。
- Modify: `apps/api/src/repositories/procurement-destination-records.ts`
  - 增加仓库目的地断言和展示解析。
- Modify: `apps/api/src/repositories/supplier-purchase-batches.ts`
  - 保存草稿命令支持 `destination_type`、`project_id` 或 `warehouse_id`。
- Modify: `apps/api/src/schema/supplier-purchase-batches.ts`
  - 新增采购批次保存输入支持双目的地。
- Modify: `apps/api/src/services/supplier-purchase-batches.ts`
  - 项目采购继续校验项目权限；仓库补货校验仓库采购开关和启用仓库。
- Modify: `apps/api/src/repositories/supplier-purchase-fulfillments.ts`
  - 收货命令继续调用同名 RPC，解析仓库收货错误码。
- Modify: `apps/api/src/services/supplier-purchase-fulfillments.ts`
  - 项目采购校验项目权限；仓库采购校验仓库/库存权限，不要求项目权限。
- Modify: `apps/api/src/repositories/supplier-payment-records.ts`
  - 解析应付、付款的目的地字段。
- Modify: `apps/api/src/repositories/supplier-payment-requests.ts`
  - 付款申请列表和详情读取目的地字段。
- Modify: `apps/api/src/services/supplier-payment-migration-contract.test.ts`
  - 覆盖应付和付款双目的地约束。
- Create: `apps/admin/components/inventory/inventory-types.ts`
  - Admin 库存 DTO。
- Create: `apps/admin/components/inventory/inventory-api.ts`
  - 库存余额和流水 API。
- Create: `apps/admin/components/inventory/inventory-rules.ts`
  - 筛选、金额和数量展示规则。
- Create: `apps/admin/components/inventory/inventory-rules.test.ts`
  - 纯函数测试。
- Create: `apps/admin/components/inventory/inventory-workspace.tsx`
  - 库存余额/流水 tab、搜索、仓库筛选和分页。
- Create: `apps/admin/app/(console)/inventory/page.tsx`
  - 仓库库存页面入口。
- Modify: `apps/admin/components/layout/menu-config.ts`
  - 在“采购供应”增加“仓库库存”。
- Modify: `apps/admin/components/supplier-purchase-batches/*`
  - 新增采购批次首步展示“项目采购 / 仓库补货”。
- Create: `docs/operations/evidence/2026-09-06-warehouse-procurement-inventory-stage-b-dev.md`
  - migration、API smoke、Admin check 和回归证据。

---

### Task 1: 定义库存 Domain 契约

**Files:**

- Create: `packages/domain/src/inventory.test.ts`
- Create: `packages/domain/src/inventory.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: 写库存领域 RED 测试**

Create `packages/domain/src/inventory.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import {
  INVENTORY_TRANSACTION_TYPE_LABELS,
  INVENTORY_TRANSACTION_TYPE_VALUES,
} from "./inventory";

describe("inventory domain contract", () => {
  test("keeps stable inventory transaction values", () => {
    expect(INVENTORY_TRANSACTION_TYPE_VALUES).toEqual([
      "purchase_receipt",
      "project_issue",
      "project_return",
      "supplier_return",
      "adjustment_in",
      "adjustment_out",
    ]);
    expect(INVENTORY_TRANSACTION_TYPE_LABELS.purchase_receipt).toBe("采购入库");
    expect(INVENTORY_TRANSACTION_TYPE_LABELS.project_issue).toBe("项目领料");
    expect(INVENTORY_TRANSACTION_TYPE_LABELS.project_return).toBe("项目退料");
  });
});
```

- [ ] **Step 2: 运行 RED**

Run:

```bash
bun test packages/domain/src/inventory.test.ts
```

Expected: fail because `inventory.ts` does not exist.

- [ ] **Step 3: 实现共享类型**

Create `packages/domain/src/inventory.ts` with stable values and labels:

```ts
export const INVENTORY_TRANSACTION_TYPE_VALUES = [
  "purchase_receipt",
  "project_issue",
  "project_return",
  "supplier_return",
  "adjustment_in",
  "adjustment_out",
] as const;

export type InventoryTransactionType =
  (typeof INVENTORY_TRANSACTION_TYPE_VALUES)[number];

export const INVENTORY_TRANSACTION_TYPE_LABELS = {
  purchase_receipt: "采购入库",
  project_issue: "项目领料",
  project_return: "项目退料",
  supplier_return: "供应商退货",
  adjustment_in: "库存调增",
  adjustment_out: "库存调减",
} as const satisfies Record<InventoryTransactionType, string>;
```

Add to `packages/domain/src/index.ts`:

```ts
export * from "./inventory";
```

- [ ] **Step 4: 运行 GREEN**

Run:

```bash
bun test packages/domain/src/inventory.test.ts
```

Expected: all tests pass.

---

### Task 2: 建立库存流水、余额和收货过账 migration

**Files:**

- Create: `apps/api/src/services/warehouse-inventory-migration-contract.test.ts`
- Create: `supabase/migrations/20260906110000_create_inventory_ledger_stage_b.sql`

- [ ] **Step 1: 写 migration RED 测试**

The test must assert the migration contains:

- `CREATE TABLE public.inventory_transactions`
- `CREATE TABLE public.inventory_balances`
- `UNIQUE (tenant_id, source_type, source_id)`
- balance unique key `(tenant_id, warehouse_id, supplier_sku_id)`
- `quantity_on_hand >= 0`
- `CREATE OR REPLACE FUNCTION public.create_supplier_purchase_order_receipt`
- warehouse branch must insert `inventory_transactions`
- warehouse branch must not insert `project_cost_events`
- `supplier_payable_events` gains `destination_type` and `warehouse_id`
- payment request/payment tables gain destination-compatible fields
- RLS is enabled and forced on inventory tables
- service role select/execute grants are present

- [ ] **Step 2: 运行 RED**

Run:

```bash
bun test apps/api/src/services/warehouse-inventory-migration-contract.test.ts
```

Expected: fail because migration does not exist.

- [ ] **Step 3: 写 migration**

Migration implementation requirements:

- Add `destination_type text`, nullable `warehouse_id`, and nullable `project_id` compatibility where needed for:
  - `supplier_payable_events`
  - `supplier_payment_requests`
  - `supplier_payments`
- Backfill all historical financial rows to `destination_type = 'project'`.
- Add project/warehouse mutually exclusive check constraints.
- Keep historical project foreign keys valid.
- Create `inventory_transactions`:
  - immutable table
  - `(tenant_id, source_type, source_id)` unique
  - source type initially accepts `supplier_purchase_receipt_item`
  - `transaction_type` initially accepts Stage B values, but only purchase receipt is written in Stage B
  - `quantity_delta > 0` for purchase receipt
  - `unit_cost >= 0`
  - `value_delta >= 0`
- Create `inventory_balances`:
  - unique `(tenant_id, warehouse_id, supplier_sku_id)`
  - `quantity_on_hand >= 0`
  - `inventory_value >= 0`
  - `average_unit_cost >= 0`
- Replace `public.create_supplier_purchase_order_receipt` with destination-aware behavior:
  - call `create_supplier_purchase_order_receipt_fulfillment_v1` first, preserving idempotency.
  - if result is idempotent, return immediately.
  - load order with `destination_type`.
  - project branch executes existing project cost + payable + commitment logic unchanged.
  - warehouse branch validates `warehouse_id` and active warehouse.
  - warehouse branch locks or upserts balance rows per accepted SKU.
  - warehouse branch allocates receipt value using the same ordered-line allocation rules as project branch.
  - warehouse branch inserts one inventory transaction per accepted receipt item.
  - warehouse branch inserts one payable event per accepted receipt item.
  - warehouse branch does not touch `project_cost_events` or `project_cost_commitments`.
- Preserve existing stable errors and add:
  - `WAREHOUSE_NOT_FOUND`
  - `WAREHOUSE_INACTIVE`
  - `PURCHASE_DESTINATION_INVALID`
  - `INVENTORY_SOURCE_CONFLICT`
- Add read RPCs:
  - `list_inventory_balances(p_tenant_id, p_warehouse_id, p_keyword, p_page, p_page_size)`
  - `list_inventory_transactions(p_tenant_id, p_warehouse_id, p_supplier_sku_id, p_transaction_type, p_page, p_page_size)`
- Both RPCs must paginate before returning JSON and cap `page_size` at 100.

- [ ] **Step 4: 运行 GREEN**

Run:

```bash
bun test apps/api/src/services/warehouse-inventory-migration-contract.test.ts
```

Expected: all tests pass.

---

### Task 3: 提供库存分页读取 API

**Files:**

- Create: `apps/api/src/schema/inventory.test.ts`
- Create: `apps/api/src/schema/inventory.ts`
- Create: `apps/api/src/repositories/inventory.test.ts`
- Create: `apps/api/src/repositories/inventory.ts`
- Create: `apps/api/src/services/inventory.test.ts`
- Create: `apps/api/src/services/inventory.ts`
- Create: `apps/api/src/controllers/inventory/routes.test.ts`
- Create: `apps/api/src/controllers/inventory/index.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: RED tests**

Cover:

- default `page=1&pageSize=20`
- max `pageSize=100`
- keyword trims blank to null
- repository calls RPCs with exact pagination values
- repository wraps Supabase errors with `Errors.dbError`
- service requires `inventory.stock.view`
- controller returns `ResponseHandler.success`

- [ ] **Step 2: Implement API**

Use existing page DTO shape:

```ts
{
  list: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
```

Expose:

```text
GET /inventory/balances
GET /inventory/transactions
```

Filtering:

- balances: `warehouseId`, `keyword`, `page`, `pageSize`
- transactions: `warehouseId`, `supplierSkuId`, `transactionType`, `page`, `pageSize`

- [ ] **Step 3: Verify**

Run focused tests:

```bash
bun test apps/api/src/schema/inventory.test.ts \
  apps/api/src/repositories/inventory.test.ts \
  apps/api/src/services/inventory.test.ts \
  apps/api/src/controllers/inventory/routes.test.ts
```

---

### Task 4: 扩展采购批次保存为项目/仓库双目的地

**Files:**

- Modify: `apps/api/src/schema/supplier-purchase-batches.test.ts`
- Modify: `apps/api/src/schema/supplier-purchase-batches.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-batches.test.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-batches.ts`
- Modify: `apps/api/src/services/supplier-purchase-batches.test.ts`
- Modify: `apps/api/src/services/supplier-purchase-batches.ts`
- Modify: relevant migration contract tests for batch command RPC

- [ ] **Step 1: RED tests**

Cover:

- project purchase requires `project_id` and rejects `warehouse_id`.
- warehouse purchase requires `warehouse_id` and rejects `project_id`.
- warehouse purchase requires `warehouse_procurement_enabled = true`.
- warehouse purchase requires active warehouse in current tenant.
- warehouse purchase does not require project data scope.
- project purchase behavior is unchanged.

- [ ] **Step 2: Implement**

Update save draft input to include:

```ts
destination_type: "project" | "warehouse";
project_id?: string | null;
warehouse_id?: string | null;
```

Repository command must pass explicit destination fields into the supplier purchase batch save RPC. The RPC must copy the same destination onto child requisitions and orders during submit/review generation.

- [ ] **Step 3: Verify**

Run supplier purchase batch focused tests plus migration contract tests.

---

### Task 5: 扩展履约收货权限和错误解析

**Files:**

- Modify: `apps/api/src/services/supplier-purchase-fulfillments.test.ts`
- Modify: `apps/api/src/services/supplier-purchase-fulfillments.ts`
- Modify: `apps/api/src/repositories/supplier-command-errors.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-fulfillments.test.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-fulfillments.ts`

- [ ] **Step 1: RED tests**

Cover:

- project destination still requires target project read/manage checks.
- warehouse destination requires purchase manage plus warehouse/inventory manage permission.
- warehouse destination does not call `assertProjectRead` or `assertProjectUpdate`.
- repository maps inventory/warehouse RPC errors to Chinese business errors.

- [ ] **Step 2: Implement**

Read order destination via existing `findOrder`. Branch authorization by `destination_type`.

- [ ] **Step 3: Verify**

Run:

```bash
bun test apps/api/src/services/supplier-purchase-fulfillments.test.ts \
  apps/api/src/repositories/supplier-purchase-fulfillments.test.ts
```

---

### Task 6: Admin 仓库库存页面

**Files:**

- Create: `apps/admin/components/inventory/inventory-types.ts`
- Create: `apps/admin/components/inventory/inventory-api.ts`
- Create: `apps/admin/components/inventory/inventory-rules.ts`
- Create: `apps/admin/components/inventory/inventory-rules.test.ts`
- Create: `apps/admin/components/inventory/inventory-workspace.tsx`
- Create: `apps/admin/app/(console)/inventory/page.tsx`
- Modify: `apps/admin/components/layout/menu-config.ts`

- [ ] **Step 1: RED tests**

Cover UI pure rules:

- transaction type labels from domain.
- money and quantity formatting.
- blank warehouse filter omitted.
- `pageSize` capped at 100.

- [ ] **Step 2: Implement UI**

Page layout:

- Title: `仓库库存`
- Tabs:
  - `库存余额`
  - `库存流水`
- Balance columns:
  - 商品/SKU
  - 仓库
  - 现存数量
  - 平均成本
  - 库存金额
  - 最近更新
- Transaction columns:
  - 时间
  - 类型
  - 商品/SKU
  - 仓库
  - 数量变化
  - 价值变化
  - 来源单据
  - 操作人

Use compact admin table styling. Do not expose internal UUID/code unless it is part of an explicit technical source link.

- [ ] **Step 3: Verify**

Run:

```bash
bun test apps/admin/components/inventory/inventory-rules.test.ts
pnpm --dir apps/admin check
```

---

### Task 7: Admin 新建采购批次开放仓库补货

**Files:**

- Modify: `apps/admin/components/supplier-purchase-batches/*`
- Modify: related tests under `apps/admin/components/supplier-purchase-batches`

- [ ] **Step 1: RED tests**

Cover:

- default mode is `项目采购`.
- warehouse mode visible only when API/settings says warehouse procurement enabled.
- single active warehouse auto-selected.
- multiple warehouses defaults to tenant default warehouse.
- warehouse mode hides project picker and shows warehouse destination.
- user-facing copy says `仓库补货` and `采购去向`，不展示内部编码。

- [ ] **Step 2: Implement UI**

Use a segmented control for destination:

```text
[ 项目采购 ] [ 仓库补货 ]
```

When `仓库补货` is selected:

- fetch warehouses with `status=active`.
- if none, disable submit and show “暂无启用仓库，请先维护仓库设置”。
- if gate disabled, hide or disable the warehouse option with “仓库补货暂未开放”。

- [ ] **Step 3: Verify**

Run admin focused tests and `pnpm --dir apps/admin check`.

---

### Task 8: 开发库 migration 与接口 smoke

**Files:**

- Create: `docs/operations/evidence/2026-09-06-warehouse-procurement-inventory-stage-b-dev.md`

- [ ] **Step 1: 静态验证**

Run:

```bash
bun test packages/domain/src/inventory.test.ts \
  apps/api/src/services/warehouse-inventory-migration-contract.test.ts \
  apps/api/src/schema/inventory.test.ts \
  apps/api/src/repositories/inventory.test.ts \
  apps/api/src/services/inventory.test.ts \
  apps/api/src/controllers/inventory/routes.test.ts
bun run api:check
pnpm --dir apps/admin check
bun run check:permission-boundaries
bun run audit:supabase-writes
git diff --check
```

- [ ] **Step 2: 开发库 migration**

Before applying:

```bash
node scripts/validate-dev-database-target.mjs --direct-migration-history
supabase migration list
supabase db push --dry-run
```

Apply:

```bash
supabase db push
supabase migration list
supabase db push --dry-run
```

Expected: Local/Remote both include Stage B migration and dry-run says remote is up to date.

- [ ] **Step 3: 开发库 smoke**

Use service-role smoke without printing secrets:

- assert `inventory_transactions` table is readable by service role.
- assert `inventory_balances` table is readable by service role.
- create or identify a test warehouse purchase order fixture only if the fixture is clearly marked E2E/test.
- perform warehouse receipt and assert:
  - receipt row created once.
  - inventory transaction created once per accepted line.
  - balance quantity and value increased.
  - payable event exists.
  - project cost event does not exist for the same receipt item.
- repeat the same receipt idempotency key and assert no duplicate facts.
- run project purchase receipt regression and assert project cost event still exists.

- [ ] **Step 4: Evidence doc**

Record:

- branch and commit
- migration list before/after
- dry-run result
- focused tests
- API/Admin checks
- smoke summary
- rollback/disable note

---

### Task 9: Commit Boundary

- [ ] **Step 1: Review diff**

Run:

```bash
git status --short
git diff --stat
git diff --check
```

- [ ] **Step 2: Commit**

Use Conventional Commit:

```bash
git add packages/domain/src/inventory.ts \
  packages/domain/src/inventory.test.ts \
  packages/domain/src/index.ts \
  supabase/migrations/20260906110000_create_inventory_ledger_stage_b.sql \
  apps/api/src \
  apps/admin \
  docs/operations/evidence/2026-09-06-warehouse-procurement-inventory-stage-b-dev.md
git commit -m "feat(procurement): 支持仓库采购入库库存台账"
```

- [ ] **Step 3: Integration**

After user confirmation:

```bash
git push -u origin feature/warehouse-procurement-inventory-stage-b
```

Then create PR and squash merge only after review, migration evidence, and smoke evidence are present.
