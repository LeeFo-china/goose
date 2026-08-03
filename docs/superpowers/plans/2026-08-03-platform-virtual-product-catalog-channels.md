# Platform Virtual Product Catalog and Channels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可分页管理多种数字权益商品的通用目录、发放规则、微信渠道配置、商品映射和环境级微信任务证据。

**Architecture:** 以 `platform_virtual_products` 为商品事实，以一对一发放规则描述权益语义，以渠道表保存环境级账号配置，以映射和操作表隔离每件商品的微信状态。Controller 只做 HTTP 与 Zod 校验，Service 负责权限和状态机，Repository/RPC 负责 Supabase 事务与环境级串行锁；旧年度品牌权益接口在本阶段继续通过兼容适配器读取同一事实。

**Tech Stack:** Bun、TypeScript、Fastify 5、Zod 4、Supabase/PostgreSQL、`@gooes/domain`、微信小程序虚拟支付 xpay 网关

---

**Prerequisite:** 已确认设计 `docs/superpowers/specs/2026-08-03-platform-virtual-product-catalog-and-entitlement-ledger-design.md`。本计划完成并通过候选事实一致性验证后，才执行 Admin 计划。

## File structure

- Create `packages/domain/src/virtual-product.ts`: 通用商品、发放规则、渠道状态和分页 DTO 常量。
- Modify `packages/domain/src/index.ts`: 导出通用虚拟商品契约。
- Modify `packages/domain/src/permission.ts`: 新权限字典。
- Create `packages/domain/src/virtual-product.test.ts`: 契约与权限值测试。
- Create `supabase/migrations/20260803100000_create_platform_virtual_product_catalog.sql`: 商品、规则、渠道、映射、操作、索引、RLS、权限和年度商品回填。
- Create `apps/api/src/services/platform-virtual-product-catalog-migration.test.ts`: migration 合同测试。
- Create `apps/api/src/schema/platform-virtual-products.ts`: 列表、创建、编辑、状态和渠道命令 Zod schema。
- Create `apps/api/src/schema/platform-virtual-products.test.ts`: 输入边界测试。
- Create `apps/api/src/repositories/platform-virtual-products.ts`: 分页查询、详情和受控 RPC 调用。
- Create `apps/api/src/repositories/platform-virtual-goods-operations.ts`: 环境级操作查询和推进。
- Create `apps/api/src/services/platform-virtual-products.ts`: CRUD、状态机、权限和 DTO 转换。
- Create `apps/api/src/services/platform-virtual-product-channels.ts`: 上传、发布、校验和只读刷新编排。
- Create `apps/api/src/controllers/platform-virtual-products/index.ts`: 通用平台 API。
- Modify `apps/api/src/routes/index.ts`: 注册新 Controller。
- Modify `apps/api/src/controllers/platform-payment-configs/index.ts`: 旧微信商品路由委托兼容适配器并标记废弃。
- Modify `apps/api/src/services/branding-virtual-products.ts`: 年度商品兼容读取新目录事实。

### Task 1: Add shared product and permission contracts

**Files:**
- Create: `packages/domain/src/virtual-product.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/permission.ts`
- Test: `packages/domain/src/virtual-product.test.ts`
- Test: `packages/domain/src/permission.test.ts`

- [ ] **Step 1: Write the failing contract tests**

```ts
import { describe, expect, test } from 'bun:test';
import {
  VIRTUAL_BENEFIT_TYPES,
  VIRTUAL_PRODUCT_STATUSES,
  VIRTUAL_GOODS_OPERATION_STATES,
} from './virtual-product';

describe('virtual product contract', () => {
  test('freezes supported benefit and lifecycle values', () => {
    expect(VIRTUAL_BENEFIT_TYPES).toEqual(['duration', 'count', 'points', 'quota']);
    expect(VIRTUAL_PRODUCT_STATUSES).toEqual(['draft', 'active', 'suspended', 'archived']);
    expect(VIRTUAL_GOODS_OPERATION_STATES).toEqual([
      'submitted', 'processing', 'succeeded', 'failed', 'unknown',
    ]);
  });
});
```

Add these expectations to `packages/domain/src/permission.test.ts`:

```ts
for (const code of [
  'platform.virtual_product.read',
  'platform.virtual_product.manage',
  'platform.virtual_product.publish',
  'platform.virtual_order.read',
  'platform.virtual_refund.manage',
  'virtual_product.purchase',
]) expect(PERMISSION_CODE_VALUES).toContain(code);
```

- [ ] **Step 2: Run the tests and verify the missing exports fail**

Run: `bun test packages/domain/src/virtual-product.test.ts packages/domain/src/permission.test.ts`

