# 公司仓库采购基础 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立租户仓库主数据和采购双目的地兼容基础，同时保持仓库采购写入口关闭，为后续采购入库与库存台账阶段提供稳定边界。

**Architecture:** Supabase migration 建立仓库主数据、权限、默认仓库和项目/仓库互斥目的地字段；Fastify 按 controller/service/repository 分层提供分页仓库管理接口；现有采购读取模型增加目的地投影，但所有现有写命令继续只接受项目采购。Admin 提供简洁的仓库设置页，仓库采购入口继续受关闭的 `warehouse_procurement_enabled` 门禁保护。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL、Next.js、React、shadcn/ui、Tailwind CSS

**Approved design:** `docs/superpowers/specs/2026-09-05-warehouse-procurement-inventory-mvp-design.md`

---

## Scope Boundary

本计划只交付设计阶段 A：

- 创建、查询、修改、启停和设置默认仓库。
- 为采购批次、采购申请和采购单增加双目的地数据库结构及读取契约。
- 历史采购全部回填为 `project` 目的地。
- 新增 `warehouse_procurement_enabled = false`，但不提供开启交互。
- 现有保存、提交、审批、拆单、收货、应付和付款命令保持项目采购语义。
- 应付和付款表的仓库归属、仓库收货过账与财务读取改造属于阶段 B。

本计划明确不允许创建 `destination_type = warehouse` 的采购记录。阶段 B 必须先实现
库存流水、余额和仓库收货原子过账，之后才能开放仓库采购写入。

## File Structure

- Create: `packages/domain/src/warehouse.ts`
  - 仓库状态和采购目的地共享类型。
- Create: `packages/domain/src/warehouse.test.ts`
  - 共享常量和状态标签测试。
- Modify: `packages/domain/src/index.ts`
  - 导出仓库领域契约。
- Modify: `packages/domain/src/permission.ts`
  - 增加仓库与库存权限代码和显示配置。
- Modify: `packages/domain/src/permission.test.ts`
  - 权限契约测试。
- Create: `supabase/migrations/20260905210000_create_warehouse_foundation.sql`
  - 仓库表、命令事件、默认仓库、功能门禁、权限、索引、RLS 和命令 RPC。
- Create: `apps/api/src/services/warehouse-foundation-migration-contract.test.ts`
  - migration 静态契约测试。
- Create: `apps/api/src/schema/warehouses.ts`
  - 分页、创建和更新输入校验。
- Create: `apps/api/src/schema/warehouses.test.ts`
  - schema 边界测试。
- Create: `apps/api/src/repositories/warehouses.ts`
  - 分页查询、单条查询和命令 RPC。
- Create: `apps/api/src/repositories/warehouses.test.ts`
  - 查询边界、分页和错误包装测试。
- Create: `apps/api/src/services/warehouse-access.ts`
  - 租户上下文和仓库权限校验。
- Create: `apps/api/src/services/warehouses.ts`
  - 仓库业务编排。
- Create: `apps/api/src/services/warehouses.test.ts`
  - 权限、状态和命令参数测试。
- Create: `apps/api/src/controllers/warehouses/index.ts`
  - 仓库 HTTP 路由。
- Create: `apps/api/src/controllers/warehouses/routes.test.ts`
  - 路由、Zod 和 ResponseHandler 测试。
- Create: `supabase/migrations/20260905211000_add_procurement_destinations.sql`
  - 三类采购头表目的地字段、回填、外键、互斥约束和索引。
- Create: `apps/api/src/services/procurement-destination-migration-contract.test.ts`
  - 双目的地 migration 契约测试。
- Create: `apps/api/src/repositories/procurement-destination-records.ts`
  - 三类采购记录共享的目的地解析约束。
- Modify: `apps/api/src/repositories/supplier-purchase-batch-records.ts`
  - 批次目的地与可空项目/仓库投影。
- Modify: `apps/api/src/repositories/supplier-purchase-requisition-records.ts`
  - 申请目的地读取契约。
- Modify: `apps/api/src/repositories/supplier-purchase-order-records.ts`
  - 采购单目的地读取契约。
- Modify: `apps/api/src/repositories/supplier-purchase-batches.ts`
  - 项目采购列表继续按项目权限过滤并排除仓库目的地。
- Modify: `apps/api/src/repositories/supplier-purchase-requisitions.ts`
  - 申请读取选择必要目的地字段。
- Modify: `apps/api/src/repositories/supplier-purchase-orders.ts`
  - 采购单读取选择必要目的地字段。
- Modify: `apps/api/src/repositories/*supplier-purchase*-records.test.ts`
  - 三类记录的项目/仓库互斥解析测试。
- Create: `apps/admin/components/warehouses/warehouse-types.ts`
  - Admin 仓库 DTO。
- Create: `apps/admin/components/warehouses/warehouse-rules.ts`
  - 表单归一化、校验和查询参数。
- Create: `apps/admin/components/warehouses/warehouse-rules.test.ts`
  - Admin 纯函数测试。
- Create: `apps/admin/components/warehouses/warehouse-api.ts`
  - 分页读取和幂等命令请求。
- Create: `apps/admin/components/warehouses/warehouse-dialog.tsx`
  - 新建和编辑仓库 Dialog。
- Create: `apps/admin/components/warehouses/warehouse-workspace.tsx`
  - 仓库列表、搜索、状态筛选和操作。
- Create: `apps/admin/components/warehouses/warehouse-page.test.ts`
  - 页面结构、文案和权限门禁测试。
