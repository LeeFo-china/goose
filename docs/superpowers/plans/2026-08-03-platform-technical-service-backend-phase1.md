# 平台年度技术服务后端一期 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立与旧积分、虚拟商品和项目收款隔离的平台年度技术服务商品、租户订单、普通微信支付、回调确认、自动建实施工单和退款申请基础闭环，并发布可供 Orange 接入的 dev 契约。

**Architecture:** 新领域使用独立 migration、表、repository、service 和 controller，复用平台普通微信支付配置、APIv3 gateway、统一回调验签及支付参数生成。支付回调通过专用数据库 RPC 原子确认订单并幂等创建实施工单；旧积分充值、品牌虚拟商品和项目支付保持原行为。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL migration/RPC、`@gooes/domain`、微信支付 APIv3

---

## 实施范围

本计划只实现第一期后端基础：

- 1/2/3 年平台服务商品及平台端可配置价格/折扣的管理 API；
- 租户服务订单创建、列表、详情、继续支付；
- 普通微信小程序支付预下单；
- 微信支付回调验签、订单绑定、金额校验和原子确认；
- 支付成功后幂等创建一张实施工单；
- 租户提交退款申请；
- 平台普通支付关键配置变更时纳入待支付服务订单保护；
- dev migration、类型生成、smoke 和 Orange 后端交接样例。

以下内容不在本计划中：

- Admin 服务商品/订单/工单页面；
- 配置、部署、培训、附件和客户验收状态机；
- 服务合同期生成；
- 微信发货信息管理上报；
- Orange 代码修改；
- 关闭或删除旧积分充值数据。

这些内容分别进入后续第二至第五期计划，避免支付基础与履约 UI 同时变更。

## 目标文件结构

### Domain

- Create: `packages/domain/src/platform-service.ts` — 状态和商品/订单结构共享常量/类型，不包含价格常量。
- Create: `packages/domain/src/platform-service.test.ts` — 状态和结构契约测试。
- Modify: `packages/domain/src/index.ts` — 导出平台服务契约。
- Modify: `packages/domain/src/permission.ts` — 新增租户和平台权限码。
- Modify: `packages/domain/src/permission.test.ts` — 权限映射测试。

### Database

- Create: `supabase/migrations/20260803110000_create_platform_service_sales_foundation.sql` — 表、商品版本、索引、RLS、权限、默认初始化数据及原子 RPC。
- Create: `apps/api/src/services/platform-service-sales-migration-contract.test.ts` — migration 静态契约和安全边界测试。
- Modify after dev migration: `apps/api/src/types/database.ts` — 由 Supabase CLI 重新生成，禁止手工改写。

### API contracts and routing

- Create: `apps/api/src/schema/billing-service-orders.ts` — 列表、创建、继续支付和退款申请 Zod schema。
- Create: `apps/api/src/schema/billing-service-orders.test.ts` — 分页、严格字段、条款和幂等校验。
- Create: `apps/api/src/controllers/billing-service-orders/index.ts` — 租户 HTTP controller。
- Create: `apps/api/src/controllers/billing-service-orders/routes.test.ts` — 路由注册契约。
- Create: `apps/api/src/schema/platform-service-products.ts` — 平台商品草稿、编辑、发布 schema。
- Create: `apps/api/src/schema/platform-service-products.test.ts` — 价格、版本和并发校验。
- Create: `apps/api/src/controllers/platform-service-products/index.ts` — 平台商品管理 HTTP controller。
- Create: `apps/api/src/controllers/platform-service-products/routes.test.ts` — 平台商品管理路由契约。
- Modify: `apps/api/src/routes/index.ts` — 注册新 controller。
- Modify: `apps/api/src/errors/error-codes.ts` — 新增稳定业务错误码。
- Modify: `apps/api/src/errors/error-codes.test.ts` — 错误码导出测试。

### Repository and services

- Create: `apps/api/src/repositories/platform-service-orders.ts` — 商品、订单、工单、通知和退款申请数据访问。
- Create: `apps/api/src/repositories/platform-service-orders.test.ts` — 分页字段、租户过滤、RPC 参数和错误映射。
- Create: `apps/api/src/services/platform-service-order-views.ts` — 服务端状态、动作和响应序列化。
- Create: `apps/api/src/services/platform-service-order-views.test.ts` — 金额、状态和动作视图测试。
- Create: `apps/api/src/services/tenant-platform-service-orders.ts` — 权限、商品、下单、预支付、查询和退款申请编排。
- Create: `apps/api/src/services/tenant-platform-service-orders.test.ts` — 业务行为测试。
- Create: `apps/api/src/services/platform-service-products.ts` — 商品草稿、版本发布、价格变更和归档编排。
- Create: `apps/api/src/services/platform-service-products.test.ts` — 新旧订单价格快照和乐观锁测试。
- Create: `apps/api/src/services/platform-service-order-payment-confirmation.ts` — 支付确认 RPC 适配。
- Create: `apps/api/src/services/platform-service-order-payment-confirmation.test.ts` — 回调幂等和工单创建测试。

### WeChat payment callback and configuration guard

- Modify: `apps/api/src/services/wechat-pay-callback-platform-payment.ts` — 增加 `platform_service_order` 匹配分支。
- Modify: `apps/api/src/services/wechat-pay-callback-context-matcher.ts` — 扩展联合类型和依赖。
- Modify: `apps/api/src/services/wechat-pay-callbacks.ts` — 分派服务订单成功回调。
- Create: `apps/api/src/services/wechat-pay-callbacks-platform-service.test.ts` — 回调绑定、金额、幂等和业务隔离测试。
- Modify: `apps/api/src/services/platform-payment-config-pending-orders.ts` — 从“仅积分待支付”升级为“所有平台普通支付待支付订单”聚合保护。
- Modify: `apps/api/src/services/platform-payment-config-pending-orders-contract.test.ts` — 服务订单保护测试。
- Modify: `apps/api/src/services/platform-payment-configs.ts` — 注入聚合 pending-order port。
- Modify: `apps/api/src/services/platform-payment-configs-pending-orders.test.ts` — 配置/密钥变更阻断测试。

### Verification and handoff