Expected: FAIL because `./virtual-product` and the six permission codes do not exist.

- [ ] **Step 3: Add the shared contract**

```ts
export const VIRTUAL_BENEFIT_TYPES = ['duration', 'count', 'points', 'quota'] as const;
export const VIRTUAL_PRODUCT_STATUSES = ['draft', 'active', 'suspended', 'archived'] as const;
export const VIRTUAL_REFUND_TEMPLATES = [
  'duration_before_fulfillment',
  'consumable_unused_full_reverse',
] as const;
export const VIRTUAL_EXPIRY_MODES = ['permanent', 'fixed_duration'] as const;
export const VIRTUAL_DURATION_UNITS = ['month', 'year'] as const;
export const VIRTUAL_PAYMENT_ENVIRONMENTS = ['sandbox', 'production'] as const;
export const VIRTUAL_CHANNEL_VALIDATION_STATUSES = ['pending', 'valid', 'invalid'] as const;
export const VIRTUAL_GOODS_OPERATION_PHASES = ['upload', 'publish'] as const;
export const VIRTUAL_GOODS_OPERATION_STATES = [
  'submitted', 'processing', 'succeeded', 'failed', 'unknown',
] as const;

export type VirtualBenefitType = (typeof VIRTUAL_BENEFIT_TYPES)[number];
export type VirtualProductStatus = (typeof VIRTUAL_PRODUCT_STATUSES)[number];
export type VirtualPaymentEnvironment = (typeof VIRTUAL_PAYMENT_ENVIRONMENTS)[number];
export type VirtualGoodsOperationState = (typeof VIRTUAL_GOODS_OPERATION_STATES)[number];

export type VirtualProductListQuery = {
  page: number;
  pageSize: number;
  keyword?: string;
  productType?: VirtualBenefitType;
  status?: VirtualProductStatus;
  productionValidationStatus?: 'pending' | 'valid' | 'invalid' | 'out_of_sync';
};
```

Export it from `packages/domain/src/index.ts`:

```ts
export * from './virtual-product';
```

Add the six codes to `PERMISSION_CODE_VALUES` and entries to `PermissionCodeConfig` in `packages/domain/src/permission.ts`, using scopes `platform_virtual_product`, `platform_virtual_order`, and `virtual_product` with Chinese descriptions matching the design.

- [ ] **Step 4: Run the focused domain tests**

Run: `bun test packages/domain/src/virtual-product.test.ts packages/domain/src/permission.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/virtual-product.ts packages/domain/src/virtual-product.test.ts packages/domain/src/index.ts packages/domain/src/permission.ts packages/domain/src/permission.test.ts
git commit -m "feat(domain): define generic virtual product contracts"
```

### Task 2: Create the catalog, channel mapping, and operation facts

**Files:**
- Create: `supabase/migrations/20260803100000_create_platform_virtual_product_catalog.sql`
- Test: `apps/api/src/services/platform-virtual-product-catalog-migration.test.ts`

- [ ] **Step 1: Write the failing migration contract test**

```ts
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const migration = new URL(
  '../../../../supabase/migrations/20260803100000_create_platform_virtual_product_catalog.sql',
  import.meta.url,
);
const sql = () => readFileSync(migration, 'utf8').replace(/--.*$/gm, ' ').replace(/\s+/g, ' ').toLowerCase();

describe('platform virtual product catalog migration', () => {
  test('creates protected facts and service-role-only commands', () => {
    const value = sql();
    for (const table of [
      'platform_virtual_products',
      'platform_virtual_product_grant_rules',
      'platform_virtual_payment_channels',
      'platform_virtual_product_mappings',
      'platform_virtual_goods_operations',
    ]) expect(value).toContain(`create table public.${table}`);
    expect(value).toContain("provider_product_id ~ '^[a-za-z0-9_-]{1,20}$'");
    expect(value).toContain('unique (product_id, channel_id)');
    expect(value).toContain('unique (channel_id, provider_product_id)');
    expect(value).toContain('create unique index platform_virtual_goods_operations_one_running_per_channel_idx');
    expect(value).toContain("where state in ('submitted', 'processing')");
    expect(value).toContain('enable row level security');
    expect(value).toContain('to service_role');
    expect(value).not.toContain('to authenticated');
  });

  test('backfills annual branding identity without changing its ids', () => {
    const value = sql();
    expect(value).toContain('insert into public.platform_virtual_products');
    expect(value).toContain('from public.platform_addon_products');
    expect(value).toContain('insert into public.platform_virtual_product_mappings');
    expect(value).toContain('from public.platform_virtual_payment_products');
    expect(value).toContain('provider_product_id');
    expect(value).toContain('on conflict');
  });
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `bun test apps/api/src/services/platform-virtual-product-catalog-migration.test.ts`

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Add the migration with explicit constraints and indexes**

The migration must create these exact database boundaries:

```sql
CREATE TABLE public.platform_virtual_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('duration','count','points','quota')),
  amount_fen integer NOT NULL CHECK (amount_fen > 0),
  currency text NOT NULL DEFAULT 'CNY' CHECK (currency = 'CNY'),
  image_file_id uuid NULL REFERENCES public.platform_file_objects(id) ON DELETE RESTRICT,
  purchase_notes text NOT NULL DEFAULT '',
  refund_template text NOT NULL CHECK (refund_template IN ('duration_before_fulfillment','consumable_unused_full_reverse')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','suspended','archived')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_employee_id uuid NOT NULL REFERENCES public.employees(id),
  updated_by_employee_id uuid NOT NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_virtual_products_code_check CHECK (code ~ '^[a-z][a-z0-9_.-]{2,99}$'),
  CONSTRAINT platform_virtual_products_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  CONSTRAINT platform_virtual_products_notes_check CHECK (char_length(purchase_notes) <= 500)
);