- Create: `apps/admin/app/(console)/warehouses/page.tsx`
  - 仓库设置页面入口。
- Modify: `apps/admin/components/layout/menu-config.ts`
  - 在“采购供应”增加“仓库设置”。
- Modify: `apps/api/src/types/database.ts`
  - migration 应用后重新生成数据库类型。
- Create: `docs/operations/evidence/2026-09-05-warehouse-procurement-foundation-dev.md`
  - migration、API smoke 和回归证据。

---

### Task 1: 定义仓库与采购目的地 Domain 契约

**Files:**

- Create: `packages/domain/src/warehouse.test.ts`
- Create: `packages/domain/src/warehouse.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/permission.ts`
- Modify: `packages/domain/src/permission.test.ts`

- [ ] **Step 1: 写仓库领域 RED 测试**

Create `packages/domain/src/warehouse.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import {
  PROCUREMENT_DESTINATION_TYPE_VALUES,
  WAREHOUSE_STATUS_LABELS,
  WAREHOUSE_STATUS_VALUES,
} from './warehouse';

describe('warehouse domain contract', () => {
  test('keeps stable warehouse and destination values', () => {
    expect(WAREHOUSE_STATUS_VALUES).toEqual(['active', 'inactive']);
    expect(PROCUREMENT_DESTINATION_TYPE_VALUES).toEqual([
      'project',
      'warehouse',
    ]);
    expect(WAREHOUSE_STATUS_LABELS).toEqual({
      active: '启用',
      inactive: '停用',
    });
  });
});
```

Extend the supplier permission assertion in
`packages/domain/src/permission.test.ts` with:

```ts
"inventory.warehouse.view": {
  label: "查看仓库设置",
  module: "inventory",
},
"inventory.warehouse.manage": {
  label: "管理仓库设置",
  module: "inventory",
},
"inventory.stock.view": {
  label: "查看库存",
  module: "inventory",
},
"inventory.issue.manage": {
  label: "管理项目领料",
  module: "inventory",
},
"inventory.issue.approve": {
  label: "审批项目领料",
  module: "inventory",
},
```

- [ ] **Step 2: 运行 RED**

Run:

```bash
bun test packages/domain/src/warehouse.test.ts packages/domain/src/permission.test.ts
```

Expected: fail because `warehouse.ts` and the five permission definitions do not exist.

- [ ] **Step 3: 实现共享类型**

Create `packages/domain/src/warehouse.ts`:

```ts
export const WAREHOUSE_STATUS_VALUES = ['active', 'inactive'] as const;

export const PROCUREMENT_DESTINATION_TYPE_VALUES = [
  'project',
  'warehouse',
] as const;

export const WAREHOUSE_STATUS_LABELS = {
  active: '启用',
  inactive: '停用',
} as const satisfies Record<WarehouseStatus, string>;

export type WarehouseStatus = (typeof WAREHOUSE_STATUS_VALUES)[number];
export type ProcurementDestinationType =
  (typeof PROCUREMENT_DESTINATION_TYPE_VALUES)[number];
```

Add to `packages/domain/src/index.ts`:

```ts
export * from './warehouse';
```

Add the five codes to `PERMISSION_CODE_VALUES` and matching entries to
`PermissionCodeConfig` in `packages/domain/src/permission.ts` using the labels from
the RED test.

- [ ] **Step 4: 运行 GREEN**

Run:

```bash
bun test packages/domain/src/warehouse.test.ts packages/domain/src/permission.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: 提交 Domain 契约**

```bash
git add packages/domain/src/warehouse.ts packages/domain/src/warehouse.test.ts packages/domain/src/index.ts packages/domain/src/permission.ts packages/domain/src/permission.test.ts
git commit -m "feat(domain): 增加仓库采购领域契约"
```

---

### Task 2: 建立仓库数据库基础

**Files:**

- Create: `apps/api/src/services/warehouse-foundation-migration-contract.test.ts`
- Create: `supabase/migrations/20260905210000_create_warehouse_foundation.sql`

- [ ] **Step 1: 写 migration RED 测试**

Create `apps/api/src/services/warehouse-foundation-migration-contract.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

const migrationPath = new URL(
  '../../../../supabase/migrations/20260905210000_create_warehouse_foundation.sql',
  import.meta.url,
);

describe('warehouse foundation migration', () => {
  test('creates tenant-scoped warehouses and rollout gate', async () => {
    const sql = await Bun.file(migrationPath).text();

    expect(sql).toContain('CREATE TABLE public.warehouses');
    expect(sql).toMatch(/UNIQUE \(id, tenant_id\)/);
    expect(sql).toContain('warehouse_procurement_enabled boolean NOT NULL DEFAULT false');
    expect(sql).toContain('CREATE TABLE public.warehouse_command_events');
    expect(sql).toContain('warehouses_one_default_per_tenant_idx');
    expect(sql).toContain('ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE public.warehouses FORCE ROW LEVEL SECURITY');
  });

  test('creates bounded commands and seeds permissions', async () => {
    const sql = await Bun.file(migrationPath).text();

    expect(sql).toContain('CREATE FUNCTION public.create_tenant_warehouse');
    expect(sql).toContain('CREATE FUNCTION public.update_tenant_warehouse');
    expect(sql).toContain("'inventory.warehouse.view'");
    expect(sql).toContain("'inventory.warehouse.manage'");
    expect(sql).toContain("'inventory.stock.view'");
    expect(sql).toContain("'inventory.issue.manage'");
    expect(sql).toContain("'inventory.issue.approve'");
    expect(sql).toMatch(/WHERE roles\.code = 'system_admin'/);
  });
});
```

- [ ] **Step 2: 运行 RED**

Run:

```bash
cd apps/api
bun test src/services/warehouse-foundation-migration-contract.test.ts
```

Expected: fail because the migration file does not exist.

- [ ] **Step 3: 创建仓库 migration**

Create `supabase/migrations/20260905210000_create_warehouse_foundation.sql` with:

```sql
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE SEQUENCE public.warehouse_code_seq AS bigint START WITH 1;

CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  warehouse_code text NOT NULL DEFAULT (
    'WH-' || lpad(nextval('public.warehouse_code_seq')::text, 6, '0')
  ),
  name text NOT NULL,
  address text NULL,
  contact_name text NULL,
  contact_phone text NULL,
  manager_employee_id uuid NULL,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  version integer NOT NULL DEFAULT 1,
  created_by_employee_id uuid NULL,
  updated_by_employee_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouses_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT warehouses_tenant_code_key UNIQUE (tenant_id, warehouse_code),
  CONSTRAINT warehouses_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT warehouses_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT warehouses_version_check CHECK (version > 0),
  CONSTRAINT warehouses_manager_tenant_fkey
    FOREIGN KEY (manager_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT warehouses_creator_tenant_fkey
    FOREIGN KEY (created_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT warehouses_updater_tenant_fkey
    FOREIGN KEY (updated_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX warehouses_one_default_per_tenant_idx
ON public.warehouses(tenant_id)
WHERE is_default;

CREATE INDEX warehouses_tenant_status_updated_idx
ON public.warehouses(tenant_id, status, updated_at DESC, id DESC);

ALTER TABLE public.tenant_supplier_settings
ADD COLUMN warehouse_procurement_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.tenant_supplier_settings
ADD CONSTRAINT tenant_supplier_settings_warehouse_procurement_parent_check CHECK (
  NOT warehouse_procurement_enabled
  OR (
    module_enabled
    AND procurement_snapshot_v1_enabled
    AND purchase_batch_workflow_enabled
  )
);

CREATE TABLE public.warehouse_command_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL,
  command text NOT NULL CHECK (command IN ('create', 'update')),
  request_fingerprint text NOT NULL,
  result_version integer NOT NULL CHECK (result_version > 0),
  actor_user_id uuid NOT NULL,
  actor_employee_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (
    btrim(idempotency_key) <> '' AND char_length(idempotency_key) <= 120
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_command_events_warehouse_tenant_fkey
    FOREIGN KEY (warehouse_id, tenant_id)
    REFERENCES public.warehouses(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_command_events_actor_tenant_fkey
    FOREIGN KEY (actor_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_command_events_actor_key
    UNIQUE (actor_user_id, idempotency_key)
);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_command_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_command_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.warehouses, public.warehouse_command_events
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.warehouses TO service_role;
GRANT SELECT, INSERT ON TABLE public.warehouse_command_events TO service_role;
REVOKE ALL ON SEQUENCE public.warehouse_code_seq
FROM PUBLIC, anon, authenticated, service_role;
```

In the same migration, add these `SECURITY DEFINER` functions with fixed
`search_path = pg_catalog, public`:

```sql
CREATE FUNCTION public.create_tenant_warehouse(
  p_warehouse_id uuid,
  p_tenant_id uuid,
  p_name text,
  p_address text,
  p_contact_name text,
  p_contact_phone text,
  p_manager_employee_id uuid,
  p_is_default boolean,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
) RETURNS public.warehouses;

CREATE FUNCTION public.update_tenant_warehouse(
  p_warehouse_id uuid,
  p_tenant_id uuid,
  p_expected_version integer,
  p_name text,
  p_address text,
  p_contact_name text,
  p_contact_phone text,
  p_manager_employee_id uuid,
  p_is_default boolean,
  p_status text,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
) RETURNS public.warehouses;
```

Both functions must:

```text
validate tenant, actor and normalized fields
take an actor/key advisory lock before row locks
replay an exact matching warehouse_command_events request
reject reuse of the same actor/key with another request fingerprint
lock tenant warehouse rows in id order
make the first active warehouse default regardless of p_is_default
clear the prior default only when another active warehouse becomes default
reject clearing or deactivating the current default directly
reject deactivating the tenant's only active warehouse
use caller supplied warehouse UUID for create identity
require expected_version for update
insert one warehouse_command_events audit row
return one warehouses row
```

Add the default seed trigger with this fixed behavior:

```sql
CREATE FUNCTION public.ensure_default_tenant_warehouse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.module_enabled AND NOT EXISTS (
    SELECT 1
    FROM public.warehouses AS warehouse
    WHERE warehouse.tenant_id = NEW.tenant_id
  ) THEN
    INSERT INTO public.warehouses (
      id,
      tenant_id,
      name,
      is_default,
      status,
      created_by_employee_id,
      updated_by_employee_id
    ) VALUES (
      gen_random_uuid(),
      NEW.tenant_id,
      '公司仓库',
      true,
      'active',
      NEW.enabled_by_employee_id,
      NEW.enabled_by_employee_id
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER tenant_supplier_settings_ensure_default_warehouse
AFTER INSERT OR UPDATE OF module_enabled
ON public.tenant_supplier_settings
FOR EACH ROW
EXECUTE FUNCTION public.ensure_default_tenant_warehouse();
```

Run the same insert as a set-based backfill for existing enabled tenants before creating the
trigger. Revoke both command functions from `PUBLIC`, `anon`, and `authenticated`; grant execute
only to `service_role`; finish the migration with `COMMIT`.

Seed one active default “公司仓库” for each tenant whose supplier module is enabled.
Install an `AFTER INSERT OR UPDATE OF module_enabled` trigger on
`tenant_supplier_settings` that creates the default warehouse only when the module
changes to enabled and the tenant has no warehouse. System-created rows use the setting's
`enabled_by_employee_id` when available.

Seed the five permissions from Task 1 and grant all five only to tenant `system_admin` roles in
Stage A. Do not change other standard roles until the inventory and issue workflows exist.

- [ ] **Step 4: 运行 migration 契约测试**

Run:

```bash
cd apps/api
bun test src/services/warehouse-foundation-migration-contract.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: 提交数据库基础**

```bash
git add supabase/migrations/20260905210000_create_warehouse_foundation.sql apps/api/src/services/warehouse-foundation-migration-contract.test.ts
git commit -m "feat(db): 建立租户仓库基础"
```

---

### Task 3: 定义仓库 API Schema

**Files:**

- Create: `apps/api/src/schema/warehouses.test.ts`
- Create: `apps/api/src/schema/warehouses.ts`

- [ ] **Step 1: 写 schema RED 测试**

Create `apps/api/src/schema/warehouses.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

const ID = '91000000-0000-4000-8000-000000000001';

describe('warehouse schemas', () => {
  test('normalizes paginated list input', async () => {
    const { WarehouseListQuerySchema } = await import('./warehouses');
    expect(WarehouseListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(() => WarehouseListQuerySchema.parse({ pageSize: 101 })).toThrow();
  });

  test('accepts system id create and versioned update', async () => {
    const { WarehouseCreateSchema, WarehouseUpdateSchema } = await import(
      './warehouses'
    );
    expect(WarehouseCreateSchema.parse({ id: ID, name: '公司仓库' })).toEqual({
      id: ID,
      name: '公司仓库',
      is_default: false,
    });
    expect(WarehouseUpdateSchema.parse({
      expected_version: 1,
      name: '主仓',
      is_default: true,
      status: 'active',
    }).is_default).toBe(true);
  });

  test('rejects empty names, unknown fields and incomplete updates', async () => {
    const { WarehouseCreateSchema, WarehouseUpdateSchema } = await import(
      './warehouses'
    );
    expect(() => WarehouseCreateSchema.parse({ id: ID, name: ' ' })).toThrow();
    expect(() => WarehouseCreateSchema.parse({ id: ID, name: '仓库', code: 'WH-1' })).toThrow();
    expect(() => WarehouseUpdateSchema.parse({ expected_version: 1 })).toThrow();
  });
});
```

- [ ] **Step 2: 运行 RED**

Run:

```bash
cd apps/api
bun test src/schema/warehouses.test.ts
```

Expected: fail because `warehouses.ts` does not exist.

- [ ] **Step 3: 实现 schema**

Create `apps/api/src/schema/warehouses.ts` with strict Zod schemas:

```ts
import { WAREHOUSE_STATUS_VALUES } from '@gooes/domain';
import { z } from 'zod';

import { PaginationQuerySchema } from './request';

const uuid = z.uuid('无效的仓库 ID');
const name = z.string().trim().min(1, '仓库名称不能为空').max(80);
const optionalText = (max: number) => z.string().trim().min(1).max(max)
  .nullable().optional();

export const WarehouseListQuerySchema = PaginationQuerySchema.extend({
  keyword: z.string().trim().max(80).optional(),
  status: z.enum(WAREHOUSE_STATUS_VALUES).optional(),
}).strict();

export const WarehouseParamSchema = z.object({ id: uuid }).strict();

export const WarehouseCreateSchema = z.object({
  id: uuid,
  name,
  address: optionalText(200),
  contact_name: optionalText(50),
  contact_phone: optionalText(30),
  manager_employee_id: uuid.nullable().optional(),
  is_default: z.boolean().default(false),
}).strict();

export const WarehouseUpdateSchema = z.object({
  expected_version: z.number().int().positive(),
  name: name.optional(),
  address: optionalText(200),
  contact_name: optionalText(50),
  contact_phone: optionalText(30),
  manager_employee_id: uuid.nullable().optional(),
  is_default: z.boolean().optional(),
  status: z.enum(WAREHOUSE_STATUS_VALUES).optional(),
}).strict().refine(
  ({ expected_version: _expectedVersion, ...changes }) =>
    Object.keys(changes).length > 0,
  { message: '至少需要修改一个字段' },
);
```

Export inferred input types for service/controller use.

- [ ] **Step 4: 运行 GREEN**

Run:

```bash
cd apps/api
bun test src/schema/warehouses.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: 提交 schema**

```bash
git add apps/api/src/schema/warehouses.ts apps/api/src/schema/warehouses.test.ts
git commit -m "feat(api): 定义仓库接口契约"
```

---

### Task 4: 实现仓库 Repository

**Files:**

- Create: `apps/api/src/repositories/warehouses.test.ts`
- Create: `apps/api/src/repositories/warehouses.ts`

- [ ] **Step 1: 写 repository RED 测试**

Use a bounded Supabase query mock and assert:

```ts
expect(calls).toContainEqual(['eq', 'tenant_id', TENANT_ID]);
expect(calls).toContainEqual(['range', 0, 19]);
expect(calls).toContainEqual(['order', 'updated_at', { ascending: false }]);
expect(calls).toContainEqual(['rpc', 'create_tenant_warehouse']);
expect(calls).toContainEqual(['rpc', 'update_tenant_warehouse']);
```

Also assert malformed database rows become `Errors.dbError("查询仓库失败", issues)` and
that `pageSize=100` produces `.range(0, 99)`.

- [ ] **Step 2: 运行 RED**

Run:

```bash
cd apps/api
bun test src/repositories/warehouses.test.ts
```

Expected: fail because the repository does not exist.

- [ ] **Step 3: 实现 repository**

Create `apps/api/src/repositories/warehouses.ts` with:

```ts
const WarehouseRecordSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  warehouse_code: z.string().min(1),
  name: z.string().min(1),
  address: z.string().nullable(),
  contact_name: z.string().nullable(),
  contact_phone: z.string().nullable(),
  manager_employee_id: z.uuid().nullable(),
  is_default: z.boolean(),
  status: z.enum(WAREHOUSE_STATUS_VALUES),
  version: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
}).strict();

const WAREHOUSE_SELECT = [
  'id', 'tenant_id', 'warehouse_code', 'name', 'address',
  'contact_name', 'contact_phone', 'manager_employee_id',
  'is_default', 'status', 'version', 'created_at', 'updated_at',
].join(',');
```

Implement `list`, `findById`, `create`, and `update` methods. `list` must select only
`WAREHOUSE_SELECT`, filter by `tenant_id`, optionally filter status and escaped keyword,
order by `updated_at DESC, id DESC`, and use `.range()`. Mutations call the two migration
RPCs and parse a single strict record. Wrap every database error through `Errors.dbError`.

- [ ] **Step 4: 运行 GREEN**

Run:

```bash
cd apps/api
bun test src/repositories/warehouses.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: 提交 repository**

```bash
git add apps/api/src/repositories/warehouses.ts apps/api/src/repositories/warehouses.test.ts
git commit -m "feat(api): 实现仓库数据访问"
```

---

### Task 5: 实现仓库 Service、权限和 Controller

**Files:**

- Create: `apps/api/src/services/warehouse-access.ts`
- Create: `apps/api/src/services/warehouses.ts`
- Create: `apps/api/src/services/warehouses.test.ts`
- Create: `apps/api/src/controllers/warehouses/index.ts`
- Create: `apps/api/src/controllers/warehouses/routes.test.ts`

- [ ] **Step 1: 写 service 和 routes RED 测试**

Service tests must prove:

```ts
await service.list(auth(['inventory.warehouse.view']), { page: 1, pageSize: 20 });
await expect(service.create(auth([]), input, 'key-1')).rejects.toMatchObject({
  statusCode: 403,
});
expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
  tenant_id: TENANT_ID,
  actor_employee_id: EMPLOYEE_ID,
  idempotency_key: 'key-1',
}));
```

Route tests must assert exactly these routes:

```ts
[
  ['GET', '/warehouses'],
  ['GET', '/warehouses/:id'],
  ['POST', '/warehouses'],
  ['PATCH', '/warehouses/:id'],
]
```

- [ ] **Step 2: 运行 RED**

Run:

```bash
cd apps/api
bun test src/services/warehouses.test.ts src/controllers/warehouses/routes.test.ts
```

Expected: fail because service and controller modules do not exist.

- [ ] **Step 3: 实现权限和业务编排**

`WarehouseAccessService` must use `accessPolicyService.assertTenantContext` and
`assertPermission`:

```ts
requireRead(auth: AuthContext) {
  return this.requireScope(auth, 'inventory.warehouse.view');
}

requireManage(auth: AuthContext) {
  return this.requireScope(auth, 'inventory.warehouse.manage');
}
```

`WarehousesService` must expose `list`, `get`, `create`, and `update`. Read methods use
read permission; mutation methods use manage permission and require employee/user identity.
Missing records return
`Errors.business(404, '仓库不存在', 'WAREHOUSE_NOT_FOUND')`. Version/state conflicts returned
by RPC are mapped to
`Errors.business(409, '仓库状态已变化，请刷新后重试', 'WAREHOUSE_STATE_CONFLICT')`.

- [ ] **Step 4: 实现 controller**

Create a `TenantBaseController` with `@Get`, `@Post`, and `@Patch`. Parse every input with
the Task 3 schemas, require `Idempotency-Key` for POST/PATCH, call the service, and return
`ResponseHandler.success`. Do not register custom routes manually outside the controller
autoload pattern.

- [ ] **Step 5: 运行 GREEN 并提交**

Run:

```bash
cd apps/api
bun test src/services/warehouses.test.ts src/controllers/warehouses/routes.test.ts
```

Expected: all tests pass.

Commit:

```bash
git add apps/api/src/services/warehouse-access.ts apps/api/src/services/warehouses.ts apps/api/src/services/warehouses.test.ts apps/api/src/controllers/warehouses/index.ts apps/api/src/controllers/warehouses/routes.test.ts
git commit -m "feat(api): 提供租户仓库管理接口"
```

---

### Task 6: 增加采购双目的地数据库结构

**Files:**

- Create: `apps/api/src/services/procurement-destination-migration-contract.test.ts`
- Create: `supabase/migrations/20260905211000_add_procurement_destinations.sql`

- [ ] **Step 1: 写双目的地 RED 测试**

Create a migration contract test that iterates over:

```ts
const headers = [
  'supplier_purchase_batches',
  'supplier_purchase_requisitions',
  'supplier_purchase_orders',
] as const;
```

For each table assert the SQL adds `destination_type`, adds `warehouse_id`, drops
`project_id` NOT NULL only after backfill, adds a composite warehouse foreign key, and adds
an XOR check containing both legal states. Also assert:

```ts
expect(sql).toContain("SET destination_type = 'project'");
expect(sql).toContain('warehouse_procurement_enabled');
expect(sql).not.toMatch(/warehouse_procurement_enabled\s*=\s*true/);
```

- [ ] **Step 2: 运行 RED**

Run:

```bash
cd apps/api
bun test src/services/procurement-destination-migration-contract.test.ts
```

Expected: fail because the migration does not exist.

- [ ] **Step 3: 创建双目的地 migration**

For each procurement header, apply this shape using table-specific constraint names:

```sql
ALTER TABLE public.supplier_purchase_batches
ADD COLUMN destination_type text,
ADD COLUMN warehouse_id uuid NULL;

UPDATE public.supplier_purchase_batches
SET destination_type = 'project'
WHERE destination_type IS NULL;

ALTER TABLE public.supplier_purchase_batches
ALTER COLUMN destination_type SET DEFAULT 'project',
ALTER COLUMN destination_type SET NOT NULL,
ALTER COLUMN project_id DROP NOT NULL,
ADD CONSTRAINT supplier_purchase_batches_warehouse_tenant_fkey
  FOREIGN KEY (warehouse_id, tenant_id)
  REFERENCES public.warehouses(id, tenant_id) ON DELETE RESTRICT,
ADD CONSTRAINT supplier_purchase_batches_destination_check CHECK (
  (destination_type = 'project' AND project_id IS NOT NULL AND warehouse_id IS NULL)
  OR
  (destination_type = 'warehouse' AND project_id IS NULL AND warehouse_id IS NOT NULL)
);
```

Repeat for requisitions and orders. Add partial indexes for tenant warehouse reads:

```sql
CREATE INDEX supplier_purchase_batches_tenant_warehouse_updated_idx
ON public.supplier_purchase_batches(tenant_id, warehouse_id, updated_at DESC, id DESC)
WHERE destination_type = 'warehouse';
```

Add equivalent indexes to requisitions and orders. Do not replace any save/submit/review,
fulfillment, payable or payment RPC in this migration. Existing functions continue requiring
`p_project_id`, so the new warehouse state remains structurally valid but unreachable through
public API commands.

- [ ] **Step 4: 运行 GREEN**

Run:

```bash
cd apps/api
bun test src/services/procurement-destination-migration-contract.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: 提交双目的地结构**

```bash
git add supabase/migrations/20260905211000_add_procurement_destinations.sql apps/api/src/services/procurement-destination-migration-contract.test.ts
git commit -m "feat(db): 增加采购双目的地结构"
```

---

### Task 7: 扩展采购读取契约但保持项目写门禁

**Files:**

- Modify: `apps/api/src/repositories/supplier-purchase-batch-records.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-requisition-records.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-order-records.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-batches.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-requisitions.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-orders.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-batch-records.test.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-requisition-records.test.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-order-records.test.ts`

- [ ] **Step 1: 写读取模型 RED 测试**

Add one project and one warehouse fixture per record schema. Assert the legal projection:

```ts
expect(schema.parse(projectRecord)).toMatchObject({
  destination_type: 'project',
  project_id: PROJECT_ID,
  warehouse_id: null,
});

expect(schema.parse(warehouseRecord)).toMatchObject({
  destination_type: 'warehouse',
  project_id: null,
  warehouse_id: WAREHOUSE_ID,
});
```

Assert both-null and both-present destinations fail parsing. Assert all existing command input
schemas still reject a missing `project_id` so Stage A cannot write warehouse procurement.

- [ ] **Step 2: 运行 RED**

Run:

```bash
cd apps/api
bun test src/repositories/supplier-purchase-batch-records.test.ts src/repositories/supplier-purchase-requisition-records.test.ts src/repositories/supplier-purchase-order-records.test.ts src/schema/supplier-purchase-batches.test.ts src/schema/supplier-purchase-requisitions.test.ts src/schema/supplier-purchase-orders.test.ts
```

Expected: record tests fail because destination fields are not parsed; command schema tests
continue passing.

- [ ] **Step 3: 实现统一目的地 Schema**

Create one internal helper in the nearest shared record module or a focused new
`apps/api/src/repositories/procurement-destination-records.ts`:

```ts
export const ProcurementDestinationRecordSchema = z.object({
  destination_type: z.enum(PROCUREMENT_DESTINATION_TYPE_VALUES),
  project_id: z.uuid().nullable(),
  warehouse_id: z.uuid().nullable(),
}).superRefine((value, context) => {
  const isProject = value.destination_type === 'project'
    && value.project_id !== null
    && value.warehouse_id === null;
  const isWarehouse = value.destination_type === 'warehouse'
    && value.project_id === null
    && value.warehouse_id !== null;
  if (!isProject && !isWarehouse) {
    context.addIssue({
      code: 'custom',
      path: ['destination_type'],
      message: '采购目的地数据不一致',
    });
  }
});
```

Extend batch, requisition and order selects with `destination_type`, `warehouse_id`, and a
nullable warehouse relation selecting only `id,name,status`. Change project relation schemas to
nullable. Preserve existing project-only command input types.

- [ ] **Step 4: 保持列表权限为项目范围**

Until Stage B opens warehouse procurement, add `.eq('destination_type', 'project')` to the batch
and requisition PostgREST list queries. Do not replace `list_supplier_purchase_orders` in Stage A:
no API command can create a warehouse order, and replacing that large RPC before warehouse access
semantics exist would add risk without usable behavior. Detail services must reject a warehouse
destination with
`Errors.business(409, '仓库采购尚未开放', 'WAREHOUSE_PROCUREMENT_NOT_ENABLED')` before calling
project access checks. Stage B must make the order list RPC destination-aware before enabling
`warehouse_procurement_enabled`.

- [ ] **Step 5: 运行 GREEN 并提交**

Run:

```bash
cd apps/api
bun test src/repositories/supplier-purchase-batch-records.test.ts src/repositories/supplier-purchase-requisition-records.test.ts src/repositories/supplier-purchase-order-records.test.ts src/schema/supplier-purchase-batches.test.ts src/schema/supplier-purchase-requisitions.test.ts src/schema/supplier-purchase-orders.test.ts
bun run typecheck
```

Expected: all selected tests pass and API typecheck exits 0.

Commit:

```bash
git add apps/api/src/repositories/procurement-destination-records.ts apps/api/src/repositories/supplier-purchase-batch-records.ts apps/api/src/repositories/supplier-purchase-requisition-records.ts apps/api/src/repositories/supplier-purchase-order-records.ts apps/api/src/repositories/supplier-purchase-batches.ts apps/api/src/repositories/supplier-purchase-requisitions.ts apps/api/src/repositories/supplier-purchase-orders.ts apps/api/src/repositories/supplier-purchase-batch-records.test.ts apps/api/src/repositories/supplier-purchase-requisition-records.test.ts apps/api/src/repositories/supplier-purchase-order-records.test.ts
git commit -m "feat(api): 返回采购目的地信息"
```

---

### Task 8: 实现 Admin 仓库数据层

**Files:**

- Create: `apps/admin/components/warehouses/warehouse-types.ts`
- Create: `apps/admin/components/warehouses/warehouse-rules.ts`
- Create: `apps/admin/components/warehouses/warehouse-rules.test.ts`
- Create: `apps/admin/components/warehouses/warehouse-api.ts`

- [ ] **Step 1: 写 Admin RED 测试**

Test exact query and validation behavior:

```ts
expect(buildWarehouseListPath({ page: 1, pageSize: 20, keyword: '主仓' }))
  .toBe('/warehouses?page=1&pageSize=20&keyword=%E4%B8%BB%E4%BB%93');
expect(validateWarehouseDraft({ name: ' ' })).toEqual({
  name: '请输入仓库名称',
});
expect(normalizeWarehouseDraft({ name: ' 主仓 ', address: ' ' })).toMatchObject({
  name: '主仓',
  address: null,
});
```

- [ ] **Step 2: 运行 RED**

Run:

```bash
cd apps/admin
bun test components/warehouses/warehouse-rules.test.ts
```

Expected: fail because the warehouse Admin modules do not exist.

- [ ] **Step 3: 实现类型、规则和 API**

Define `Warehouse`, `WarehousePage`, `WarehouseDraft`, and `WarehouseStatus` without type
assertions. Use `requestBackendJson` for all calls. List calls include explicit pagination;
create calls generate `crypto.randomUUID()` for the body ID and a separate idempotency key;
updates send `expected_version` and an idempotency key.

Do not expose `warehouse_code` in editable fields. The code may be retained in DTOs for support
and audit but must not be included in user-facing labels.

- [ ] **Step 4: 运行 GREEN 并提交**

Run:

```bash
cd apps/admin
bun test components/warehouses/warehouse-rules.test.ts
```

Expected: all tests pass.

Commit:

```bash
git add apps/admin/components/warehouses/warehouse-types.ts apps/admin/components/warehouses/warehouse-rules.ts apps/admin/components/warehouses/warehouse-rules.test.ts apps/admin/components/warehouses/warehouse-api.ts
git commit -m "feat(admin): 建立仓库数据层"
```

---

### Task 9: 实现 Admin 仓库设置页

**Files:**

- Create: `apps/admin/components/warehouses/warehouse-dialog.tsx`
- Create: `apps/admin/components/warehouses/warehouse-workspace.tsx`
- Create: `apps/admin/components/warehouses/warehouse-page.test.ts`
- Create: `apps/admin/app/(console)/warehouses/page.tsx`
- Modify: `apps/admin/components/layout/menu-config.ts`

- [ ] **Step 1: 写页面结构 RED 测试**

The source contract test must assert:

```ts
expect(workspace).toContain('仓库设置');
expect(workspace).toContain('搜索仓库名称或地址');
expect(workspace).toContain('设为默认');
expect(workspace).not.toContain('warehouse_code');
expect(menu).toContain('href: "/warehouses"');
expect(menu).toContain('permission: "inventory.warehouse.view"');
```

- [ ] **Step 2: 运行 RED**

Run:

```bash
cd apps/admin
bun test components/warehouses/warehouse-page.test.ts
```

Expected: fail because the UI files and menu item do not exist.

- [ ] **Step 3: 实现页面**

Use existing `PageHeader`, `Button`, `Input`, `Select`, `Table`, `Badge`, `Dialog`, `Field`,
`StatusAlert`, pagination and Lucide icons. Layout requirements:

```text
Page header: 仓库设置                       [新增仓库]
Toolbar: [搜索仓库名称或地址] [全部状态] [筛选] [重置]
Table: 仓库名称 | 地址 | 负责人 | 默认仓库 | 状态 | 更新时间 | 操作
```

The first active warehouse is automatically default from the backend. Create/edit Dialog fields
are only name, address, contact, manager and default toggle. Status changes use explicit
enable/disable confirmation. Put status action last. Do not show internal code, feature flags,
database versions or API wording.

The page checks `inventory.warehouse.view`; mutation controls require
`inventory.warehouse.manage`. Empty state says “暂未设置仓库” and offers the create action only
when the user can manage warehouses.

- [ ] **Step 4: 运行页面验证**

Run:

```bash
cd apps/admin
bun test components/warehouses/warehouse-page.test.ts components/warehouses/warehouse-rules.test.ts
pnpm check
```

Expected: source contract tests pass, file-size check passes, Next type generation succeeds, and
TypeScript exits 0.

- [ ] **Step 5: 提交 Admin 页面**

```bash
git add apps/admin/components/warehouses/warehouse-dialog.tsx apps/admin/components/warehouses/warehouse-workspace.tsx apps/admin/components/warehouses/warehouse-page.test.ts 'apps/admin/app/(console)/warehouses/page.tsx' apps/admin/components/layout/menu-config.ts
git commit -m "feat(admin): 增加仓库设置页"
```

---

### Task 10: 应用 migration、生成类型并完成阶段 A 验收

**Files:**

- Modify: `apps/api/src/types/database.ts`
- Create: `docs/operations/evidence/2026-09-05-warehouse-procurement-foundation-dev.md`

- [ ] **Step 1: 在开发库应用待执行 migration**

Load `/Users/leefo/Public/work/gooes/.env` without printing secrets, inspect pending migrations,
then run the repository's existing Supabase migration command. Before apply, expected pending
files are exactly:

```text
20260905210000_create_warehouse_foundation.sql
20260905211000_add_procurement_destinations.sql
```

Do not run manual DDL or DML against the remote database.

- [ ] **Step 2: 核对 migration 对齐**

Run the configured equivalent of:

```bash
supabase migration list
```

Expected: both migration versions have matching Local and Remote entries. Stop if any older local
migration is missing remotely or any unexpected remote-only version appears.

- [ ] **Step 3: 重新生成数据库类型**

Run the repository's configured Supabase type generation command, writing only:

```text
apps/api/src/types/database.ts
```

Confirm generated types contain `warehouses`, `warehouse_procurement_enabled`,
`destination_type`, and `warehouse_id`. If postgres-meta returns DNS `EAI_AGAIN`, leave the prior
type file untouched and report the stage blocked; do not hand-edit generated database types.

- [ ] **Step 4: 运行 API、Domain 和 Admin 回归**

Run:

```bash
bun test packages/domain/src/warehouse.test.ts packages/domain/src/permission.test.ts
cd apps/api
bun test src/schema/warehouses.test.ts src/repositories/warehouses.test.ts src/services/warehouses.test.ts src/controllers/warehouses/routes.test.ts src/services/warehouse-foundation-migration-contract.test.ts src/services/procurement-destination-migration-contract.test.ts src/repositories/supplier-purchase-batch-records.test.ts src/repositories/supplier-purchase-requisition-records.test.ts src/repositories/supplier-purchase-order-records.test.ts
bun run typecheck
cd ../admin
bun test components/warehouses/warehouse-rules.test.ts components/warehouses/warehouse-page.test.ts
pnpm check
```

Expected: all tests pass; API and Admin typechecks exit 0.

- [ ] **Step 5: 做开发环境 API smoke**

With a tenant admin token, verify:

```text
GET /warehouses?page=1&pageSize=20 -> one default 公司仓库
POST /warehouses -> creates a second warehouse with system code
PATCH /warehouses/:id is_default=true -> old default becomes false
PATCH /warehouses/:id status=inactive -> cannot deactivate the only active warehouse
GET /supplier-purchase-batches?page=1&pageSize=20 -> existing project rows unchanged
GET /supplier-purchase-orders?page=1&pageSize=20 -> existing project rows unchanged
```

Also query the database read-only to prove no row exists with
`destination_type = 'warehouse'` in the three procurement header tables.

- [ ] **Step 6: 记录证据并提交**

Create `docs/operations/evidence/2026-09-05-warehouse-procurement-foundation-dev.md` containing:

```text
commit SHA
development API revision
applied migration versions
Local/Remote migration alignment result
type generation result
test counts
redacted API smoke results
warehouse procurement row count, expected 0
rollback gate: warehouse_procurement_enabled remains false
```

Commit:

```bash
git add apps/api/src/types/database.ts docs/operations/evidence/2026-09-05-warehouse-procurement-foundation-dev.md
git commit -m "chore(warehouse): 验证仓库采购基础"
```

---

## Final Review Gate

Before creating a PR or merging:

```bash
git status --short
git diff origin/main...HEAD --check
bun run api:typecheck
cd apps/admin && pnpm check
```

Review these invariants manually:

- Existing project procurement creates, submits, approves, receives and pays without response
  regressions.
- No Stage A API can create warehouse-destination procurement.
- `warehouse_procurement_enabled` remains false for every tenant.
- Warehouse lists are tenant-scoped, paginated and bounded to `pageSize <= 100`.
- Warehouse codes and feature flags are not shown to tenant users.
- Only migrations changed remote database state.
- The Orange repository was not modified.

After the gate passes, create a PR and use squash merge. Do not enable warehouse procurement in
development or production until the separate Stage B inventory receipt plan is implemented and
verified.