- Create: `apps/api/src/scripts/platform-service-payment-smoke.ts` — dev 只读/小额 smoke，输出脱敏结果。
- Create: `docs/miniprogram/2026-08-03-platform-service-payment-handoff.md` — 发布时补充实际 API 版本和真实响应。

## Task 0: 建立隔离执行环境与基线

**Files:**

- Read: `AGENTS.md`
- Read: `docs/superpowers/specs/2026-08-03-platform-technical-service-order-and-miniprogram-handoff-design.md`
- No production file changes

- [ ] **Step 1: 使用隔离 worktree**

执行时先使用 `using-git-worktrees`。不要在当前含有虚拟商品未提交改动的 `main` 工作区直接实施。

期望：新 worktree 基于最新本地主分支，`git status --short` 为空。

- [ ] **Step 2: 记录基线提交和 migration 状态**

Run:

```bash
git rev-parse --short HEAD
supabase migration list
```

Expected：记录基线 commit；Local/Remote 不存在未解释的 migration 分叉。若远端不可访问，停止数据库应用操作，但可以继续编写和运行纯单元测试。

- [ ] **Step 3: 运行最小静态基线**

Run:

```bash
bun test packages/domain/src/permission.test.ts
bun run api:typecheck
```

Expected：两条命令 exit 0。若基线失败，记录为既有问题并先定位，不把失败归因于本功能。

## Task 1: 定义共享领域契约与权限

**Files:**

- Create: `packages/domain/src/platform-service.ts`
- Create: `packages/domain/src/platform-service.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/permission.ts`
- Modify: `packages/domain/src/permission.test.ts`

- [ ] **Step 1: 先写领域契约失败测试**

在 `packages/domain/src/platform-service.test.ts` 写入：

```ts
import { describe, expect, test } from "bun:test";
import {
  PLATFORM_SERVICE_PAYMENT_STATUS_VALUES,
  PLATFORM_SERVICE_STATUS_VALUES,
} from "./platform-service";

describe("platform service contract", () => {
  test("keeps payment and service states separate", () => {
    expect(PLATFORM_SERVICE_PAYMENT_STATUS_VALUES).toContain("paid");
    expect(PLATFORM_SERVICE_STATUS_VALUES).toContain("waiting_assignment");
    expect(PLATFORM_SERVICE_STATUS_VALUES).not.toContain("paid");
  });

  test("does not export hard-coded product prices", async () => {
    const contract = await import("./platform-service");
    expect("PLATFORM_SERVICE_PRODUCT_PRESETS" in contract).toBe(false);
  });
});
```

在 `permission.test.ts` 增加以下断言：

```ts
expect(PERMISSION_CODE_VALUES).toContain("billing.service_order.create");
expect(PERMISSION_CODE_VALUES).toContain("billing.service_order.read");
expect(PERMISSION_CODE_VALUES).toContain("billing.service_order.refund.request");
expect(PERMISSION_CODE_VALUES).toContain("platform.service_product.manage");
expect(PERMISSION_CODE_VALUES).toContain("platform.service_order.read");
expect(PERMISSION_CODE_VALUES).toContain("platform.service_work_order.manage");
```

- [ ] **Step 2: 确认测试按预期失败**

Run:

```bash
bun test packages/domain/src/platform-service.test.ts packages/domain/src/permission.test.ts
```

Expected：FAIL，原因是 `platform-service.ts` 不存在且权限码尚未定义。

- [ ] **Step 3: 实现最小共享契约**

`packages/domain/src/platform-service.ts` 必须定义并导出：

```ts
export const PLATFORM_SERVICE_PAYMENT_STATUS_VALUES = [
  "pending",
  "paid",
  "refund_reviewing",
  "refunding",
  "partially_refunded",
  "refunded",
  "closed",
] as const;

export const PLATFORM_SERVICE_STATUS_VALUES = [
  "waiting_payment",
  "waiting_assignment",
  "configuring",
  "deploying",
  "training",
  "awaiting_acceptance",
  "rectifying",
  "accepted",
  "active",
  "canceled",
] as const;

export type PlatformServicePaymentStatus =
  (typeof PLATFORM_SERVICE_PAYMENT_STATUS_VALUES)[number];
export type PlatformServiceStatus =
  (typeof PLATFORM_SERVICE_STATUS_VALUES)[number];
```

在 `permission.ts` 增加六个权限及中文标签，租户权限 module 使用 `billing`，平台权限 module 使用 `platform_service`；在 `index.ts` 导出 `./platform-service`。

金额、折扣和初始化商品不得出现在 `packages/domain` 或 API TypeScript 常量中；它们只能来自数据库当前已发布商品版本和订单快照。

- [ ] **Step 4: 运行测试与 domain 构建**

Run:

```bash
bun test packages/domain/src/platform-service.test.ts packages/domain/src/permission.test.ts
pnpm --dir packages/domain build
```

Expected：测试全部 PASS，domain build exit 0。

- [ ] **Step 5: 提交共享契约**

```bash
git add packages/domain/src/platform-service.ts packages/domain/src/platform-service.test.ts packages/domain/src/index.ts packages/domain/src/permission.ts packages/domain/src/permission.test.ts
git commit -m "feat(domain): add platform service sales contracts"
```

## Task 2: 创建数据库基础与原子状态转换

**Files:**

- Create: `supabase/migrations/20260803110000_create_platform_service_sales_foundation.sql`
- Create: `apps/api/src/services/platform-service-sales-migration-contract.test.ts`

- [ ] **Step 1: 写 migration 静态失败测试**

测试必须读取 migration 文件并断言：

```ts
import { describe, expect, test } from "bun:test";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260803110000_create_platform_service_sales_foundation.sql",
  import.meta.url,
);
const sql = await Bun.file(migrationPath).text();

describe("platform service sales migration", () => {
  test("creates isolated service sales tables", () => {
    for (const table of [
      "platform_service_products",
      "platform_service_product_versions",
      "tenant_service_orders",
      "tenant_service_work_orders",
      "tenant_service_wechat_notifications",
      "tenant_service_refund_requests",
    ]) expect(sql).toContain(`CREATE TABLE public.${table}`);
  });

  test("does not mutate credit or virtual product data", () => {
    expect(sql).not.toMatch(/UPDATE\s+public\.tenant_credit_/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.tenant_credit_/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.platform_virtual_products/i);
  });

  test("creates guarded order and atomic payment confirmation RPCs", () => {
    expect(sql).toContain("platform_service_create_pending_order");
    expect(sql).toContain("platform_service_confirm_payment");
    expect(sql).toContain("FOR UPDATE");
  });
});
```