CREATE TABLE public.platform_virtual_product_grant_rules (
  product_id uuid PRIMARY KEY REFERENCES public.platform_virtual_products(id) ON DELETE RESTRICT,
  entitlement_code text NOT NULL,
  benefit_type text NOT NULL CHECK (benefit_type IN ('duration','count','points','quota')),
  grant_amount bigint NULL CHECK (grant_amount IS NULL OR grant_amount > 0),
  duration_value integer NULL CHECK (duration_value IS NULL OR duration_value > 0),
  duration_unit text NULL CHECK (duration_unit IS NULL OR duration_unit IN ('month','year')),
  expiry_mode text NOT NULL CHECK (expiry_mode IN ('permanent','fixed_duration')),
  expiry_value integer NULL CHECK (expiry_value IS NULL OR expiry_value > 0),
  expiry_unit text NULL CHECK (expiry_unit IS NULL OR expiry_unit IN ('month','year')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_virtual_product_grant_rules_shape_check CHECK (
    (benefit_type = 'duration' AND grant_amount IS NULL AND duration_value IS NOT NULL AND duration_unit IS NOT NULL AND expiry_mode = 'fixed_duration' AND expiry_value IS NULL AND expiry_unit IS NULL)
    OR
    (benefit_type IN ('count','points','quota') AND grant_amount IS NOT NULL AND duration_value IS NULL AND duration_unit IS NULL AND ((expiry_mode = 'permanent' AND expiry_value IS NULL AND expiry_unit IS NULL) OR (expiry_mode = 'fixed_duration' AND expiry_value IS NOT NULL AND expiry_unit IS NOT NULL)))
  )
);

CREATE TABLE public.platform_virtual_payment_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider = 'wechat_virtual'),
  environment text NOT NULL CHECK (environment IN ('sandbox','production')),
  app_id text NOT NULL,
  virtual_merchant_id text NOT NULL,
  offer_id text NOT NULL,
  encrypted_secret_ref text NOT NULL,
  secret_revision integer NOT NULL CHECK (secret_revision > 0),
  message_auth_status text NOT NULL DEFAULT 'unchecked' CHECK (message_auth_status IN ('unchecked','valid','invalid')),
  status text NOT NULL DEFAULT 'disabled' CHECK (status IN ('active','disabled')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_employee_id uuid NOT NULL REFERENCES public.employees(id),
  updated_by_employee_id uuid NOT NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, environment)
);

CREATE TABLE public.platform_virtual_product_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.platform_virtual_products(id) ON DELETE RESTRICT,
  channel_id uuid NOT NULL REFERENCES public.platform_virtual_payment_channels(id) ON DELETE RESTRICT,
  provider_product_id text NOT NULL,
  upload_state text NOT NULL DEFAULT 'not_started' CHECK (upload_state IN ('not_started','processing','succeeded','failed','unknown','out_of_sync')),
  publish_state text NOT NULL DEFAULT 'not_started' CHECK (publish_state IN ('not_started','processing','succeeded','failed','unknown','out_of_sync')),
  validation_status text NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending','valid','invalid')),
  synced_product_version integer NULL CHECK (synced_product_version IS NULL OR synced_product_version > 0),
  remote_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(remote_snapshot) = 'object'),
  last_operation_id uuid NULL,
  last_request_id text NULL,
  last_error_code text NULL,
  last_error_summary text NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, channel_id),
  UNIQUE (channel_id, provider_product_id),
  CONSTRAINT platform_virtual_product_mappings_provider_product_id_check CHECK (provider_product_id ~ '^[A-Za-z0-9_-]{1,20}$')
);

