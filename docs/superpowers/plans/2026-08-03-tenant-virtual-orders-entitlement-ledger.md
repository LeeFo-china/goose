# Tenant Virtual Orders and Entitlement Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立保存商品与发放规则快照的通用租户虚拟商品订单，以及租户共享的权益账户、批次和不可变流水。

**Architecture:** 订单固定单商品、数量 1，并冻结商品、规则和渠道事实；权益账户按 `tenant_id + entitlement_code` 提供锁行，批次保存来源与剩余量，流水只追加。创建订单和查询接口使用 Service/Repository 分层，权益写入只通过 service-role RPC，为下一阶段支付确认和自动履约提供原子边界。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL、`@gooes/domain`

---

**Prerequisite:** 先完成目录与渠道计划并确认年度商品候选事实一致。本计划只建立订单和账本事实及查询，不切换微信回调和退款。

## File structure

- Modify `packages/domain/src/virtual-product.ts`: 订单、账户、批次、流水状态和 DTO。
- Modify `packages/domain/src/virtual-product.test.ts`: 状态契约测试。
- Create `supabase/migrations/20260803110000_create_tenant_virtual_orders_and_entitlement_ledger.sql`: 通用订单与权益表、索引、RLS、创建订单和账本基础 RPC。
- Create `apps/api/src/services/tenant-virtual-entitlement-ledger-migration.test.ts`: migration 合同。
- Create `apps/api/src/schema/tenant-virtual-products.ts`: 租户商品、订单和权益查询/命令 schema。
- Create `apps/api/src/repositories/tenant-virtual-product-orders.ts`: 租户创建/读取和平台分页读取。
- Create `apps/api/src/repositories/tenant-virtual-entitlements.ts`: 账户、批次、流水分页读取和 RPC gateway。
- Create `apps/api/src/services/tenant-virtual-product-orders.ts`: 购买权限、商品状态和身份绑定。
- Create `apps/api/src/services/platform-virtual-product-orders.ts`: 平台订单审计。
- Create `apps/api/src/services/tenant-virtual-entitlement-ledger.ts`: 租户共享权益读模型和内部写端口。
- Create `apps/api/src/controllers/tenant-virtual-products/index.ts`: 租户商品、订单和权益 API。
- Modify `apps/api/src/controllers/platform-virtual-products/index.ts`: 平台订单和流水 API。
- Modify `apps/api/src/routes/index.ts`: 注册租户 Controller。

### Task 1: Define order and ledger contracts

**Files:**
- Modify: `packages/domain/src/virtual-product.ts`
- Modify: `packages/domain/src/virtual-product.test.ts`

- [ ] **Step 1: Add failing state-contract expectations**

```ts
expect(VIRTUAL_ORDER_PAYMENT_STATUSES).toEqual(['pending','paying','paid','closed','failed']);
expect(VIRTUAL_ORDER_FULFILLMENT_STATUSES).toEqual(['pending','processing','fulfilled','retry_pending','dead_letter']);
expect(VIRTUAL_ENTITLEMENT_LOT_STATES).toEqual(['active','refund_pending','exhausted','expired','reversed']);
expect(VIRTUAL_ENTITLEMENT_LEDGER_OPERATIONS).toEqual(['grant','consume','expire','refund_reverse','system_correction']);
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test packages/domain/src/virtual-product.test.ts`

Expected: FAIL because the four constants are missing.

- [ ] **Step 3: Add immutable shared constants and types**

```ts
export const VIRTUAL_ORDER_PAYMENT_STATUSES = ['pending','paying','paid','closed','failed'] as const;
export const VIRTUAL_ORDER_FULFILLMENT_STATUSES = ['pending','processing','fulfilled','retry_pending','dead_letter'] as const;
export const VIRTUAL_ORDER_REFUND_STATUSES = ['none','pending','submitted','succeeded','failed','exception'] as const;
export const VIRTUAL_ENTITLEMENT_LOT_STATES = ['active','refund_pending','exhausted','expired','reversed'] as const;
export const VIRTUAL_ENTITLEMENT_LEDGER_OPERATIONS = ['grant','consume','expire','refund_reverse','system_correction'] as const;

export type VirtualEntitlementBalance = {
  entitlement_code: string;
  benefit_type: VirtualBenefitType;
  available_amount: number | null;
  current_expires_at: string | null;
};
```

- [ ] **Step 4: Run and commit**

Run: `bun test packages/domain/src/virtual-product.test.ts`

Expected: PASS.

```bash
git add packages/domain/src/virtual-product.ts packages/domain/src/virtual-product.test.ts
git commit -m "feat(domain): define virtual entitlement ledger states"
```

