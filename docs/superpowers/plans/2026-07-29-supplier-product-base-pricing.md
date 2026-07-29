# Supplier Product and Base Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付租户采购员可代录的供应商 SPU/SKU 和可发布、可追溯的默认基础供货价，为采购订单提供稳定引用。

**Architecture:** 新增四张供应商级商品/价格表和原子命令 RPC；Tenant controller 只读取认证上下文，service 校验模块、独立权限、合作关系和代录原因，repository 限定服务端解析出的供应商 ID。Admin 新增“商品与价格”工作区，商品 DTO 与成本价 DTO 分离。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL、Next.js、React、shadcn/ui、Playwright

---

## 文件结构

### Shared domain

- `packages/domain/src/supplier-product.ts`：商品、SKU、价格簿状态和动作常量。
- `packages/domain/src/supplier-product.test.ts`：共享枚举和动作守卫测试。
- `packages/domain/src/permission.ts`：新增四个权限码和元数据。
- `packages/domain/src/permission.test.ts`：权限元数据契约。
- `packages/domain/src/index.ts`：导出新领域模块。

### Database

- `supabase/migrations/20260729160000_create_supplier_products_and_base_prices.sql`：表、约束、索引、RLS、权限、触发器和原子 RPC。
- `apps/api/src/services/supplier-product-pricing-migration-contract.test.ts`：migration 静态契约。

### API

- `apps/api/src/schema/supplier-products.ts`：商品/SKU HTTP 与 repository 输入校验。
- `apps/api/src/schema/supplier-price-lists.ts`：价格簿、条目和命令校验。
- `apps/api/src/repositories/supplier-products.ts`：商品/SKU 有界查询与命令 RPC。
- `apps/api/src/repositories/supplier-price-lists.ts`：价格簿/条目有界查询与命令 RPC。
- `apps/api/src/services/supplier-product-access.ts`：模块、权限、合作关系、供应商状态和代录门禁。
- `apps/api/src/services/supplier-products.ts`：商品/SKU 编排。
- `apps/api/src/services/supplier-price-lists.ts`：价格草稿、版本和发布编排。
- `apps/api/src/controllers/supplier-products/index.ts`：商品/SKU Tenant HTTP。
- `apps/api/src/controllers/supplier-price-lists/index.ts`：价格 Tenant HTTP。
- `apps/api/src/routes/index.ts`：注册 controller。

### Admin

- `apps/admin/app/(console)/supplier-products/page.tsx`：会话和权限入口。
- `apps/admin/app/(console)/supplier-products/loading.tsx`：页面骨架。
- `apps/admin/components/supplier-products/supplier-product-types.ts`：前端 DTO。
- `apps/admin/components/supplier-products/supplier-product-api.ts`：请求函数。
- `apps/admin/components/supplier-products/supplier-product-workspace.tsx`：供应商选择、商品/价格页签和分页。
- `apps/admin/components/supplier-products/supplier-product-list.tsx`：SPU/SKU 只读列表。
- `apps/admin/components/supplier-products/supplier-product-dialog.tsx`：SPU 代录表单。
- `apps/admin/components/supplier-products/supplier-sku-dialog.tsx`：SKU 代录表单。
- `apps/admin/components/supplier-products/supplier-price-list-panel.tsx`：价格版本列表和发布。
- `apps/admin/components/supplier-products/supplier-product-rules.ts`：纯状态/权限/错误规则。
- `apps/admin/components/layout/menu-config.ts`：采购供应入口。
- `apps/admin/components/suppliers/suppliers-page.test.ts`：导航权限契约。
- `apps/admin/components/supplier-products/supplier-product-page.test.ts`：权限隔离和交互契约。

## Task 1：共享领域类型和权限

**Files:**
- Create: `packages/domain/src/supplier-product.ts`
- Create: `packages/domain/src/supplier-product.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/permission.ts`
- Modify: `packages/domain/src/permission.test.ts`

- [ ] **Step 1：先写失败的领域测试**