CREATE TABLE public.platform_virtual_goods_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.platform_virtual_payment_channels(id) ON DELETE RESTRICT,
  mapping_id uuid NOT NULL REFERENCES public.platform_virtual_product_mappings(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.platform_virtual_products(id) ON DELETE RESTRICT,
  product_version integer NOT NULL CHECK (product_version > 0),
  phase text NOT NULL CHECK (phase IN ('upload','publish')),
  state text NOT NULL CHECK (state IN ('submitted','processing','succeeded','failed','unknown')),
  request_snapshot_hash text NOT NULL CHECK (request_snapshot_hash ~ '^[0-9a-f]{64}$'),
  request_id text NULL,
  normalized_result jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(normalized_result) = 'object'),
  failure_code text NULL,
  failure_summary text NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_queried_at timestamptz NULL,
  finished_at timestamptz NULL
);
ALTER TABLE public.platform_virtual_product_mappings
  ADD CONSTRAINT platform_virtual_product_mappings_last_operation_fkey
  FOREIGN KEY (last_operation_id) REFERENCES public.platform_virtual_goods_operations(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX platform_virtual_goods_operations_one_running_per_channel_idx
  ON public.platform_virtual_goods_operations(channel_id)
  WHERE state IN ('submitted', 'processing');
CREATE INDEX platform_virtual_products_list_idx ON public.platform_virtual_products(status, updated_at DESC, id DESC);
CREATE INDEX platform_virtual_product_mappings_product_idx ON public.platform_virtual_product_mappings(product_id, channel_id);
CREATE INDEX platform_virtual_goods_operations_mapping_started_idx ON public.platform_virtual_goods_operations(mapping_id, started_at DESC);
```

In the same migration:

- enable RLS on all five tables;
- revoke all access from `public`, `anon`, and `authenticated`;
- grant only required `SELECT` or RPC execution to `service_role`;
- create `platform_create_virtual_product`, `platform_update_virtual_product`, `platform_transition_virtual_product`, `platform_begin_virtual_goods_operation`, and `platform_finish_virtual_goods_operation` as `SECURITY DEFINER SET search_path = public, pg_temp` functions;
- generate `vp_ || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)` inside create RPC and reuse it for both environment mappings;
- acquire `pg_advisory_xact_lock(hashtextextended('platform_virtual_goods:' || channel_id::text, 20260803))` before inspecting or creating a running operation;
- reject identity edits with `VIRTUAL_PRODUCT_CHANNEL_ID_IMMUTABLE` and optimistic conflicts with `VIRTUAL_PRODUCT_VERSION_CONFLICT`;
- backfill the annual brand product and its mappings with original UUID, code, price, version, and `provider_product_id`;
- insert and assign the six permissions from Task 1 to platform and tenant `system_admin` roles exactly as specified in the design.

- [ ] **Step 4: Run migration contract tests**

Run: `bun test apps/api/src/services/platform-virtual-product-catalog-migration.test.ts`

Expected: PASS.

- [ ] **Step 5: Validate the migration locally**

Run: `supabase db reset`

Expected: all migrations apply successfully and the annual branding product has exactly two environment mappings sharing its preserved channel product ID.

Run: `supabase migration list`

Expected: Local and Remote columns are aligned through `20260803100000` after the approved target-environment apply; before remote apply, only Local may contain this version and that difference must be recorded in the checkpoint.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260803100000_create_platform_virtual_product_catalog.sql apps/api/src/services/platform-virtual-product-catalog-migration.test.ts
git commit -m "feat(payments): create virtual product catalog facts"
```

### Task 3: Add schemas and paginated repository boundaries

**Files:**
- Create: `apps/api/src/schema/platform-virtual-products.ts`
- Create: `apps/api/src/schema/platform-virtual-products.test.ts`
- Create: `apps/api/src/repositories/platform-virtual-products.ts`
- Test: `apps/api/src/repositories/platform-virtual-products.test.ts`

- [ ] **Step 1: Write failing schema and repository tests**

```ts
import { describe, expect, test } from 'bun:test';
import { PlatformVirtualProductListQuerySchema, CreatePlatformVirtualProductSchema } from './platform-virtual-products';

describe('platform virtual product schemas', () => {
  test('defaults pagination and rejects client-owned identity', () => {
    expect(PlatformVirtualProductListQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 20 });
    expect(() => PlatformVirtualProductListQuerySchema.parse({ pageSize: 101 })).toThrow();
    expect(() => CreatePlatformVirtualProductSchema.parse({
      code: 'forged', provider_product_id: 'forged', name: '次数包', product_type: 'count',
      amount_fen: 100, image_file_id: crypto.randomUUID(), purchase_notes: '',
      grant_rule: { entitlement_code: 'ai.calls', grant_amount: 10, expiry_mode: 'permanent' },
    })).toThrow();
  });
});
```