### Task 2: Create generic order and append-only entitlement facts

**Files:**
- Create: `supabase/migrations/20260803110000_create_tenant_virtual_orders_and_entitlement_ledger.sql`
- Test: `apps/api/src/services/tenant-virtual-entitlement-ledger-migration.test.ts`

- [ ] **Step 1: Write the failing migration contract**

```ts
for (const table of [
  'tenant_virtual_product_orders',
  'tenant_virtual_entitlement_accounts',
  'tenant_virtual_entitlement_lots',
  'tenant_virtual_entitlement_ledger',
]) expect(sql).toContain(`create table public.${table}`);
expect(sql).toContain('unique (tenant_id, entitlement_code)');
expect(sql).toContain('unique (source_order_id)');
expect(sql).toContain('unique (idempotency_key)');
expect(sql).toContain('tenant_virtual_entitlement_ledger_immutable');
expect(sql).toContain('raise exception using message = \'virtual_entitlement_ledger_immutable\'');
expect(sql).toContain('tenant_virtual_entitlement_lots_fefo_idx');
expect(sql).toContain('expires_at asc nulls last');
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/services/tenant-virtual-entitlement-ledger-migration.test.ts`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Create tables with immutable snapshots**

```sql
CREATE TABLE public.tenant_virtual_product_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  purchaser_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.platform_virtual_products(id) ON DELETE RESTRICT,
  product_code text NOT NULL,
  product_name text NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('duration','count','points','quota')),
  product_version integer NOT NULL CHECK (product_version > 0),
  amount_fen integer NOT NULL CHECK (amount_fen > 0),
  currency text NOT NULL CHECK (currency = 'CNY'),
  grant_rule_snapshot jsonb NOT NULL CHECK (jsonb_typeof(grant_rule_snapshot) = 'object'),
  refund_template text NOT NULL,
  provider text NOT NULL CHECK (provider = 'wechat_virtual'),
  environment text NOT NULL CHECK (environment IN ('sandbox','production')),
  offer_id text NOT NULL,
  provider_product_id text NOT NULL,
  payment_config_version integer NOT NULL CHECK (payment_config_version > 0),
  payer_openid_hash text NOT NULL,
  merchant_order_no text NOT NULL UNIQUE,
  provider_order_no text NULL UNIQUE,
  transaction_id text NULL UNIQUE,
  idempotency_key uuid NOT NULL,
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paying','paid','closed','failed')),
  fulfillment_status text NOT NULL DEFAULT 'pending' CHECK (fulfillment_status IN ('pending','processing','fulfilled','retry_pending','dead_letter')),
  refund_status text NOT NULL DEFAULT 'none' CHECK (refund_status IN ('none','pending','submitted','succeeded','failed','exception')),
  payment_failure_code text NULL,
  fulfillment_failure_code text NULL,
  paid_at timestamptz NULL,
  fulfilled_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE public.tenant_virtual_entitlement_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  entitlement_code text NOT NULL,
  benefit_type text NOT NULL CHECK (benefit_type IN ('duration','count','points','quota')),
  available_amount bigint NULL CHECK (available_amount IS NULL OR available_amount >= 0),
  current_expires_at timestamptz NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entitlement_code)
);

CREATE TABLE public.tenant_virtual_entitlement_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.tenant_virtual_entitlement_accounts(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  source_order_id uuid NOT NULL UNIQUE REFERENCES public.tenant_virtual_product_orders(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.platform_virtual_products(id) ON DELETE RESTRICT,
  product_snapshot jsonb NOT NULL CHECK (jsonb_typeof(product_snapshot) = 'object'),
  benefit_type text NOT NULL CHECK (benefit_type IN ('duration','count','points','quota')),
  original_amount bigint NULL CHECK (original_amount IS NULL OR original_amount > 0),
  remaining_amount bigint NULL CHECK (remaining_amount IS NULL OR remaining_amount >= 0),
  effective_at timestamptz NOT NULL,
  expires_at timestamptz NULL,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','refund_pending','exhausted','expired','reversed')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_virtual_entitlement_lots_amount_shape_check CHECK (
    (benefit_type = 'duration' AND original_amount IS NULL AND remaining_amount IS NULL AND expires_at IS NOT NULL)
    OR
    (benefit_type IN ('count','points','quota') AND original_amount IS NOT NULL AND remaining_amount IS NOT NULL AND remaining_amount <= original_amount)
  )
);

CREATE TABLE public.tenant_virtual_entitlement_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES public.tenant_virtual_entitlement_accounts(id) ON DELETE RESTRICT,
  lot_id uuid NOT NULL REFERENCES public.tenant_virtual_entitlement_lots(id) ON DELETE RESTRICT,
  operation text NOT NULL CHECK (operation IN ('grant','consume','expire','refund_reverse','system_correction')),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  delta_amount bigint NULL,
  balance_after bigint NULL CHECK (balance_after IS NULL OR balance_after >= 0),
  idempotency_key text NOT NULL UNIQUE,
  actor_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  system_source text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tenant_virtual_product_orders_tenant_created_idx ON public.tenant_virtual_product_orders(tenant_id, created_at DESC, id DESC);
CREATE INDEX tenant_virtual_product_orders_platform_status_idx ON public.tenant_virtual_product_orders(payment_status, fulfillment_status, refund_status, created_at DESC);
CREATE INDEX tenant_virtual_entitlement_lots_fefo_idx ON public.tenant_virtual_entitlement_lots(account_id, state, expires_at ASC NULLS LAST, created_at ASC, id ASC);
CREATE INDEX tenant_virtual_entitlement_ledger_account_created_idx ON public.tenant_virtual_entitlement_ledger(account_id, created_at DESC, id DESC);
CREATE INDEX tenant_virtual_entitlement_ledger_source_idx ON public.tenant_virtual_entitlement_ledger(source_type, source_id);
```