- [ ] **Step 2: 确认测试失败**

Run:

```bash
bun test apps/api/src/services/platform-service-sales-migration-contract.test.ts
```

Expected：FAIL，migration 文件不存在。

- [ ] **Step 3: 编写 additive migration**

Migration 必须一次性包含：

```sql
CREATE TABLE public.platform_service_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  term_years integer NOT NULL CHECK (term_years IN (1, 2, 3)),
  list_amount_fen bigint NOT NULL CHECK (list_amount_fen > 0),
  amount_fen bigint NOT NULL CHECK (amount_fen > 0 AND amount_fen <= list_amount_fen),
  service_scope jsonb NOT NULL DEFAULT '[]'::jsonb,
  terms_version integer NOT NULL DEFAULT 1 CHECK (terms_version > 0),
  terms_content text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'enabled', 'disabled', 'archived')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  published_version_id uuid NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_by_employee_id uuid NULL,
  updated_by_employee_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.platform_service_product_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.platform_service_products(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  title text NOT NULL,
  term_years integer NOT NULL CHECK (term_years IN (1, 2, 3)),
  list_amount_fen bigint NOT NULL CHECK (list_amount_fen > 0),
  amount_fen bigint NOT NULL CHECK (amount_fen > 0 AND amount_fen <= list_amount_fen),
  service_scope jsonb NOT NULL,
  terms_version integer NOT NULL CHECK (terms_version > 0),
  terms_content text NOT NULL,
  published_by_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, version)
);

CREATE TABLE public.tenant_service_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.platform_service_products(id) ON DELETE RESTRICT,
  product_version_id uuid NOT NULL REFERENCES public.platform_service_product_versions(id) ON DELETE RESTRICT,
  order_no text NOT NULL UNIQUE,
  out_trade_no text NOT NULL UNIQUE,
  idempotency_key uuid NULL,
  product_code text NOT NULL,
  pricing_version integer NOT NULL CHECK (pricing_version > 0),
  product_snapshot jsonb NOT NULL,
  term_years integer NOT NULL CHECK (term_years IN (1, 2, 3)),
  amount_fen bigint NOT NULL CHECK (amount_fen > 0),
  paid_amount_fen bigint NULL CHECK (paid_amount_fen IS NULL OR paid_amount_fen >= 0),
  payment_status text NOT NULL DEFAULT 'pending',
  service_status text NOT NULL DEFAULT 'waiting_payment',
  payment_config_id uuid NOT NULL REFERENCES public.platform_payment_configs(id) ON DELETE RESTRICT,
  payment_config_guard_version integer NOT NULL,
  payer_openid text NOT NULL,
  prepay_id text NULL,
  transaction_id text NULL,
  payment_expires_at timestamptz NOT NULL,
  paid_at timestamptz NULL,
  closed_at timestamptz NULL,
  terms_version integer NOT NULL,
  terms_accepted_at timestamptz NOT NULL,
  created_by_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key),
  CHECK (payment_status IN ('pending', 'paid', 'refund_reviewing', 'refunding', 'partially_refunded', 'refunded', 'closed')),
  CHECK (service_status IN ('waiting_payment', 'waiting_assignment', 'configuring', 'deploying', 'training', 'awaiting_acceptance', 'rectifying', 'accepted', 'active', 'canceled'))
);
```

创建版本表后再为 `platform_service_products.published_version_id` 增加指向版本表的 `ON DELETE RESTRICT` 外键。同一 migration 还要创建另外三张表、必要外键和以下索引：

```sql
CREATE INDEX tenant_service_orders_tenant_created_idx
  ON public.tenant_service_orders (tenant_id, created_at DESC);
CREATE INDEX tenant_service_orders_payment_created_idx
  ON public.tenant_service_orders (payment_status, created_at DESC);
CREATE INDEX tenant_service_orders_service_updated_idx
  ON public.tenant_service_orders (service_status, updated_at DESC);
CREATE UNIQUE INDEX tenant_service_orders_transaction_unique_idx
  ON public.tenant_service_orders (transaction_id)
  WHERE transaction_id IS NOT NULL;
CREATE INDEX tenant_service_orders_pending_config_idx
  ON public.tenant_service_orders (payment_config_id, payment_expires_at)
  WHERE payment_status = 'pending';
```

`tenant_service_work_orders` 必须对 `service_order_id` 唯一；`tenant_service_wechat_notifications.notify_id` 唯一；退款申请对 `(service_order_id, idempotency_key)` 唯一。

创建两个 `SECURITY DEFINER` RPC：

- `platform_service_create_pending_order`：锁定支付配置，校验配置 status、guard version 和渠道，插入订单；
- `platform_service_confirm_payment`：`FOR UPDATE` 锁订单，校验金额和 transaction_id，幂等更新为 `paid/waiting_assignment`，并 `ON CONFLICT (service_order_id) DO NOTHING` 创建工单。

两者都必须固定 `SET search_path = public, pg_temp`，撤销 public execute，仅向 `service_role` 授权。

开启 RLS：租户只能读取自己订单、工单和退款申请；客户端不得直接 insert/update，所有写入走 API service role。平台商品仅允许读取 `enabled`；管理写入仍走 API 权限。

插入三款 `enabled` 商品及其首个已发布版本。980000、1568000、2058000 分只作为 migration 初始化默认值，`terms_content` 写明部署、服务器配置、首次培训和年度运维，不包含积分赠送。任何 TypeScript 文件不得复制这三个金额作为业务常量。

商品原价和实际售价是后台可编辑数据；折扣不作为第三个可独立修改的数据库真相，API 使用 `round(amount_fen * 10000 / list_amount_fen)` 计算 `price_rate_basis_points`。Admin 若允许输入“8 折”，应先换算实际售价再提交，避免三个字段不一致。

- [ ] **Step 4: 运行 migration 契约测试**

Run:

```bash
bun test apps/api/src/services/platform-service-sales-migration-contract.test.ts
```

Expected：全部 PASS。

- [ ] **Step 5: 提交数据库基础**