Repository mock assertion:

```ts
expect(query.select).toHaveBeenCalledWith(LIST_COLUMNS, { count: 'exact' });
expect(query.range).toHaveBeenCalledWith(20, 39);
expect(query.order).toHaveBeenCalledWith('updated_at', { ascending: false });
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/schema/platform-virtual-products.test.ts apps/api/src/repositories/platform-virtual-products.test.ts`

Expected: FAIL because schemas and repository do not exist.

- [ ] **Step 3: Implement strict schemas**

```ts
const GrantRuleSchema = z.discriminatedUnion('benefit_type', [
  z.object({ benefit_type: z.literal('duration'), entitlement_code: z.string().trim().min(1).max(100), duration_value: z.number().int().positive(), duration_unit: z.enum(['month','year']), expiry_mode: z.literal('fixed_duration') }).strict(),
  z.object({ benefit_type: z.enum(['count','points','quota']), entitlement_code: z.string().trim().min(1).max(100), grant_amount: z.number().int().positive(), expiry_mode: z.enum(['permanent','fixed_duration']), expiry_value: z.number().int().positive().optional(), expiry_unit: z.enum(['month','year']).optional() }).strict().superRefine((value, context) => {
    const fixed = value.expiry_mode === 'fixed_duration';
    if (fixed !== Boolean(value.expiry_value && value.expiry_unit)) context.addIssue({ code: 'custom', message: '固定有效期必须同时提供数值和单位' });
  }),
]);

export const PlatformVirtualProductListQuerySchema = PaginationQuerySchema.extend({
  keyword: z.string().trim().min(1).max(120).optional(),
  product_type: z.enum(VIRTUAL_BENEFIT_TYPES).optional(),
  status: z.enum(VIRTUAL_PRODUCT_STATUSES).optional(),
  production_validation_status: z.enum(['pending','valid','invalid','out_of_sync']).optional(),
}).strict();

export const CreatePlatformVirtualProductSchema = z.object({
  name: z.string().trim().min(1).max(100),
  product_type: z.enum(VIRTUAL_BENEFIT_TYPES),
  amount_fen: z.number().int().positive().max(2_147_483_647),
  image_file_id: z.uuid(),
  purchase_notes: z.string().trim().max(500),
  refund_template: z.enum(VIRTUAL_REFUND_TEMPLATES),
  grant_rule: GrantRuleSchema,
}).strict();

export const UpdatePlatformVirtualProductSchema = CreatePlatformVirtualProductSchema.partial()
  .extend({ version: z.number().int().positive() }).strict();
export const PlatformVirtualProductParamsSchema = z.object({ id: z.uuid() }).strict();
export const PlatformVirtualProductChannelParamsSchema = z.object({ id: z.uuid(), environment: z.enum(VIRTUAL_PAYMENT_ENVIRONMENTS) }).strict();
export const PlatformVirtualProductVersionCommandSchema = z.object({ version: z.number().int().positive() }).strict();
```

Implement repository methods with the exact list shape:

```ts
const LIST_COLUMNS = 'id,code,name,product_type,amount_fen,currency,status,version,updated_at';

async list(query: PlatformVirtualProductListQuery) {
  const from = (query.page - 1) * query.pageSize;
  let request = this.client.from('platform_virtual_products')
    .select(LIST_COLUMNS, { count: 'exact' })
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + query.pageSize - 1);
  if (query.keyword) request = request.or(`name.ilike.%${escapePostgrestSearch(query.keyword)}%,code.ilike.%${escapePostgrestSearch(query.keyword)}%`);
  if (query.productType) request = request.eq('product_type', query.productType);
  if (query.status) request = request.eq('status', query.status);
  const { data, error, count } = await request;
  if (error) throw Errors.dbError('查询虚拟商品失败', error);
  return { rows: data ?? [], total: count ?? 0 };
}
```

Use single RPC calls for create/update/transitions, and one detail query selecting explicit product/rule/mapping fields. Do not query each environment inside a loop.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `bun test apps/api/src/schema/platform-virtual-products.test.ts apps/api/src/repositories/platform-virtual-products.test.ts`

Expected: PASS.

Run: `bun run api:typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/schema/platform-virtual-products.ts apps/api/src/schema/platform-virtual-products.test.ts apps/api/src/repositories/platform-virtual-products.ts apps/api/src/repositories/platform-virtual-products.test.ts
git commit -m "feat(api): add virtual product catalog boundaries"
```

### Task 4: Add platform CRUD and lifecycle routes