Add a `BEFORE UPDATE OR DELETE` trigger on ledger that raises `virtual_entitlement_ledger_immutable`; RLS/revokes matching the catalog plan; and service-role-only functions `tenant_create_virtual_product_order`, `tenant_get_virtual_entitlement_summary`, and `platform_list_virtual_entitlement_ledger`. The create RPC must lock/read an active product, production-valid mapping, channel, and grant rule in one transaction; save all snapshots; enforce quantity 1; derive tenant/employee/OpenID hash from trusted service inputs; and return an existing order only when the same tenant/idempotency key has identical product and payer identity.

- [ ] **Step 4: Run migration test and local reset**

Run: `bun test apps/api/src/services/tenant-virtual-entitlement-ledger-migration.test.ts`

Expected: PASS.

Run: `supabase db reset`

Expected: migrations apply and direct UPDATE/DELETE against a ledger fixture fails with `virtual_entitlement_ledger_immutable`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260803110000_create_tenant_virtual_orders_and_entitlement_ledger.sql apps/api/src/services/tenant-virtual-entitlement-ledger-migration.test.ts
git commit -m "feat(payments): create virtual order and entitlement facts"
```

### Task 3: Add tenant order creation and read APIs

**Files:**
- Create: `apps/api/src/schema/tenant-virtual-products.ts`
- Test: `apps/api/src/schema/tenant-virtual-products.test.ts`
- Create: `apps/api/src/repositories/tenant-virtual-product-orders.ts`
- Test: `apps/api/src/repositories/tenant-virtual-product-orders.test.ts`
- Create: `apps/api/src/services/tenant-virtual-product-orders.ts`
- Test: `apps/api/src/services/tenant-virtual-product-orders.test.ts`
- Create: `apps/api/src/controllers/tenant-virtual-products/index.ts`
- Test: `apps/api/src/controllers/tenant-virtual-products/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write failing security and pagination tests**

```ts
const body = { product_id: PRODUCT_ID, idempotency_key: crypto.randomUUID(), requested_platform: 'ios' };
await service.createOrder(auth, body, OPENID);
expect(accessPolicy.assertPermission).toHaveBeenCalledWith(auth, 'virtual_product.purchase');
expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_ID, purchaserEmployeeId: EMPLOYEE_ID, payerOpenid: OPENID }));

for (const forged of ['amount_fen','offer_id','provider_product_id','tenant_id','payer_openid','grant_rule_snapshot']) {
  expect(() => TenantVirtualProductCreateOrderSchema.parse({ ...body, [forged]: 'forged' })).toThrow();
}
expect(TenantVirtualOrderListQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 20 });
expect(() => TenantVirtualOrderListQuerySchema.parse({ pageSize: 101 })).toThrow();
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/schema/tenant-virtual-products.test.ts apps/api/src/repositories/tenant-virtual-product-orders.test.ts apps/api/src/services/tenant-virtual-product-orders.test.ts apps/api/src/controllers/tenant-virtual-products/routes.test.ts`

Expected: FAIL because the generic tenant chain does not exist.

- [ ] **Step 3: Implement strict schemas and service**