```bash
git add supabase/migrations/20260803110000_create_platform_service_sales_foundation.sql apps/api/src/services/platform-service-sales-migration-contract.test.ts
git commit -m "feat(db): add platform service sales foundation"
```

## Task 3: 实现 repository 与视图序列化

**Files:**

- Create: `apps/api/src/repositories/platform-service-orders.ts`
- Create: `apps/api/src/repositories/platform-service-orders.test.ts`
- Create: `apps/api/src/services/platform-service-order-views.ts`
- Create: `apps/api/src/services/platform-service-order-views.test.ts`

- [ ] **Step 1: 写 repository 和 view 失败测试**

测试覆盖：

```ts
test("lists enabled products with range pagination and selected columns", async () => {});
test("lists orders by tenant without selecting payer_openid or product_snapshot", async () => {});
test("finds an order by tenant and id", async () => {});
test("loads tenant products from the published version instead of editable draft fields", async () => {});
test("publishes a new immutable product version with optimistic locking", async () => {});
test("creates a pending order through platform_service_create_pending_order", async () => {});
test("maps database errors with Errors.dbError", async () => {});
test("exposes continue_payment only for a non-expired pending order", () => {});
test("never serializes payer_openid, payment config or raw product snapshot", () => {});
```

- [ ] **Step 2: 确认测试失败**

Run:

```bash
bun test apps/api/src/repositories/platform-service-orders.test.ts apps/api/src/services/platform-service-order-views.test.ts
```

Expected：FAIL，模块不存在。

- [ ] **Step 3: 实现最小 repository**

Repository 只能直接访问以下表/RPC：

```ts
type PlatformServiceOrderRepository = {
  listEnabledProducts(input: { page: number; pageSize: number }): Promise<ProductPage>;
  findEnabledProductByCode(code: string): Promise<ProductRecord | null>;
  listPlatformProducts(input: { page: number; pageSize: number }): Promise<PlatformProductPage>;
  createProductDraft(input: ProductDraftCreateInput): Promise<ProductRecord>;
  updateProductDraft(input: ProductDraftUpdateInput): Promise<ProductRecord>;
  publishProductVersion(input: ProductPublishInput): Promise<ProductVersionRecord>;
  archiveProduct(input: { productId: string; expectedVersion: number; employeeId: string }): Promise<ProductRecord>;
  listOrders(input: { tenantId: string; page: number; pageSize: number; paymentStatus?: string; serviceStatus?: string; keyword?: string }): Promise<OrderPage>;
  findOrderByTenantAndId(input: { tenantId: string; orderId: string }): Promise<OrderRecord | null>;
  findOrderByIdempotencyKey(input: { tenantId: string; idempotencyKey: string }): Promise<OrderRecord | null>;
  findOrderByOutTradeNo(outTradeNo: string): Promise<OrderRecord | null>;
  createPendingOrder(input: CreatePendingOrderInput): Promise<OrderRecord>;
  markPrepayCreated(input: { orderId: string; prepayId: string }): Promise<OrderRecord>;
  hasPendingOrdersForPaymentConfig(paymentConfigId: string): Promise<boolean>;
  createWechatNotification(input: NotificationCreateInput): Promise<NotificationRecord>;
  findWechatNotificationByNotifyId(notifyId: string): Promise<NotificationRecord | null>;
  markWechatNotificationProcessed(id: string): Promise<void>;
  markWechatNotificationFailed(input: { id: string; errorMessage: string }): Promise<void>;
  confirmPayment(input: ConfirmPaymentInput): Promise<ConfirmPaymentResult>;
  createRefundRequest(input: RefundRequestCreateInput): Promise<RefundRequestRecord>;
};
```

列表查询必须显式 `.select("field,...")`、`.range(from,to)`，默认 20、最大 100 由 schema/service 双重限制；禁止 `select("*")` 和 N+1 查询。

- [ ] **Step 4: 实现安全视图**

租户商品视图只读取当前 `published_version_id` 指向的不可变版本，返回 `code/title/term_years/list_amount_fen/amount_fen/price_rate_basis_points/pricing_version/service_scope/terms_version`。`price_rate_basis_points` 按 `round(amount_fen * 10000 / list_amount_fen)` 计算，不读取应用常量。

平台商品视图同时返回 draft、published、`version` 和 `has_unpublished_changes`，但不向租户接口泄漏草稿价格。

订单视图返回三类状态、`display_stage`、支付时间、过期时间、版本和：

```ts
available_actions: {
  continue_payment: { enabled: boolean; label: "继续支付"; disabled_reason: string | null };
  request_refund: { enabled: boolean; label: "申请售后"; disabled_reason: string | null };
};
```

不得返回 `payer_openid`、支付配置、商品原始 JSON、回调载荷和数据库错误。

- [ ] **Step 5: 运行测试**

Run:

```bash
bun test apps/api/src/repositories/platform-service-orders.test.ts apps/api/src/services/platform-service-order-views.test.ts
```

Expected：全部 PASS。

- [ ] **Step 6: 提交 repository 和视图**

```bash
git add apps/api/src/repositories/platform-service-orders.ts apps/api/src/repositories/platform-service-orders.test.ts apps/api/src/services/platform-service-order-views.ts apps/api/src/services/platform-service-order-views.test.ts
git commit -m "feat(api): add platform service order repository"
```

## Task 4: 定义租户订单与平台商品 API schema/路由

**Files:**

- Create: `apps/api/src/schema/billing-service-orders.ts`
- Create: `apps/api/src/schema/billing-service-orders.test.ts`
- Create: `apps/api/src/schema/platform-service-products.ts`
- Create: `apps/api/src/schema/platform-service-products.test.ts`
- Create: `apps/api/src/controllers/billing-service-orders/index.ts`
- Create: `apps/api/src/controllers/billing-service-orders/routes.test.ts`
- Create: `apps/api/src/controllers/platform-service-products/index.ts`
- Create: `apps/api/src/controllers/platform-service-products/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/errors/error-codes.ts`
- Modify: `apps/api/src/errors/error-codes.test.ts`

- [ ] **Step 1: 写 schema 和路由失败测试**

Schema 测试必须证明：