**Files:**
- Create: `apps/api/src/services/platform-virtual-products.ts`
- Test: `apps/api/src/services/platform-virtual-products.test.ts`
- Create: `apps/api/src/controllers/platform-virtual-products/index.ts`
- Test: `apps/api/src/controllers/platform-virtual-products/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write failing service and route tests**

```ts
expect(accessPolicy.assertPermission).toHaveBeenCalledWith(auth, 'platform.virtual_product.manage');
expect(repository.list).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
await expect(service.activate(auth, PRODUCT_ID, { version: 2 })).rejects.toMatchObject({ code: 'VIRTUAL_PRODUCT_NOT_READY' });
```

Route registration assertions:

```ts
for (const route of [
  'GET /platform/virtual-products',
  'POST /platform/virtual-products',
  'GET /platform/virtual-products/:id',
  'PATCH /platform/virtual-products/:id',
  'POST /platform/virtual-products/:id/activate',
  'POST /platform/virtual-products/:id/suspend',
  'POST /platform/virtual-products/:id/archive',
]) expect(routes.has(route)).toBeTrue();
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/services/platform-virtual-products.test.ts apps/api/src/controllers/platform-virtual-products/routes.test.ts`

Expected: FAIL because service and controller do not exist.

- [ ] **Step 3: Implement the service state machine**

```ts
const READ = 'platform.virtual_product.read';
const MANAGE = 'platform.virtual_product.manage';

async activate(auth: AuthContext, id: string, input: { version: number }) {
  this.assertPlatform(auth, MANAGE);
  const product = await this.repository.getDetail(id);
  if (!product) throw Errors.business(404, '虚拟商品不存在', 'VIRTUAL_PRODUCT_NOT_FOUND');
  const production = product.mappings.find((item) => item.environment === 'production');
  if (!production || production.validation_status !== 'valid' || production.synced_product_version !== product.version) {
    throw Errors.business(409, '生产微信商品尚未完成同步校验', 'VIRTUAL_PRODUCT_NOT_READY');
  }
  return this.repository.transition({ id, expectedVersion: input.version, targetStatus: 'active', actorEmployeeId: requireActor(auth) });
}
```

Create/update must validate grant-rule type equality, verify `image_file_id` belongs to a completed platform upload, never accept code/channel ID, and audit successful mutations. Suspend allows only `active -> suspended`; archive allows `draft|active|suspended -> archived`; archived rejects all mutations with `VIRTUAL_PRODUCT_ALREADY_ARCHIVED`.

- [ ] **Step 4: Register controller methods using parse/service/success only**

```ts
@Get('/platform/virtual-products')
async list(request: FastifyRequest) {
  const auth = await this.getRequiredPlatformAdminContext(request);
  return ResponseHandler.success(await platformVirtualProductService.list(auth, parse(PlatformVirtualProductListQuerySchema, request.query)));
}

@Post('/platform/virtual-products')
async create(request: FastifyRequest) {
  const auth = await this.getRequiredPlatformAdminContext(request);
  return ResponseHandler.success(await platformVirtualProductService.create(auth, parse(CreatePlatformVirtualProductSchema, request.body)));
}
```

Implement the remaining five handlers with the schemas from Task 3. Import and register `PlatformVirtualProductsController.registerExtraRoutes(app)` in `apps/api/src/routes/index.ts`.

- [ ] **Step 5: Run tests and API checks**

Run: `bun test apps/api/src/services/platform-virtual-products.test.ts apps/api/src/controllers/platform-virtual-products/routes.test.ts`

Expected: PASS.

Run: `bun run api:check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/platform-virtual-products.ts apps/api/src/services/platform-virtual-products.test.ts apps/api/src/controllers/platform-virtual-products apps/api/src/routes/index.ts
git commit -m "feat(api): expose platform virtual product CRUD"
```

### Task 5: Serialize multi-product WeChat operations per environment

**Files:**
- Create: `apps/api/src/repositories/platform-virtual-goods-operations.ts`
- Test: `apps/api/src/repositories/platform-virtual-goods-operations.test.ts`
- Create: `apps/api/src/services/platform-virtual-product-channels.ts`
- Test: `apps/api/src/services/platform-virtual-product-channels.test.ts`
- Modify: `apps/api/src/controllers/platform-virtual-products/index.ts`
- Test: `apps/api/src/controllers/platform-virtual-products/routes.test.ts`

- [ ] **Step 1: Write failing lifecycle tests**

```ts
test('does not let the newest remote task overwrite another product', async () => {
  repository.findRunningByChannel.mockResolvedValue(operationForProductB);
  await expect(service.refresh(auth, PRODUCT_A, 'production')).rejects.toMatchObject({
    code: 'VIRTUAL_PRODUCT_CHANNEL_TASK_PENDING',
  });
  expect(repository.finish).not.toHaveBeenCalled();
});