```ts
export const TenantVirtualProductCreateOrderSchema = z.object({
  product_id: z.uuid(),
  idempotency_key: z.uuidv4(),
  requested_platform: z.enum(VIRTUAL_PAYMENT_PLATFORMS).default('unknown'),
}).strict();
export const TenantVirtualProductListQuerySchema = PaginationQuerySchema.extend({
  product_type: z.enum(VIRTUAL_BENEFIT_TYPES).optional(),
}).strict();
export const TenantVirtualOrderListQuerySchema = PaginationQuerySchema.extend({
  payment_status: z.enum(VIRTUAL_ORDER_PAYMENT_STATUSES).optional(),
  fulfillment_status: z.enum(VIRTUAL_ORDER_FULFILLMENT_STATUSES).optional(),
}).strict();
export const TenantVirtualOrderParamsSchema = z.object({ id: z.uuid() }).strict();
export const TenantVirtualProductEmptySchema = z.object({}).strict();
```

The service must require tenant context, a verified WeChat login/OpenID, and `virtual_product.purchase`; the `system_admin` role remains a backward-compatible grant only through the permission dictionary, not a service bypass. Repository list queries use explicit fields and `.range()`.

- [ ] **Step 4: Register exact tenant routes**

```ts
@Get('/tenant/virtual-products')
async listProducts(request: FastifyRequest) {
  const auth = await this.getRequiredTenantContext(request);
  const query = parse(TenantVirtualProductListQuerySchema, request.query);
  return ResponseHandler.success(await tenantVirtualProductOrderService.listProducts(auth, query));
}
@Post('/tenant/virtual-product-orders')
async createOrder(request: FastifyRequest) {
  const auth = await this.getRequiredTenantContext(request);
  parse(TenantVirtualProductEmptySchema, request.query);
  const input = parse(TenantVirtualProductCreateOrderSchema, request.body);
  const payerOpenid = requireWechatPayerOpenid(request);
  return ResponseHandler.success(await tenantVirtualProductOrderService.createOrder(auth, input, payerOpenid));
}
@Post('/tenant/virtual-product-orders/:id/payment-request')
async createPaymentRequest(request: FastifyRequest) {
  const auth = await this.getRequiredTenantContext(request);
  const { id } = parse(TenantVirtualOrderParamsSchema, request.params);
  parse(TenantVirtualProductEmptySchema, request.query);
  parse(TenantVirtualProductEmptySchema, request.body);
  const payerOpenid = requireWechatPayerOpenid(request);
  return ResponseHandler.success(await tenantVirtualProductOrderService.createPaymentRequest(auth, id, payerOpenid));
}
@Get('/tenant/virtual-product-orders')
async listOrders(request: FastifyRequest) {
  const auth = await this.getRequiredTenantContext(request);
  const query = parse(TenantVirtualOrderListQuerySchema, request.query);
  return ResponseHandler.success(await tenantVirtualProductOrderService.listOrders(auth, query));
}
@Get('/tenant/virtual-product-orders/:id')
async getOrder(request: FastifyRequest) {
  const auth = await this.getRequiredTenantContext(request);
  const { id } = parse(TenantVirtualOrderParamsSchema, request.params);
  parse(TenantVirtualProductEmptySchema, request.query);
  return ResponseHandler.success(await tenantVirtualProductOrderService.getOrder(auth, id));
}
```

Move `requireWechatPayerOpenid` to a shared controller helper so branding compatibility and generic routes enforce the same identity boundary. `createPaymentRequest` must re-read the frozen order and current channel credential revision, require the same tenant and payer identity, atomically move `pending -> paying`, and return the existing verified `BrandingVirtualPaymentRequest` wire shape without allowing client-supplied price, Offer ID, product ID, or OpenID.

- [ ] **Step 5: Run focused tests and API typecheck**

Run: `bun test apps/api/src/schema/tenant-virtual-products.test.ts apps/api/src/repositories/tenant-virtual-product-orders.test.ts apps/api/src/services/tenant-virtual-product-orders.test.ts apps/api/src/controllers/tenant-virtual-products/routes.test.ts`

Expected: PASS.

Run: `bun run api:typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/schema/tenant-virtual-products.ts apps/api/src/schema/tenant-virtual-products.test.ts apps/api/src/repositories/tenant-virtual-product-orders.ts apps/api/src/repositories/tenant-virtual-product-orders.test.ts apps/api/src/services/tenant-virtual-product-orders.ts apps/api/src/services/tenant-virtual-product-orders.test.ts apps/api/src/controllers/tenant-virtual-products apps/api/src/routes/index.ts apps/api/src/controllers/branding-addon/index.ts
git commit -m "feat(api): add tenant virtual product orders"
```