```ts
expect(ServiceProductListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
expect(ServiceProductListQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
expect(ServiceOrderCreateSchema.safeParse({
  product_code: "platform_service_1y",
  terms_version: 1,
  terms_accepted: true,
  idempotency_key: crypto.randomUUID(),
}).success).toBe(true);
expect(ServiceOrderCreateSchema.safeParse({
  product_code: "platform_service_1y",
  terms_version: 1,
  terms_accepted: true,
  idempotency_key: crypto.randomUUID(),
  amount_fen: 1,
}).success).toBe(false);
```

路由测试断言：

```ts
[
  "GET /billing/service-products",
  "GET /billing/service-orders",
  "POST /billing/service-orders",
  "GET /billing/service-orders/:id",
  "POST /billing/service-orders/:id/payment-request",
  "POST /billing/service-orders/:id/refund-requests",
]
```

平台路由测试断言：

```ts
[
  "GET /platform/billing/service-products",
  "POST /platform/billing/service-products",
  "PATCH /platform/billing/service-products/:id",
  "POST /platform/billing/service-products/:id/publish",
  "POST /platform/billing/service-products/:id/archive",
]
```

- [ ] **Step 2: 确认测试失败**

Run:

```bash
bun test apps/api/src/schema/billing-service-orders.test.ts apps/api/src/schema/platform-service-products.test.ts apps/api/src/controllers/billing-service-orders/routes.test.ts apps/api/src/controllers/platform-service-products/routes.test.ts apps/api/src/errors/error-codes.test.ts
```

Expected：FAIL，新 schema、controller 和错误码不存在。

- [ ] **Step 3: 实现严格 Zod schema**

定义：

```ts
export const ServiceProductListQuerySchema = PaginationQuerySchema.strict();
export const ServiceOrderListQuerySchema = PaginationQuerySchema.extend({
  paymentStatus: z.enum(PLATFORM_SERVICE_PAYMENT_STATUS_VALUES).optional(),
  serviceStatus: z.enum(PLATFORM_SERVICE_STATUS_VALUES).optional(),
  keyword: z.string().trim().max(120).optional(),
}).strict();
export const ServiceOrderCreateSchema = z.object({
  product_code: z.string().trim().min(1).max(80),
  terms_version: z.number().int().positive(),
  terms_accepted: z.literal(true),
  idempotency_key: z.uuid(),
}).strict();
export const ServiceOrderActionSchema = z.object({
  idempotency_key: z.uuid(),
  expected_version: z.number().int().positive(),
}).strict();
export const ServiceRefundRequestSchema = ServiceOrderActionSchema.extend({
  reason: z.string().trim().min(1).max(500),
}).strict();
```

订单 `:id` 使用 `z.uuid("无效的平台服务订单 ID")`。

平台商品 schema 必须使用整数分和乐观锁：

```ts
export const PlatformServiceProductDraftSchema = z.object({
  code: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(120),
  term_years: z.number().int().min(1).max(3),
  list_amount_fen: z.number().int().positive(),
  amount_fen: z.number().int().positive(),
  service_scope: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
  terms_content: z.string().trim().min(1).max(20000),
}).strict().superRefine((value, context) => {
  if (value.amount_fen > value.list_amount_fen) {
    context.addIssue({
      code: "custom",
      path: ["amount_fen"],
      message: "实际售价不能高于原价",
    });
  }
});

export const PlatformServiceProductUpdateSchema =
  PlatformServiceProductDraftSchema.partial().extend({
    expected_version: z.number().int().positive(),
  }).strict();

export const PlatformServiceProductActionSchema = z.object({
  expected_version: z.number().int().positive(),
  idempotency_key: z.uuid(),
}).strict();
```

折扣输入不进入后端持久化契约；Admin 将折扣换算为 `amount_fen`，后端从原价和实际售价计算展示折扣。

- [ ] **Step 4: 实现薄 controller**

两个 Controller 都只完成：

```text
读取 request.user 与 auth context
→ safeParse 参数
→ 调 tenantPlatformServiceOrderService
→ ResponseHandler.success(data)
```

创建订单和继续支付时，从已验签的 `request.user.openid` 读取付款 openid 并传给 service；请求体不得提供 openid。缺失时通过 `Errors.business(401, ..., "PAYER_OPENID_REQUIRED")` 返回。

平台商品 Controller 使用 `platform.service_product.manage`。它只读取请求、校验、调用 `platformServiceProductService` 并包装响应，发布版本和价格快照逻辑必须在 service/repository/RPC。

- [ ] **Step 5: 增加错误码**

至少增加：

```text
SERVICE_PRODUCT_NOT_FOUND
SERVICE_TERMS_VERSION_STALE
SERVICE_ORDER_NOT_FOUND
SERVICE_ORDER_INVALID_STATE
SERVICE_ORDER_VERSION_CONFLICT
SERVICE_ORDER_IDEMPOTENCY_CONFLICT
SERVICE_ORDER_FORBIDDEN
PAYER_OPENID_REQUIRED
SERVICE_PAYMENT_CONFIG_INVALID
SERVICE_PAYMENT_PREPAY_FAILED
SERVICE_REFUND_ALREADY_PENDING
SERVICE_PRODUCT_VERSION_CONFLICT
SERVICE_PRODUCT_PUBLISH_REQUIRED
```

- [ ] **Step 6: 运行测试**

Run:

```bash
bun test apps/api/src/schema/billing-service-orders.test.ts apps/api/src/schema/platform-service-products.test.ts apps/api/src/controllers/billing-service-orders/routes.test.ts apps/api/src/controllers/platform-service-products/routes.test.ts apps/api/src/errors/error-codes.test.ts
```

Expected：全部 PASS。

- [ ] **Step 7: 提交 API 契约**

```bash
git add apps/api/src/schema/billing-service-orders.ts apps/api/src/schema/billing-service-orders.test.ts apps/api/src/schema/platform-service-products.ts apps/api/src/schema/platform-service-products.test.ts apps/api/src/controllers/billing-service-orders/index.ts apps/api/src/controllers/billing-service-orders/routes.test.ts apps/api/src/controllers/platform-service-products/index.ts apps/api/src/controllers/platform-service-products/routes.test.ts apps/api/src/routes/index.ts apps/api/src/errors/error-codes.ts apps/api/src/errors/error-codes.test.ts
git commit -m "feat(api): expose service order and product routes"
```