```ts
import { describe, expect, test } from "bun:test";
import {
  SUPPLIER_PRICE_LIST_STATUS_VALUES,
  SUPPLIER_PRODUCT_STATUS_VALUES,
  SUPPLIER_SKU_STATUS_VALUES,
  isSupplierPriceListAction,
} from "./supplier-product";

describe("supplier product domain", () => {
  test("keeps stable lifecycle values", () => {
    expect(SUPPLIER_PRODUCT_STATUS_VALUES).toEqual([
      "draft", "active", "inactive",
    ]);
    expect(SUPPLIER_SKU_STATUS_VALUES).toEqual([
      "draft", "active", "inactive",
    ]);
    expect(SUPPLIER_PRICE_LIST_STATUS_VALUES).toEqual([
      "draft", "published", "retired",
    ]);
  });

  test("accepts only explicit price list commands", () => {
    expect(isSupplierPriceListAction("publish")).toBe(true);
    expect(isSupplierPriceListAction("new-version")).toBe(true);
    expect(isSupplierPriceListAction("delete")).toBe(false);
  });
});
```

在 `permission.test.ts` 增加对以下权限的元数据断言：

```ts
[
  "supplier.product.view",
  "supplier.product.manage",
  "supplier.cost-price.view",
  "supplier.cost-price.manage",
]
```

- [ ] **Step 2：运行并确认 RED**

Run:

```bash
bun test packages/domain/src/supplier-product.test.ts \
  packages/domain/src/permission.test.ts
```

Expected: `supplier-product` 模块不存在，新增权限未出现在元数据。

- [ ] **Step 3：实现最小共享类型**

`supplier-product.ts` 定义：

```ts
export const SUPPLIER_PRODUCT_STATUS_VALUES =
  ["draft", "active", "inactive"] as const;
export const SUPPLIER_SKU_STATUS_VALUES =
  ["draft", "active", "inactive"] as const;
export const SUPPLIER_PRICE_LIST_STATUS_VALUES =
  ["draft", "published", "retired"] as const;
export const SUPPLIER_PRICE_LIST_ACTION_VALUES =
  ["publish", "new-version", "retire"] as const;

export type SupplierProductStatus =
  (typeof SUPPLIER_PRODUCT_STATUS_VALUES)[number];
export type SupplierSkuStatus =
  (typeof SUPPLIER_SKU_STATUS_VALUES)[number];
export type SupplierPriceListStatus =
  (typeof SUPPLIER_PRICE_LIST_STATUS_VALUES)[number];
export type SupplierPriceListAction =
  (typeof SUPPLIER_PRICE_LIST_ACTION_VALUES)[number];

export const isSupplierPriceListAction = (
  value: string,
): value is SupplierPriceListAction =>
  SUPPLIER_PRICE_LIST_ACTION_VALUES.includes(
    value as SupplierPriceListAction,
  );
```

权限元数据使用：

```ts
"supplier.product.view": {
  module: "supplier",
  resource: "product",
  action: "view",
},
"supplier.product.manage": {
  module: "supplier",
  resource: "product",
  action: "manage",
},
"supplier.cost-price.view": {
  module: "supplier",
  resource: "cost_price",
  action: "view",
},
"supplier.cost-price.manage": {
  module: "supplier",
  resource: "cost_price",
  action: "manage",
},
```

- [ ] **Step 4：运行 GREEN 与构建**

```bash
bun test packages/domain/src/supplier-product.test.ts \
  packages/domain/src/permission.test.ts
bun --cwd packages/domain run build
```

Expected: 测试通过，domain 构建通过。

- [ ] **Step 5：Commit**

```bash
git add packages/domain/src
git commit -m "feat(domain): 定义供应商品与成本价权限"
```

## Task 2：数据库表、安全和不变量

**Files:**
- Create: `supabase/migrations/20260729160000_create_supplier_products_and_base_prices.sql`
- Create: `apps/api/src/services/supplier-product-pricing-migration-contract.test.ts`

- [ ] **Step 1：先写 migration 契约 RED**

测试读取固定 migration 并断言：

```ts
for (const table of [
  "supplier_products",
  "supplier_skus",
  "supplier_price_lists",
  "supplier_price_list_items",
]) {
  expect(sql).toContain(`CREATE TABLE public.${table}`);
  expect(sql).toContain(
    `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
  );
  expect(sql).toContain(
    `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`,
  );
}