test('refresh is read-only when local evidence is terminal', async () => {
  repository.getSnapshot.mockResolvedValue(terminalProductA);
  expect(await service.refresh(auth, PRODUCT_A, 'production')).toEqual(terminalProductA);
  expect(gateway.queryUploadGoods).not.toHaveBeenCalled();
  expect(gateway.queryPublishGoods).not.toHaveBeenCalled();
});
```

Also assert out-of-band WeChat work maps to `unknown`, production writes require `platform.virtual_product.publish`, and upload/publish use the database product snapshot rather than request fields.

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/repositories/platform-virtual-goods-operations.test.ts apps/api/src/services/platform-virtual-product-channels.test.ts`

Expected: FAIL because the generic operation repository/service do not exist.

- [ ] **Step 3: Implement operation claims and terminal evidence**

```ts
async startUpload(auth: AuthContext, productId: string, environment: VirtualPaymentEnvironment, input: { version: number }) {
  this.assertPublish(auth);
  const prepared = await this.prepare(productId, environment, input.version, 'upload');
  const operation = await this.operations.begin({
    channelId: prepared.channel.id,
    mappingId: prepared.mapping.id,
    productId,
    productVersion: prepared.product.version,
    phase: 'upload',
    requestSnapshotHash: prepared.snapshotHash,
  });
  try {
    const result = await this.gateway.startUploadGoods({
      accessToken: prepared.accessToken,
      appId: prepared.channel.app_id,
      offerId: prepared.channel.offer_id,
      providerProductId: prepared.mapping.provider_product_id,
      name: prepared.product.name,
      amountFen: prepared.product.amount_fen,
      itemUrl: prepared.imageUrl,
    });
    return await this.operations.markProcessing(operation.id, result.requestId);
  } catch (error) {
    await this.operations.finishFailure(operation.id, normalizeWechatFailure(error));
    throw mapWechatGoodsError(error);
  }
}
```

`refresh` may query the existing verified gateway methods `queryUploadGoods` and `queryPublishGoods` only when the selected product owns the channel's single non-terminal operation. Persist terminal normalized evidence immediately. If the returned remote item ID differs or an unowned running task is observed, call `finishUnknown` and block further writes.

- [ ] **Step 4: Add the four generic channel routes**

```ts
@Get('/platform/virtual-products/:id/channel-mappings/:environment')
async getChannelMapping(request: FastifyRequest) {
  const auth = await this.getRequiredPlatformAdminContext(request);
  const { id, environment } = parse(PlatformVirtualProductChannelParamsSchema, request.params);
  parse(PlatformVirtualProductEmptySchema, request.query);
  return ResponseHandler.success(await platformVirtualProductChannelService.refresh(auth, id, environment));
}
@Post('/platform/virtual-products/:id/channel-mappings/:environment/goods/upload')
async uploadGoods(request: FastifyRequest) {
  const auth = await this.getRequiredPlatformAdminContext(request);
  const { id, environment } = parse(PlatformVirtualProductChannelParamsSchema, request.params);
  parse(PlatformVirtualProductEmptySchema, request.query);
  const input = parse(PlatformVirtualProductVersionCommandSchema, request.body);
  return ResponseHandler.success(await platformVirtualProductChannelService.startUpload(auth, id, environment, input));
}
@Post('/platform/virtual-products/:id/channel-mappings/:environment/goods/publish')
async publishGoods(request: FastifyRequest) {
  const auth = await this.getRequiredPlatformAdminContext(request);
  const { id, environment } = parse(PlatformVirtualProductChannelParamsSchema, request.params);
  parse(PlatformVirtualProductEmptySchema, request.query);
  const input = parse(PlatformVirtualProductVersionCommandSchema, request.body);
  return ResponseHandler.success(await platformVirtualProductChannelService.startPublish(auth, id, environment, input));
}
@Post('/platform/virtual-products/:id/channel-mappings/:environment/validate')
async validateMapping(request: FastifyRequest) {
  const auth = await this.getRequiredPlatformAdminContext(request);
  const { id, environment } = parse(PlatformVirtualProductChannelParamsSchema, request.params);
  parse(PlatformVirtualProductEmptySchema, request.query);
  const input = parse(PlatformVirtualProductVersionCommandSchema, request.body);
  return ResponseHandler.success(await platformVirtualProductChannelService.validate(auth, id, environment, input));
}
```

- [ ] **Step 5: Run lifecycle and route tests**