## Task 5: 实现可配置商品、下单、预支付和查询服务

**Files:**

- Create: `apps/api/src/services/tenant-platform-service-orders.ts`
- Create: `apps/api/src/services/tenant-platform-service-orders.test.ts`
- Create: `apps/api/src/services/platform-service-products.ts`
- Create: `apps/api/src/services/platform-service-products.test.ts`

- [ ] **Step 1: 写业务失败测试**

测试必须覆盖：

```ts
test("lists only enabled products with pagination", async () => {});
test("creates and edits a product draft without changing the published price", async () => {});
test("publishes an immutable product version with optimistic locking", async () => {});
test("uses a newly published price only for new orders", async () => {});
test("keeps an existing pending order amount after a later price publication", async () => {});
test("rejects a stale terms version", async () => {});
test("derives price from the published database version and has no hard-coded fallback", async () => {});
test("creates one order for the same tenant idempotency key", async () => {});
test("creates JSAPI prepay with the platform ordinary payment profile", async () => {});
test("returns the same pending order on an idempotent retry", async () => {});
test("does not call any credit account or virtual product repository", async () => {});
test("lists and gets only current tenant orders", async () => {});
test("rejects continue payment after expiration or state change", async () => {});
```

- [ ] **Step 2: 确认测试失败**

Run:

```bash
bun test apps/api/src/services/platform-service-products.test.ts apps/api/src/services/tenant-platform-service-orders.test.ts
```

Expected：FAIL，两个 service 不存在。

- [ ] **Step 3: 实现平台商品草稿与发布**

`PlatformServiceProductService` 必须：

```text
校验 platform.service_product.manage
→ 新建/修改 draft，使用 expected_version 防止覆盖
→ 根据 list_amount_fen 和 amount_fen 计算 price_rate_basis_points
→ publish 时把完整 draft 复制到 platform_service_product_versions
→ 原子更新 published_version_id 和 version
→ archive 只停止新订单，不删除商品或版本
```

任何更新都不能改写 `platform_service_product_versions`。商品代码已产生订单后不可修改；原价、实际售价、范围和条款可以形成新发布版本。

- [ ] **Step 4: 实现租户权限与查询**

权限：

```ts
const CREATE_PERMISSION = "billing.service_order.create";
const READ_PERMISSION = "billing.service_order.read";
const REFUND_PERMISSION = "billing.service_order.refund.request";
```

所有入口先通过 `accessPolicyService.assertTenantContext(authContext)` 获取 tenant ID，再校验 employee ID 和权限。商品/订单列表均使用 schema 解析后的分页参数。

- [ ] **Step 5: 实现幂等下单与预支付**

顺序固定为：

```text
查 tenant + idempotency_key
→ 命中则返回同一订单
→ 查 enabled 商品当前 published version 并核对 terms_version/pricing_version
→ 读取平台普通微信支付配置和相同 revision 的 secret bundle
→ 由后端使用已发布版本生成 order_no/out_trade_no、金额、商品和条款快照
→ RPC 创建 pending 订单
→ wechatPayGateway.createJsapiPrepay
→ 保存 prepay_id
→ createMiniProgramPaymentRequest
→ 返回 order + payment_request + server_time
```

支付窗口沿用 5 分钟；description 使用商品标题，不出现积分或虚拟权益。预下单失败时保留 pending 订单并返回 `SERVICE_PAYMENT_PREPAY_FAILED`，之后允许继续支付，不能重复插入订单。

下单后不再读取商品当前价格来校验或继续支付；待支付订单、回调和退款全部使用订单自身 `amount_fen` 与 `product_version_id` 快照。

- [ ] **Step 6: 实现继续支付**

继续支付必须校验 tenant、版本、`payment_status=pending` 和未过期；使用订单绑定的 `payment_config_id` 与 guard version，不切换到另一商户配置。

- [ ] **Step 7: 运行测试**

Run:

```bash
bun test apps/api/src/services/platform-service-products.test.ts apps/api/src/services/tenant-platform-service-orders.test.ts apps/api/src/controllers/billing-service-orders/routes.test.ts apps/api/src/controllers/platform-service-products/routes.test.ts
```

Expected：全部 PASS。

- [ ] **Step 8: 提交商品与租户服务订单编排**

```bash
git add apps/api/src/services/platform-service-products.ts apps/api/src/services/platform-service-products.test.ts apps/api/src/services/tenant-platform-service-orders.ts apps/api/src/services/tenant-platform-service-orders.test.ts
git commit -m "feat(api): add configurable service product payments"
```

## Task 6: 接入微信支付回调并原子创建实施工单

**Files:**

- Create: `apps/api/src/services/platform-service-order-payment-confirmation.ts`
- Create: `apps/api/src/services/platform-service-order-payment-confirmation.test.ts`
- Create: `apps/api/src/services/wechat-pay-callbacks-platform-service.test.ts`
- Modify: `apps/api/src/services/wechat-pay-callback-platform-payment.ts`
- Modify: `apps/api/src/services/wechat-pay-callback-context-matcher.ts`
- Modify: `apps/api/src/services/wechat-pay-callbacks.ts`

- [ ] **Step 1: 写回调失败测试**

测试场景：

```ts
test("matches a service order only to its bound platform payment config", async () => {});
test("rejects amount, merchant, appid and transaction binding mismatches", async () => {});
test("rejects an out_trade_no shared by two platform payment domains", async () => {});
test("confirms payment and creates one work order", async () => {});
test("returns success for a duplicate processed notify id", async () => {});
test("does not invoke credit, branding virtual or project payment confirmation", async () => {});
```

- [ ] **Step 2: 确认测试失败**

Run:

```bash
bun test apps/api/src/services/platform-service-order-payment-confirmation.test.ts apps/api/src/services/wechat-pay-callbacks-platform-service.test.ts
```

Expected：FAIL，不识别 `platform_service_order`。

- [ ] **Step 3: 扩展平台支付 matcher**

把平台支付候选并行查询扩展为 credit、branding 和 service 三类。匹配数大于 1 必须返回 `WECHAT_PAY_CALLBACK_ORDER_AMBIGUOUS`。服务订单复用已核对的 `convertWechatPayTransactionCallbackResource`、`buildWechatPayTransactionExpectedBinding` 和 `parseAndAssertWechatPayTransactionCallback`，不得新增自制签名或金额解析逻辑。