expect(sql).toContain("numeric(18, 8)");
expect(sql).toContain("numeric(14, 2)");
expect(sql).toContain("numeric(7, 6)");
expect(sql).toContain("supplier_products_supplier_code_key");
expect(sql).toContain("supplier_skus_supplier_code_key");
expect(sql).toContain("supplier_price_lists_one_draft_idx");
expect(sql).toContain("operation_source = 'tenant_proxy'");
expect(sql).toContain("proxy_reason");
```

- [ ] **Step 2：运行并确认 RED**

```bash
cd apps/api
bun test src/services/supplier-product-pricing-migration-contract.test.ts
```

Expected: migration 文件不存在。

- [ ] **Step 3：创建四张表和索引**

Migration 使用 `BEGIN/COMMIT`，完整 rollback 注释放在文件头。关键约束：

```sql
CONSTRAINT supplier_products_supplier_code_key
  UNIQUE (supplier_id, product_code),
CONSTRAINT supplier_skus_supplier_code_key
  UNIQUE (supplier_id, sku_code),
CONSTRAINT supplier_price_lists_status_check
  CHECK (lifecycle_status IN ('draft', 'published', 'retired')),
CONSTRAINT supplier_price_list_items_base_quantity_check
  CHECK (minimum_quantity = 1 AND maximum_quantity IS NULL),
CONSTRAINT supplier_price_list_items_unit_price_check
  CHECK (unit_price >= 0),
CONSTRAINT supplier_price_list_items_tax_rate_check
  CHECK (tax_rate BETWEEN 0 AND 1)
```

草稿唯一索引：

```sql
CREATE UNIQUE INDEX supplier_price_lists_one_draft_idx
ON public.supplier_price_lists(supplier_id, price_list_code)
WHERE lifecycle_status = 'draft';
```

- [ ] **Step 4：增加数据库不变量触发器**

`validate_supplier_product_catalog()` 必须锁定并校验启用品牌和末级类目；
`prepare_supplier_sku_unit()` 必须从 `catalog_units` 写入
`base_unit_id/base_unit_conversion`；`lock_published_supplier_price_data()`
拒绝修改已发布/退役价格簿及其条目。

所有函数使用：

```sql
LANGUAGE plpgsql
SET search_path = pg_catalog, public
```

并从 `PUBLIC, anon, authenticated, service_role` 撤销直接执行。

- [ ] **Step 5：增加 RLS 与最小授权**

四表使用显式授权，migration 中不得使用动态表名：

```sql
ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_skus FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_price_lists FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_price_list_items FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.supplier_products,
  public.supplier_skus,
  public.supplier_price_lists,
  public.supplier_price_list_items
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.supplier_products,
  public.supplier_skus,
  public.supplier_price_lists,
  public.supplier_price_list_items
TO service_role;
```

价格发布后仍通过表级 `UPDATE` 执行退役，因此表授权保留 UPDATE，业务不变量由 RPC 和触发器约束。

- [ ] **Step 6：运行 GREEN**

```bash
cd apps/api
bun test src/services/supplier-product-pricing-migration-contract.test.ts
```

Expected: migration 契约全部通过。

- [ ] **Step 7：Commit**

```bash
git add supabase/migrations/20260729160000_create_supplier_products_and_base_prices.sql \
  apps/api/src/services/supplier-product-pricing-migration-contract.test.ts