### Task 4: Add platform order and tenant ledger read models

**Files:**
- Create: `apps/api/src/repositories/tenant-virtual-entitlements.ts`
- Test: `apps/api/src/repositories/tenant-virtual-entitlements.test.ts`
- Create: `apps/api/src/services/tenant-virtual-entitlement-ledger.ts`
- Test: `apps/api/src/services/tenant-virtual-entitlement-ledger.test.ts`
- Create: `apps/api/src/services/platform-virtual-product-orders.ts`
- Test: `apps/api/src/services/platform-virtual-product-orders.test.ts`
- Modify: `apps/api/src/controllers/tenant-virtual-products/index.ts`
- Modify: `apps/api/src/controllers/platform-virtual-products/index.ts`
- Test: `apps/api/src/controllers/platform-virtual-products/routes.test.ts`

- [ ] **Step 1: Write failing read-boundary tests**

```ts
expect(accountQuery.eq).toHaveBeenCalledWith('tenant_id', TENANT_ID);
expect(lotQuery.range).toHaveBeenCalledWith(0, 19);
expect(ledgerQuery.range).toHaveBeenCalledWith(0, 19);
expect(platformAccess.assertPermission).toHaveBeenCalledWith(platformAuth, 'platform.virtual_order.read');
expect(serializedOrder).not.toHaveProperty('payer_openid_hash');
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/repositories/tenant-virtual-entitlements.test.ts apps/api/src/services/tenant-virtual-entitlement-ledger.test.ts apps/api/src/services/platform-virtual-product-orders.test.ts apps/api/src/controllers/platform-virtual-products/routes.test.ts`

Expected: FAIL because read services are missing.

- [ ] **Step 3: Implement tenant-scoped and platform-scoped reads**

Add these routes with default page 1, page size 20, maximum 100:

```text
GET /tenant/virtual-entitlements
GET /tenant/virtual-entitlements/:code/lots
GET /tenant/virtual-entitlement-ledger
GET /platform/virtual-product-orders
GET /platform/virtual-product-orders/:id
GET /platform/virtual-entitlement-ledger
```

Account summary reads may return all accounts only through the database RPC because the source is guaranteed to contain at most four current system entitlement codes in this phase; add a repository comment documenting the `<= 50` auxiliary-list exception. Lots, ledger, and orders always paginate. Platform filters include tenant, product, payment, fulfillment, refund, and created-time range without N+1 joins.

- [ ] **Step 4: Run all phase checks**

Run: `bun test packages/domain/src/virtual-product.test.ts apps/api/src/services/tenant-virtual-entitlement-ledger-migration.test.ts apps/api/src/schema/tenant-virtual-products.test.ts apps/api/src/repositories/tenant-virtual-product-orders.test.ts apps/api/src/repositories/tenant-virtual-entitlements.test.ts apps/api/src/services/tenant-virtual-product-orders.test.ts apps/api/src/services/tenant-virtual-entitlement-ledger.test.ts apps/api/src/services/platform-virtual-product-orders.test.ts apps/api/src/controllers/tenant-virtual-products/routes.test.ts apps/api/src/controllers/platform-virtual-products/routes.test.ts`

Expected: PASS.

Run: `bun run api:check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/repositories/tenant-virtual-entitlements.ts apps/api/src/repositories/tenant-virtual-entitlements.test.ts apps/api/src/services/tenant-virtual-entitlement-ledger.ts apps/api/src/services/tenant-virtual-entitlement-ledger.test.ts apps/api/src/services/platform-virtual-product-orders.ts apps/api/src/services/platform-virtual-product-orders.test.ts apps/api/src/controllers/tenant-virtual-products apps/api/src/controllers/platform-virtual-products
git commit -m "feat(api): expose virtual order and entitlement reads"
```

## Phase checkpoint

- [ ] Confirm two employees in one tenant read the same account balance while another tenant reads none of it.
- [ ] Confirm order snapshots do not change after editing product price, name, or grant quantity.
- [ ] Confirm repeated idempotency key with identical identity returns one order and conflicting input returns `VIRTUAL_ORDER_IDEMPOTENCY_CONFLICT`.
- [ ] Confirm OpenID is hashed at rest for order lookup and never returned by list/detail APIs.
- [ ] Confirm ledger cannot be updated or deleted and all list endpoints paginate within 100 rows.
- [ ] Run `EXPLAIN ANALYZE` on order status and FEFO indexes using representative fixtures and attach the plans to the phase evidence.