新增上下文：

```ts
export type PlatformServiceOrderCallbackContext = {
  kind: "platform_service_order";
  config: PlatformPaymentConfigRecord;
  payload: Record<string, unknown>;
  transaction: WechatPayValidatedSuccessTransaction;
  order: TenantServiceOrderRecord;
};
```

- [ ] **Step 4: 实现支付确认适配**

`PlatformServiceOrderPaymentConfirmation.confirm()` 只向 repository/RPC 传：订单 ID、微信 transaction ID、实付分、success_time、通知 ID 和最小审计 metadata。RPC 返回 `order/work_order/idempotent`。

- [ ] **Step 5: 扩展统一 callback 分派**

处理顺序保持退款 → 积分 → 品牌 → 平台服务 → smoke → 项目。服务回调先按 notify ID 幂等写通知，再确认支付，成功后标 processed；失败记录脱敏 `error_message` 并重新抛出 error-factory 异常。

- [ ] **Step 6: 运行回调回归测试**

Run:

```bash
bun test apps/api/src/services/wechat-pay-callbacks-platform-service.test.ts apps/api/src/services/wechat-pay-callbacks-credit-recharge.test.ts apps/api/src/services/wechat-pay-callbacks-branding-addon.test.ts apps/api/src/services/wechat-pay-callbacks.test.ts
```

Expected：新旧回调测试全部 PASS。

- [ ] **Step 7: 提交回调闭环**

```bash
git add apps/api/src/services/platform-service-order-payment-confirmation.ts apps/api/src/services/platform-service-order-payment-confirmation.test.ts apps/api/src/services/wechat-pay-callbacks-platform-service.test.ts apps/api/src/services/wechat-pay-callback-platform-payment.ts apps/api/src/services/wechat-pay-callback-context-matcher.ts apps/api/src/services/wechat-pay-callbacks.ts
git commit -m "feat(payment): confirm platform service orders"
```

## Task 7: 纳入支付配置保护并实现退款申请

**Files:**

- Modify: `apps/api/src/services/platform-payment-config-pending-orders.ts`
- Modify: `apps/api/src/services/platform-payment-config-pending-orders-contract.test.ts`
- Modify: `apps/api/src/services/platform-payment-configs.ts`
- Modify: `apps/api/src/services/platform-payment-configs-pending-orders.test.ts`
- Modify: `apps/api/src/services/tenant-platform-service-orders.ts`
- Modify: `apps/api/src/services/tenant-platform-service-orders.test.ts`

- [ ] **Step 1: 写配置保护和退款失败测试**

```ts
test("blocks critical payment config changes when a service order is pending", async () => {});
test("blocks secret rotation when a service order is pending", async () => {});
test("allows config changes when all payment domains have no pending orders", async () => {});
test("creates one refund request for the same idempotency key", async () => {});
test("moves a paid service order to refund_reviewing", async () => {});
test("rejects refund requests for pending, closed or refunded orders", async () => {});
```

- [ ] **Step 2: 确认测试失败**

Run:

```bash
bun test apps/api/src/services/platform-payment-configs-pending-orders.test.ts apps/api/src/services/tenant-platform-service-orders.test.ts
```

Expected：FAIL，pending guard 不查询服务订单且退款动作尚未实现。

- [ ] **Step 3: 把 pending port 改为聚合语义**

定义：

```ts
export type PendingPlatformPaymentOrdersPort = {
  hasPendingOrdersForPaymentConfig(paymentConfigId: string): Promise<boolean>;
};
```

实现适配器并行查询积分、品牌普通支付订单和服务订单，任一为 true 即阻止关键配置或密钥变更。错误码改为 `PLATFORM_PAYMENT_CONFIG_PENDING_ORDERS`，文案不再只写“充值订单”。

- [ ] **Step 4: 实现租户退款申请**

退款申请只创建审核记录并把订单置为 `refund_reviewing`，本期不直接调用微信退款。校验当前租户、权限、订单版本和 `payment_status=paid`；幂等命中返回原申请。

- [ ] **Step 5: 运行测试**

Run:

```bash
bun test apps/api/src/services/platform-payment-configs-pending-orders.test.ts apps/api/src/services/platform-payment-config-pending-orders-contract.test.ts apps/api/src/services/tenant-platform-service-orders.test.ts
```

Expected：全部 PASS。

- [ ] **Step 6: 提交保护和退款申请**

```bash
git add apps/api/src/services/platform-payment-config-pending-orders.ts apps/api/src/services/platform-payment-config-pending-orders-contract.test.ts apps/api/src/services/platform-payment-configs.ts apps/api/src/services/platform-payment-configs-pending-orders.test.ts apps/api/src/services/tenant-platform-service-orders.ts apps/api/src/services/tenant-platform-service-orders.test.ts
git commit -m "feat(payment): guard service orders and accept refunds"
```

## Task 8: 全量静态验证与本地 migration 验证

**Files:**

- Modify only if generated: `apps/api/src/types/database.ts`
- No Orange files

- [ ] **Step 1: 运行功能定向测试**

Run:

```bash
bun test packages/domain/src/platform-service.test.ts packages/domain/src/permission.test.ts
bun test apps/api/src/schema/billing-service-orders.test.ts apps/api/src/schema/platform-service-products.test.ts apps/api/src/controllers/billing-service-orders/routes.test.ts apps/api/src/controllers/platform-service-products/routes.test.ts
bun test apps/api/src/repositories/platform-service-orders.test.ts apps/api/src/services/platform-service-order-views.test.ts
bun test apps/api/src/services/platform-service-products.test.ts apps/api/src/services/tenant-platform-service-orders.test.ts apps/api/src/services/platform-service-order-payment-confirmation.test.ts apps/api/src/services/wechat-pay-callbacks-platform-service.test.ts
```

Expected：全部 PASS，0 failures。

- [ ] **Step 2: 运行旧支付域回归测试**

Run:

```bash
bun test apps/api/src/services/wechat-pay-callbacks-credit-recharge.test.ts apps/api/src/services/wechat-pay-callbacks-branding-addon.test.ts apps/api/src/services/wechat-pay-callbacks.test.ts apps/api/src/services/platform-payment-configs-pending-orders.test.ts
```