Run: `bun test apps/api/src/repositories/platform-virtual-goods-operations.test.ts apps/api/src/services/platform-virtual-product-channels.test.ts apps/api/src/controllers/platform-virtual-products/routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/repositories/platform-virtual-goods-operations.ts apps/api/src/repositories/platform-virtual-goods-operations.test.ts apps/api/src/services/platform-virtual-product-channels.ts apps/api/src/services/platform-virtual-product-channels.test.ts apps/api/src/controllers/platform-virtual-products
git commit -m "feat(payments): serialize virtual goods channel operations"
```

### Task 6: Preserve annual-branding compatibility and verify the phase

**Files:**
- Modify: `apps/api/src/services/branding-virtual-products.ts`
- Modify: `apps/api/src/services/platform-branding-virtual-payment-settings.ts`
- Modify: `apps/api/src/controllers/platform-payment-configs/index.ts`
- Test: `apps/api/src/services/branding-virtual-products.test.ts`
- Test: `apps/api/src/services/platform-branding-virtual-payment-settings.test.ts`
- Test: `apps/api/src/controllers/platform-payment-configs/routes.test.ts`

- [ ] **Step 1: Add failing compatibility tests**

```ts
expect(catalogRepository.findByCode).toHaveBeenCalledWith(BRANDING_ADDON_PRODUCT_CODE);
expect(result.product.id).toBe(LEGACY_PRODUCT_ID);
expect(result.production.provider_product_id).toBe(LEGACY_PROVIDER_PRODUCT_ID);
expect(result.production.provider_product_id).not.toMatch(/^vp_/);
```

Assert old `GET /platform/payment/wechat-virtual/branding-entitlement` returns the new channel/account snapshot and its old write routes delegate to generic services without allowing channel ID edits.

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/services/branding-virtual-products.test.ts apps/api/src/services/platform-branding-virtual-payment-settings.test.ts apps/api/src/controllers/platform-payment-configs/routes.test.ts`

Expected: FAIL because compatibility still reads `platform_virtual_payment_products` directly.

- [ ] **Step 3: Add a narrow compatibility adapter**

```ts
async getTenantProduct(auth: AuthContext) {
  this.assertPurchaser(auth);
  const product = await this.catalog.findPurchasableByCode(BRANDING_ADDON_PRODUCT_CODE);
  if (!product) return unavailable('product_disabled');
  return serializeLegacyBrandingProduct(product);
}
```

Keep legacy response field names and legacy error-code mappings, but derive them from the new product/rule/channel snapshot. Old mutation endpoints must call the generic service and may only operate on the preserved annual product ID. Add `Deprecation: true` and a `Link` response header only if the existing decorator/controller response mechanism supports headers without changing every route.

- [ ] **Step 4: Run the phase verification set**

Run: `bun test packages/domain/src/virtual-product.test.ts packages/domain/src/permission.test.ts apps/api/src/schema/platform-virtual-products.test.ts apps/api/src/repositories/platform-virtual-products.test.ts apps/api/src/repositories/platform-virtual-goods-operations.test.ts apps/api/src/services/platform-virtual-product-catalog-migration.test.ts apps/api/src/services/platform-virtual-products.test.ts apps/api/src/services/platform-virtual-product-channels.test.ts apps/api/src/services/branding-virtual-products.test.ts apps/api/src/services/platform-branding-virtual-payment-settings.test.ts apps/api/src/controllers/platform-virtual-products/routes.test.ts apps/api/src/controllers/platform-payment-configs/routes.test.ts`

Expected: PASS.

Run: `bun run api:check && bun run check:file-size`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/branding-virtual-products.ts apps/api/src/services/platform-branding-virtual-payment-settings.ts apps/api/src/controllers/platform-payment-configs/index.ts apps/api/src/services/branding-virtual-products.test.ts apps/api/src/services/platform-branding-virtual-payment-settings.test.ts apps/api/src/controllers/platform-payment-configs/routes.test.ts
git commit -m "refactor(payments): adapt branding product to generic catalog"
```

## Phase checkpoint

- [ ] Confirm catalog list uses `page=1&pageSize=20`, enforces `pageSize <= 100`, selects only list fields, and performs no per-row query.
- [ ] Confirm new products receive one immutable `vp_` ID shared across sandbox and production mappings.
- [ ] Confirm the annual product preserves its existing UUID, code, price, version, and channel ID.
- [ ] Confirm one environment cannot have two non-terminal WeChat goods operations.
- [ ] Confirm no key, token, raw signed response, or OpenID appears in API snapshots or logs.
- [ ] Record `supabase migration list`, focused test output, API check output, and the forward rollback action: suspend new catalog writes, keep legacy compatibility reads, and correct data through a later migration without deleting history.