git commit -m "feat(db): 建立供应商品与基础供货价"
```

## Task 3：原子创建、状态和价格发布命令

**Files:**
- Modify: `supabase/migrations/20260729160000_create_supplier_products_and_base_prices.sql`
- Modify: `apps/api/src/services/supplier-product-pricing-migration-contract.test.ts`

- [ ] **Step 1：先写命令契约 RED**

断言 migration 包含并保护：

```ts
for (const fn of [
  "create_supplier_product",
  "create_supplier_sku",
  "mutate_supplier_product",
  "mutate_supplier_sku",
  "create_supplier_price_list",
  "publish_supplier_price_list",
  "create_supplier_price_list_version",
  "retire_supplier_price_list",
  "upsert_supplier_price_list_item",
  "delete_supplier_price_list_item",
]) {
  expect(sql).toContain(`CREATE FUNCTION public.${fn}(`);
  expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${fn}`);
}
expect(sql).toContain("pg_advisory_xact_lock");
expect(sql).toContain("SUPPLIER_PRICE_PERIOD_CONFLICT");
expect(sql).toContain("supplier_command_events");
```

- [ ] **Step 2：运行并确认 RED**

```bash
cd apps/api
bun test src/services/supplier-product-pricing-migration-contract.test.ts
```

Expected: 原子命令函数不存在。

- [ ] **Step 3：实现商品和 SKU 创建/启停**

命令统一：

```sql
SELECT event.result_payload
FROM public.supplier_command_events AS event
WHERE event.actor_user_id = p_actor_user_id
  AND event.idempotency_key = p_idempotency_key
  AND event.command = 'create_supplier_product';
```

其他命令使用各自的固定 command 字面量：
`create_supplier_sku`、`mutate_supplier_product`、`mutate_supplier_sku`、
`create_supplier_price_list`、`publish_supplier_price_list`、
`create_supplier_price_list_version`、`retire_supplier_price_list`。
重复键参数不一致返回 `SUPPLIER_IDEMPOTENCY_CONFLICT`。启用商品前检查启用
SKU；SKU 可在草稿商品下先启用，但商品停用时不能启用 SKU；只有商品与 SKU
都启用时才能发布价格。停用商品不覆盖 SKU 历史状态。

- [ ] **Step 4：实现价格簿创建、发布、新版本和退役**

发布函数先：

```sql
PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(p_supplier_id::text, 6720240729160000)
);
```

再锁草稿、校验版本/条目/SKU/有效期，使用半开区间：

```sql
published.effective_from < COALESCE(draft.effective_until, 'infinity')
AND COALESCE(published.effective_until, 'infinity') > draft.effective_from
```

检测到同一 SKU 重叠时返回稳定错误码，不改变草稿。

- [ ] **Step 5：收紧 RPC 授权并运行 GREEN**

每个 RPC 创建后立即使用其完整参数签名收紧授权。以发布函数的确定签名为：

```sql
REVOKE ALL ON FUNCTION public.publish_supplier_price_list(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_supplier_price_list(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
) TO service_role;
```

契约测试逐个函数名验证 `REVOKE` 与 `GRANT`，禁止只收紧发布函数而遗漏其他
七个命令。

Run:

```bash
cd apps/api
bun test src/services/supplier-product-pricing-migration-contract.test.ts
```

- [ ] **Step 6：Commit**

```bash
git add supabase/migrations/20260729160000_create_supplier_products_and_base_prices.sql \
  apps/api/src/services/supplier-product-pricing-migration-contract.test.ts
git commit -m "feat(db): 增加供货价原子发布命令"
```

## Task 4：Zod schema 与 API 数据形状

**Files:**
- Create: `apps/api/src/schema/supplier-products.ts`
- Create: `apps/api/src/schema/supplier-products.test.ts`
- Create: `apps/api/src/schema/supplier-price-lists.ts`
- Create: `apps/api/src/schema/supplier-price-lists.test.ts`

- [ ] **Step 1：先写 schema RED**

覆盖：

```ts
expect(SupplierProductListQuerySchema.parse({})).toEqual({
  page: 1,
  pageSize: 20,
});
expect(() => SupplierProductListQuerySchema.parse({
  pageSize: "101",
})).toThrow();
expect(() => SupplierProductCreateSchema.parse({
  product_code: "P-1",
  name: "瓷砖",
  category_id: categoryId,
  brand_id: brandId,
  proxy_reason: " ",
})).toThrow();
expect(() => SupplierPriceItemUpsertSchema.parse({
  supplier_sku_id: skuId,
  unit_price: 10.123,
  tax_rate: 0.13,
  tax_inclusive: true,
  expected_version: 1,
  proxy_reason: "采购员代录供应商书面报价",
})).toThrow();
```

- [ ] **Step 2：运行 RED**

```bash
cd apps/api
bun test src/schema/supplier-products.test.ts \
  src/schema/supplier-price-lists.test.ts
```

- [ ] **Step 3：实现 schema**

分页复用现有 `PaginationQuerySchema`。金额用：

```ts
const money = z.number().nonnegative()
  .refine((value) => Number.isInteger(value * 100), "单价最多保留 2 位小数");
const taxRate = z.number().min(0).max(1)
  .refine(
    (value) => Number.isInteger(value * 1_000_000),
    "税率最多保留 6 位小数",
  );
const proxyReason = z.string().trim()
  .min(2, "请填写代录原因")
  .max(500, "代录原因不能超过 500 个字符");
```

所有对象 `.strict()`；更新必须至少包含一个业务字段；命令必须带
`expected_version` 和 `proxy_reason`。

- [ ] **Step 4：运行 GREEN**

```bash
cd apps/api
bun test src/schema/supplier-products.test.ts \
  src/schema/supplier-price-lists.test.ts
```

- [ ] **Step 5：Commit**

```bash
git add apps/api/src/schema/supplier-products.ts \
  apps/api/src/schema/supplier-products.test.ts \
  apps/api/src/schema/supplier-price-lists.ts \
  apps/api/src/schema/supplier-price-lists.test.ts
git commit -m "feat(api): 校验供应商品与基础供货价"
```

## Task 5：Repository 与访问门禁

**Files:**
- Create: `apps/api/src/repositories/supplier-products.ts`
- Create: `apps/api/src/repositories/supplier-products.test.ts`
- Create: `apps/api/src/repositories/supplier-price-lists.ts`
- Create: `apps/api/src/repositories/supplier-price-lists.test.ts`
- Create: `apps/api/src/services/supplier-product-access.ts`
- Create: `apps/api/src/services/supplier-product-access.test.ts`

- [ ] **Step 1：先写 repository RED**

测试 fake Supabase query，断言商品列表：

```ts
expect(query.eq).toHaveBeenCalledWith("supplier_id", supplierId);
expect(query.range).toHaveBeenCalledWith(0, 19);
expect(query.select).toHaveBeenCalledWith(
  expect.not.stringContaining("unit_price"),
  { count: "exact" },
);
```

价格列表断言：

```ts
expect(query.eq).toHaveBeenCalledWith("supplier_id", supplierId);
expect(query.range).toHaveBeenCalledWith(0, 19);
expect(query.select).toHaveBeenCalledWith(
  expect.stringContaining("version_number"),
  { count: "exact" },
);
```

- [ ] **Step 2：先写访问门禁 RED**

使用 fake access policy 和 tenant supplier repository，覆盖：

```ts
await expect(access.requireProductRead(auth, tenantSupplierId))
  .rejects.toMatchObject({ statusCode: 403 });
await expect(access.requireProductWrite(authWithProductManage, suspendedId))
  .rejects.toMatchObject({ code: "SUPPLIER_ORDER_NOT_ELIGIBLE" });
await expect(access.requirePriceRead(authWithoutCostPrice, activeId))
  .rejects.toMatchObject({ statusCode: 403 });
```

- [ ] **Step 3：运行 RED**

```bash
cd apps/api
bun test src/repositories/supplier-products.test.ts \
  src/repositories/supplier-price-lists.test.ts \
  src/services/supplier-product-access.test.ts
```

- [ ] **Step 4：实现 repository**

商品概要选择字段固定，不包含价格：

```ts
const PRODUCT_LIST_SELECT = [
  "id", "supplier_id", "product_code", "name", "status", "version",
  "category:catalog_categories!category_id(id,code,name,status)",
  "brand:catalog_brands!brand_id(id,code,name,status)",
  "updated_at",
].join(",");
```

每个列表按 `updated_at desc, id desc` 排序并 `.range(start,end)`。
创建和状态命令只调用 migration RPC；更新按 `supplier_id/id/version`
三重限定。

- [ ] **Step 5：实现访问门禁**

`SupplierProductAccessService` 返回服务端解析的：

```ts
type SupplierProxyScope = {
  tenantId: string;
  tenantSupplierId: string;
  supplierId: string;
  employeeId: string;
  authUserId: string;
};
```

读取先检查模块、权限、关系存在；写入额外要求关系、供应商准入和运营状态均可用。

- [ ] **Step 6：运行 GREEN**

```bash
cd apps/api
bun test src/repositories/supplier-products.test.ts \
  src/repositories/supplier-price-lists.test.ts \
  src/services/supplier-product-access.test.ts
```

- [ ] **Step 7：Commit**

```bash
git add apps/api/src/repositories/supplier-products* \
  apps/api/src/repositories/supplier-price-lists* \
  apps/api/src/services/supplier-product-access*
git commit -m "feat(api): 建立供应商品访问与持久层"
```

## Task 6：Service、Controller 与路由

**Files:**
- Create: `apps/api/src/services/supplier-products.ts`
- Create: `apps/api/src/services/supplier-products.test.ts`
- Create: `apps/api/src/services/supplier-price-lists.ts`
- Create: `apps/api/src/services/supplier-price-lists.test.ts`
- Create: `apps/api/src/controllers/supplier-products/index.ts`
- Create: `apps/api/src/controllers/supplier-products/routes.test.ts`
- Create: `apps/api/src/controllers/supplier-price-lists/index.ts`
- Create: `apps/api/src/controllers/supplier-price-lists/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1：先写 service RED**

商品测试断言 scope 中的 `supplierId/tenantId/employeeId` 覆盖客户端数据；
价格测试断言 `cost-price` 权限与商品权限分离。发布测试：

```ts
await service.publish(auth, priceListId, {
  expected_version: 2,
  proxy_reason: "确认供应商盖章报价单",
}, "price-publish:key");

expect(repository.publish).toHaveBeenCalledWith(expect.objectContaining({
  supplier_id: supplierId,
  tenant_id: tenantId,
  actor_employee_id: employeeId,
  expected_version: 2,
  operation_source: "tenant_proxy",
}));
```

- [ ] **Step 2：先写 controller 路由 RED**

断言：

```ts
expect(routes).toContain("GET /supplier-products");
expect(routes).toContain("POST /supplier-products/:id");
expect(routes).toContain("POST /supplier-products/:id/activate");
expect(routes).toContain(
  "POST /supplier-price-lists/:id/publish",
);
```

并断言 controller 使用 `getRequiredTenantContext`、Zod 和
`ResponseHandler.success`。

- [ ] **Step 3：运行 RED**

```bash
cd apps/api
bun test src/services/supplier-products.test.ts \
  src/services/supplier-price-lists.test.ts \
  src/controllers/supplier-products/routes.test.ts \
  src/controllers/supplier-price-lists/routes.test.ts
```

- [ ] **Step 4：实现 service**

service 不接收 tenant ID。创建命令组合：

```ts
{
  ...input,
  supplier_id: scope.supplierId,
  tenant_id: scope.tenantId,
  actor_user_id: scope.authUserId,
  actor_employee_id: scope.employeeId,
  acting_tenant_id: scope.tenantId,
  acting_employee_id: scope.employeeId,
  operation_source: "tenant_proxy",
}
```

所有数据库 `P0001` 错误映射为设计文档中的稳定错误码。

- [ ] **Step 5：实现 controller 和注册**

controller 使用现有 `TenantBaseController`、`@Get/@Post/@Patch/@Put/@Delete`
装饰器和共用 `requireIdempotencyKey` helper。若 helper 目前只在单一 controller，
提取为 `apps/api/src/controllers/supplier-command-http.ts`，不复制实现。

- [ ] **Step 6：运行 GREEN、类型检查和构建**

```bash
cd apps/api
bun test src/services/supplier-products.test.ts \
  src/services/supplier-price-lists.test.ts \
  src/controllers/supplier-products/routes.test.ts \
  src/controllers/supplier-price-lists/routes.test.ts
bun run typecheck
bun run build
```

- [ ] **Step 7：Commit**

```bash
git add apps/api/src/controllers/supplier-products \
  apps/api/src/controllers/supplier-price-lists \
  apps/api/src/controllers/supplier-command-http.ts \
  apps/api/src/services/supplier-products* \
  apps/api/src/services/supplier-price-lists* apps/api/src/routes/index.ts
git commit -m "feat(api): 提供供应商品与供货价接口"
```

## Task 7：Admin 商品与价格工作区

**Files:**
- Create: `apps/admin/app/(console)/supplier-products/page.tsx`
- Create: `apps/admin/app/(console)/supplier-products/loading.tsx`
- Create: `apps/admin/components/supplier-products/supplier-product-types.ts`
- Create: `apps/admin/components/supplier-products/supplier-product-api.ts`
- Create: `apps/admin/components/supplier-products/supplier-product-rules.ts`
- Create: `apps/admin/components/supplier-products/supplier-product-list.tsx`
- Create: `apps/admin/components/supplier-products/supplier-product-dialog.tsx`
- Create: `apps/admin/components/supplier-products/supplier-sku-dialog.tsx`
- Create: `apps/admin/components/supplier-products/supplier-price-list-panel.tsx`
- Create: `apps/admin/components/supplier-products/supplier-product-workspace.tsx`
- Create: `apps/admin/components/supplier-products/supplier-product-page.test.ts`
- Modify: `apps/admin/components/layout/menu-config.ts`
- Modify: `apps/admin/components/suppliers/suppliers-page.test.ts`

- [ ] **Step 1：先写 Admin RED**

源码契约覆盖：

```ts
expect(menu).toContain('href: "/supplier-products"');
expect(menu).toContain('permission: "supplier.product.view"');
expect(page).toContain('permissions.has("supplier.cost-price.view")');
expect(workspace).toContain("canViewCostPrice");
expect(workspace).not.toContain("unit_price");
expect(pricePanel).toContain("unit_price");
expect(productDialog).toContain("proxy_reason");
expect(pricePanel).toContain("发布后不可修改");
```

纯规则测试覆盖无成本价权限时：

```ts
expect(shouldLoadPriceLists(false, "active")).toBe(false);
expect(shouldLoadPriceLists(true, "active")).toBe(true);
```

- [ ] **Step 2：运行 RED**

```bash
cd apps/admin
bun test components/supplier-products components/suppliers
```

- [ ] **Step 3：实现页面权限与导航**

Server page 只从 session 计算：

```ts
<SupplierProductWorkspace
  canViewProducts={permissions.has("supplier.product.view")}
  canManageProducts={permissions.has("supplier.product.manage")}
  canViewCostPrice={permissions.has("supplier.cost-price.view")}
  canManageCostPrice={permissions.has("supplier.cost-price.manage")}
/>
```

无 `supplier.product.view` 显示权限提示；无成本价权限不渲染价格页签。

- [ ] **Step 4：实现供应商选择和商品/SKU**

复用 `/suppliers?page=1&pageSize=20`，商品请求必须带选中的
`tenantSupplierId`。SPU/SKU 写表单都要求 `proxy_reason`，创建使用
`crypto.randomUUID()` 生成资源 ID 和幂等键。

- [ ] **Step 5：实现价格草稿和发布**

价格页签单独请求 `/supplier-price-lists`。发布弹窗展示生效时间、
条目数和“发布后不可修改”；409 使用后端最新 `version/status/actions`
更新当前记录，不猜测版本。

- [ ] **Step 6：运行 GREEN、检查和构建**

```bash
cd apps/admin
bun test components/supplier-products components/suppliers
pnpm check
pnpm build
```

- [ ] **Step 7：Commit**

```bash
git add apps/admin/app/'(console)'/supplier-products \
  apps/admin/components/supplier-products \
  apps/admin/components/layout/menu-config.ts \
  apps/admin/components/suppliers/suppliers-page.test.ts
git commit -m "feat(admin): 增加供应商品与供货价工作区"
```

## Task 8：确定性 E2E、migration 核查与总验证

**Files:**
- Create: `apps/admin/e2e/supplier-product-pricing-mock-backend.mjs`
- Create: `apps/admin/e2e/supplier-product-pricing-workflow.spec.ts`
- Create: `apps/admin/playwright.supplier-product-pricing.config.ts`
- Modify: `apps/admin/package.json`

- [ ] **Step 1：先写商品到发布的 E2E RED**

真实页面操作：

```ts
await page.goto("/supplier-products");
await page.getByRole("button", { name: "新增商品" }).click();
await page.getByLabel("商品编码").fill("E2E-PRODUCT");
await page.getByLabel("商品名称").fill("E2E 瓷砖");
await page.getByLabel("代录原因").fill("供应商书面资料代录");
await page.getByRole("button", { name: "保存商品" }).click();
await expect(page.getByText("E2E 瓷砖", { exact: true })).toBeVisible();
```

随后新增并启用 SKU，创建默认价格草稿，添加单价 88.00、税率 0.13 的条目，
发布并断言版本 1 为“已发布”。

- [ ] **Step 2：运行 RED**

```bash
cd apps/admin
pnpm test:e2e:supplier-product-pricing
```

Expected: Mock 第一个尚未实现的写接口失败，登录和初始分页读取成功。

- [ ] **Step 3：实现内存 Mock 和 mutation journal**

Mock 保持生产分页和排序，发布命令原子地把草稿改为 published。Journal 断言：

```ts
expect(mutations).toEqual(expect.arrayContaining([
  expect.objectContaining({
    method: "POST",
    path: `/supplier-price-lists/${priceListId}/publish`,
    idempotencyKey: expect.stringMatching(/^supplier-price-publish:/),
    payload: expect.objectContaining({
      expected_version: 2,
      proxy_reason: "供应商书面报价代录",
    }),
  }),
]));
```

- [ ] **Step 4：运行 E2E GREEN**

```bash
cd apps/admin
pnpm test:e2e:supplier-product-pricing
```

Expected: SPU → SKU → 基础价 → 发布全流程通过。

- [ ] **Step 5：应用 migration 前核查**

```bash
set -a
source /Users/leefo/Public/work/gooes/.env
set +a
supabase migration list
```

Expected: 只出现 `20260729160000` 为本地待应用；此前 Local/Remote 对齐。

- [ ] **Step 6：应用并核查 migration**

使用项目已有 Supabase 连接方式应用 migration；禁止手工执行 DDL/DML。应用后：

```bash
supabase migration list
```

Expected: Local/Remote 包含并对齐 `20260729160000`。

只读核查四表 RLS/索引/函数授权；对商品、SKU、价格列表和发布冲突查询运行
`EXPLAIN ANALYZE`，确认命中计划中的索引且无无界扫描。

- [ ] **Step 7：总回归**

```bash
bun test packages/domain/src/supplier-product.test.ts \
  packages/domain/src/permission.test.ts
cd apps/api
bun test src/schema/supplier-products.test.ts \
  src/schema/supplier-price-lists.test.ts \
  src/repositories/supplier-products.test.ts \
  src/repositories/supplier-price-lists.test.ts \
  src/services/supplier-product-access.test.ts \
  src/services/supplier-products.test.ts \
  src/services/supplier-price-lists.test.ts \
  src/services/supplier-product-pricing-migration-contract.test.ts \
  src/controllers/supplier-products/routes.test.ts \
  src/controllers/supplier-price-lists/routes.test.ts
bun run typecheck
bun run build
cd ../admin
bun test components/platform-suppliers components/suppliers \
  components/supplier-catalog components/supplier-products
pnpm check
pnpm build
pnpm test:e2e:supplier-catalog
pnpm test:e2e:supplier-product-pricing
git diff --check
git status --short
```

Expected: 全部通过，工作树只包含计划内提交。

- [ ] **Step 8：Commit**

```bash
git add apps/admin/e2e/supplier-product-pricing-* \
  apps/admin/playwright.supplier-product-pricing.config.ts \
  apps/admin/package.json
git commit -m "test(supplier): 覆盖商品到基础价发布流程"
```

## 自审

- 设计中的 SPU、SKU、不可变默认价格版本、代录审计、权限隔离、分页、并发、
  幂等、RLS、Admin 和确定性 E2E 均有对应任务。
- 买方等级价、指定租户协议价、阶梯价、供应商门户、库存、采购订单和销售价
  明确不在本计划内。
- 商品 DTO 与价格 DTO 分文件和分权限；无成本价权限时前端不请求价格 API。
- 所有金额、数量、换算和税率字段使用精确数据库类型，API 限制小数位。
- 所有数据库变更集中在单个受版本控制 migration，包含前向回滚说明。
- 计划不新增依赖，不修改 orange 仓库。