Expected：全部 PASS，证明积分、品牌和项目支付未被新 matcher 破坏。

- [ ] **Step 3: 运行 API 静态检查**

Run:

```bash
bun run api:typecheck
bun run api:build
bun run api:check-file-size
bun run check:permission-boundaries
bun run audit:supabase-writes
```

Expected：全部 exit 0。文件超限时按职责拆分，不提高阈值、不把逻辑塞回 controller。

- [ ] **Step 4: 在本地 Supabase 验证 migration**

Run:

```bash
supabase db reset
supabase migration list
```

Expected：全部 migration 可从零应用，本地列表包含 `20260803110000`，无 SQL 错误。该操作只允许在确认是本地 Supabase 后执行，不得对远程开发库使用 reset。

- [ ] **Step 5: 提交生成类型（如有）**

只有在 migration 已应用到指定 dev project 并确认项目 ID 后运行：

```bash
bun run gen
git add apps/api/src/types/database.ts
git commit -m "chore(api): refresh platform service database types"
```

执行 `bun run gen` 前必须确认仓库脚本中的 Supabase project ID 与 `.env` 指向同一个开发项目；不一致时先修订计划并停止生成，不能使用生产项目。

## Task 9: 应用 dev migration、运行 smoke 并发布小程序契约

**Files:**

- Create: `apps/api/src/scripts/platform-service-payment-smoke.ts`
- Create: `docs/miniprogram/2026-08-03-platform-service-payment-handoff.md`

- [ ] **Step 1: 写 smoke 脚本测试/干运行模式**

脚本必须支持：

```text
--dry-run  只检查商品、权限、支付 readiness 和接口路由，不创建订单
--order-id 查询指定测试订单，不发起新支付
```

输出只包含：API 环境、商品 code/金额、order ID/no、三类状态、requestId 和 readiness；不得输出 token、openid、prepay_id、paySign、证书或回调明文。

- [ ] **Step 2: 对照 `.env` 确认开发数据库目标**

只读取 `/Users/leefo/Public/work/gooes/.env` 中的 Supabase 目标并与用户确认的开发项目一致。不得把环境变量内容打印到日志，不得手工远程执行 DDL/DML。

- [ ] **Step 3: 应用 migration 到开发库**

使用 Supabase migration 命令应用待执行 migration，随后运行：

```bash
supabase migration list
```

Expected：`20260803110000` 的 Local/Remote 对齐。若不对齐，停止发布并修复 migration 历史，不用手工 SQL 补齐。

- [ ] **Step 4: 运行 dev dry-run 与小额支付 smoke**

Run:

```bash
bun --cwd apps/api src/scripts/platform-service-payment-smoke.ts --dry-run
```

Expected：三款初始化商品从数据库读取、普通支付 readiness 通过、租户和平台商品管理路由存在。随后在开发库创建专用 `platform_service_smoke` 测试商品：先发布 1 分版本创建订单，再发布 2 分版本；验证旧订单仍为 1 分、新订单为 2 分，最后归档测试商品。使用专用测试租户完成受控支付，确认回调后订单 `paid` 且恰有一张实施工单；不得改动生产商品或在生产环境执行该 smoke。

- [ ] **Step 5: 编写真实 handoff 文档**

Handoff 必须包含：

- dev API 版本和 base URL；
- 最终租户订单接口、平台商品管理接口、权限和开关；
- 三款真实商品响应；
- pending/paid/waiting_assignment/退款审核中的脱敏样例；
- `PAYER_OPENID_REQUIRED`、条款版本、幂等、轮询和错误码；
- 明确“当前一期没有培训、附件、验收和微信发货接口”；
- Orange 只读影响模块：`src/services/billing.ts`、`src/types/api/billing.d.ts`、`src/packageEmployees/pages/creditRecharge`、`rechargeRecords`、`src/utils/wechat_payment.ts`、`src/app.config.ts`。

- [ ] **Step 6: 最终验证并提交**

Run:

```bash
git diff --check
git status --short
bun run api:check
```

Expected：`api:check` exit 0；状态只包含本任务脚本、handoff 或经确认的生成类型。

Commit:

```bash
git add apps/api/src/scripts/platform-service-payment-smoke.ts docs/miniprogram/2026-08-03-platform-service-payment-handoff.md
git commit -m "docs(miniprogram): hand off platform service payments"
```

## 一期完成门槛

只有以下全部满足，才能宣布一期完成并开始 Admin/履约二期：

- 三个套餐的金额、服务年限和条款版本来自数据库已发布商品版本，TypeScript 不存在价格 fallback 常量；
- 平台可以修改原价/实际售价并发布新版本，折扣实时重算；新订单使用新版本，已有待支付和历史订单继续使用原快照；
- 小程序请求无法传金额、商户号、支付通道或 openid；
- 相同租户与幂等键只产生一张订单；
- 支付回调金额、商户/AppID/订单绑定全部校验；
- 重复回调只确认一次且只创建一张实施工单；
- 新订单不写积分账户、积分流水、虚拟商品或项目财务；
- 普通支付关键配置/密钥不能在服务订单待支付时切换；
- 退款申请只进入审核，不假装已退款；
- migration 可从零应用并在 dev Local/Remote 对齐；
- domain、API 定向测试、旧支付回归、typecheck、build、file-size 和 smoke 均有 fresh exit 0 证据；
- Orange 未被修改；dev handoff 已提供真实脱敏响应。

## 后续计划顺序

一期完成后按以下顺序继续，每一期单独编写 implementation plan 并设置发布门槛：

1. **二期：服务履约与 Admin** — 工单分配、配置/部署里程碑、培训、私有附件、客户验收准备和退款审核。
2. **三期：Orange 小程序** — 新服务商品、订单、支付、工单详情、材料上传、培训确认、验收/驳回和售后页面；Gooes 仅交付契约，不修改 Orange。
3. **四期：微信发货信息管理** — readiness、无实体物流上报、查询对账、重试和 Admin 履约异常。
4. **五期：灰度与旧积分收口** — 白名单、账务核对、停用旧积分新建入口、保留历史退款与审计。

不提前并行三期和四期：Orange 必须先基于稳定的一期/二期契约接入，微信履约也必须在真实客户验收状态存在后才能上报。
