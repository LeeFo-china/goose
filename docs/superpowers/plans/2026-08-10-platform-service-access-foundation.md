# 平台技术服务访问基础 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立正式技术服务合同期、付款后 onboarding 访问和统一租户路由访问判定，为试用转正式提供无缝且可审计的访问基础。

**Architecture:** Supabase migration 保存合同、合同期和订单访问终止事实，并扩展现有支付确认、客户验收和退款事务；API 通过独立 repository/service 汇总租户状态、正式服务、旧订阅和路由类别。路由装饰器与资源工厂提供显式访问元数据，默认 GET 为 read、写方法为 write，恢复类接口显式标记 recovery。

**Tech Stack:** Bun、TypeScript、Fastify 5、Zod 4、Supabase/PostgreSQL、`@gooes/domain`。

**Approved design:** `docs/superpowers/specs/2026-08-10-platform-service-trial-management-design.md`

---

## File Map

- `packages/domain/src/platform-service-access.ts`：访问模式、访问级别、路由类别和 capability 类型。
- `apps/api/src/types/fastify.d.ts`：Fastify route config 的租户服务访问元数据。
- `apps/api/src/utils/decorators/route.ts`：装饰器默认分类和显式 override。
- `apps/api/src/routes/factory.ts`：资源 CRUD 的 read/write 分类。
- `apps/api/src/services/tenant-service-route-access.ts`：从请求读取并校验路由类别。
- `apps/api/src/repositories/tenant-service-access.ts`：合同、订单 onboarding、租户与旧订阅的集合式查询。
- `apps/api/src/services/tenant-service-access.ts`：统一访问优先级和错误映射。
- `apps/api/src/services/authorization/legacy-service.ts`：以新访问判定替换 `allowedWhenBillingLocked`。
- `apps/api/src/controllers/TenantBaseController.ts`：把当前 route config 传入授权 service。
- `apps/api/src/schema/billing-service-orders.ts`：正式订单来源和访问终止相关请求契约。
- `apps/api/src/repositories/platform-service-orders.ts`：支付确认、验收和合同期 RPC adapter。
- `apps/api/src/repositories/platform-service-fulfillment.ts`：技术服务退款执行与最终确认 RPC adapter。
- `apps/api/src/services/platform-service-refund-execution.ts`：复用普通微信支付网关，查询原交易、执行/查询退款并处理不确定态。
- `apps/api/src/controllers/platform-service-refund-requests/index.ts`：为已批准申请提供显式退款执行入口。
- `apps/admin/components/platform-service-orders/platform-service-refund-actions.tsx`：在退款审核后提供可观察、可重试的执行交互。
- `supabase/migrations/20260810190000_create_platform_service_contract_access.sql`：合同、合同期、订单访问字段、索引和原子 RPC。

### Task 1: 建立隔离分支和访问领域契约

**Files:**
- Create: `packages/domain/src/platform-service-access.ts`
- Create: `packages/domain/src/platform-service-access.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: 创建隔离 worktree**

Run:

```bash
git status --short --branch
git worktree add ../gooes-platform-service-access -b feat/platform-service-access-foundation main
cd ../gooes-platform-service-access
```

Expected: 原工作区无未提交代码；新 worktree 位于 `feat/platform-service-access-foundation`。

- [ ] **Step 2: 写访问类型失败测试**

```ts
import { describe, expect, test } from "bun:test";
import {
  TENANT_SERVICE_ACCESS_MODE_VALUES,
  TENANT_SERVICE_ROUTE_ACCESS_VALUES,
} from "./platform-service-access";

describe("platform service access contract", () => {
  test("keeps access and route values stable", () => {
    expect(TENANT_SERVICE_ACCESS_MODE_VALUES).toEqual([
      "paid",
      "paid_onboarding",
      "trial",
      "grace",
      "legacy",
      "service_blocked",
      "hard_blocked",
    ]);
    expect(TENANT_SERVICE_ROUTE_ACCESS_VALUES).toEqual([
      "session",
      "recovery",
      "read",
      "write",
      "public_or_callback",
    ]);
  });
});
```

- [ ] **Step 3: 运行 RED**

Run: `bun test packages/domain/src/platform-service-access.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 4: 实现稳定类型并导出**

```ts
export const TENANT_SERVICE_ACCESS_MODE_VALUES = [
  "paid",
  "paid_onboarding",
  "trial",
  "grace",
  "legacy",
  "service_blocked",
  "hard_blocked",
] as const;

export const TENANT_SERVICE_ROUTE_ACCESS_VALUES = [
  "session",
  "recovery",
  "read",
  "write",
  "public_or_callback",
] as const;

export type TenantServiceAccessMode =
  (typeof TENANT_SERVICE_ACCESS_MODE_VALUES)[number];
export type TenantServiceRouteAccess =
  (typeof TENANT_SERVICE_ROUTE_ACCESS_VALUES)[number];
export type TenantServiceAccessLevel = "read_write" | "read_only" | "none";
```

在 `packages/domain/src/index.ts` 增加：

```ts
export * from "./platform-service-access";
```

- [ ] **Step 5: 运行 GREEN 并提交**

Run:

```bash
bun test packages/domain/src/platform-service-access.test.ts
git add packages/domain/src/platform-service-access.ts \
  packages/domain/src/platform-service-access.test.ts \
  packages/domain/src/index.ts
git commit -m "feat(service): 定义租户服务访问契约"
```

Expected: 测试 PASS，提交只包含 Domain 文件。

### Task 2: 用 migration 建立正式合同期和访问事实

**Files:**
- Create: `apps/api/src/services/platform-service-access-migration-contract.test.ts`
- Create: `supabase/migrations/20260810190000_create_platform_service_contract_access.sql`

- [ ] **Step 1: 写 migration 静态契约失败测试**

测试必须读取固定 migration 并断言：

```ts
expect(sql).toContain("CREATE TABLE public.tenant_service_contracts");
expect(sql).toContain("CREATE TABLE public.tenant_service_contract_periods");
expect(sql).toContain("ADD COLUMN source_trial_id uuid NULL");
expect(sql).toContain("ADD COLUMN service_access_terminated_at timestamptz NULL");
expect(sql).toContain("tenant_service_contracts_tenant_family_key");
expect(sql).toContain("tenant_service_contract_periods_order_key");
expect(sql).toContain("CREATE OR REPLACE FUNCTION public.tenant_service_decide_acceptance");
expect(sql).toContain("CREATE OR REPLACE FUNCTION public.platform_service_confirm_payment");
expect(sql).toContain("CREATE OR REPLACE FUNCTION public.platform_service_confirm_refund");
expect(sql).toContain("FOR UPDATE");
expect(sql).toContain("service_access_terminated_at IS NULL");
expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
```

同时断言 migration 包含历史不变量预检、索引、service_role 授权和前向回滚说明。

- [ ] **Step 2: 运行 RED**

Run: `bun test apps/api/src/services/platform-service-access-migration-contract.test.ts`

Expected: FAIL，migration 不存在。

- [ ] **Step 3: 创建 migration 文件**

Run: `supabase migration new create_platform_service_contract_access`

Expected: 生成 migration；若时间戳不是 `20260810190000`，同步修改测试和本计划执行记录中的真实文件名。

- [ ] **Step 4: 建立合同和合同期约束**

SQL 必须实现：

```sql
CREATE TABLE public.tenant_service_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  service_family text NOT NULL DEFAULT 'platform_technical_service',
  status text NOT NULL DEFAULT 'active',
  service_start_at timestamptz NOT NULL,
  service_end_at timestamptz NOT NULL,
  last_period_id uuid NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_service_contracts_tenant_family_key
    UNIQUE (tenant_id, service_family),
  CHECK (status IN ('active', 'suspended', 'expired', 'canceled')),
  CHECK (service_end_at > service_start_at),
  CHECK (version > 0)
);
```

`tenant_service_contract_periods` 保存原始和调整后起止时间、订单、退款、状态及原因；订单唯一，合同/租户/订单使用复合外键，禁止跨租户关联。

- [ ] **Step 5: 扩展订单事实和索引**

为 `tenant_service_orders` 增加 nullable `source_trial_id`、`service_access_terminated_at`、终止原因和操作者；本期先允许 `source_trial_id` 为空，试用表在下一份计划创建后再补外键。添加 paid onboarding 查询索引：

```sql
CREATE INDEX tenant_service_orders_paid_onboarding_idx
ON public.tenant_service_orders (tenant_id, paid_at DESC, id DESC)
WHERE payment_status IN ('paid', 'refund_reviewing', 'refunding', 'partially_refunded')
  AND service_access_terminated_at IS NULL;
```

- [ ] **Step 6: 扩展验收和退款最终确认事务**

`tenant_service_decide_acceptance` 在 accepted 分支锁定当前合同，使用：

```sql
v_period_start := GREATEST(COALESCE(v_contract.service_end_at, v_now), v_now);
v_period_end := v_period_start + make_interval(years => v_order.term_years);
```

同一订单重复验收返回现有 period；不得创建第二个合同期。新增 `platform_service_confirm_refund`，仅在微信退款状态已确认成功后原子更新退款申请/订单：验收前订单终止 onboarding，验收后把对应 period 标记 `voided` 并重算合同。RPC 以退款申请和微信退款单号幂等，并拒绝金额、订单或商户绑定不一致。部分退款要求明确服务期调整输入，不按金额自动折算。

- [ ] **Step 7: 运行 migration 契约 GREEN 并提交**

Run:

```bash
bun test apps/api/src/services/platform-service-access-migration-contract.test.ts
git diff --check
git add apps/api/src/services/platform-service-access-migration-contract.test.ts \
  supabase/migrations/*_create_platform_service_contract_access.sql
git commit -m "feat(db): 建立平台服务合同访问事实"
```

Expected: 静态契约 PASS；没有手工连接远端数据库。

### Task 3: 实现访问 repository 和纯判定 service

**Files:**
- Create: `apps/api/src/repositories/tenant-service-access.ts`
- Create: `apps/api/src/repositories/tenant-service-access.test.ts`
- Create: `apps/api/src/services/tenant-service-access.ts`
- Create: `apps/api/src/services/tenant-service-access.test.ts`

- [ ] **Step 1: 写 repository RED 测试**

覆盖一次集合查询返回：租户状态、有效合同、paid onboarding、旧订阅锁定；查询只选必要字段、按 tenant ID 限定、每类 `.limit(1)`，不逐订单 N+1。

```ts
expect(result).toEqual({
  tenantStatus: "active",
  contract: null,
  paidOnboardingOrder: { id: "order-1", paid_at: NOW },
  legacySubscriptionStatus: "locked",
});
```

- [ ] **Step 2: 写 service RED 测试**

表驱动覆盖：hard block 优先、paid 优先、paid onboarding 覆盖旧 locked、legacy active、service blocked，以及 read/write/recovery/session 矩阵。

```ts
expect(resolve({ mode: "grace", routeAccess: "write" })).toMatchObject({
  allowed: false,
  errorCode: "TENANT_SERVICE_READ_ONLY",
});
```

- [ ] **Step 3: 运行 RED**

Run:

```bash
bun test apps/api/src/repositories/tenant-service-access.test.ts \
  apps/api/src/services/tenant-service-access.test.ts
```

Expected: 两个模块不存在。

- [ ] **Step 4: 实现 repository 和 service**

service 对外接口固定为：

```ts
export interface TenantServiceAccessDecision {
  mode: TenantServiceAccessMode;
  accessLevel: TenantServiceAccessLevel;
  allowed: boolean;
  reason: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

resolveForRoute(input: {
  tenantId: string;
  routeAccess: TenantServiceRouteAccess;
  requiredCapability?: string | null;
  now: Date;
}): Promise<TenantServiceAccessDecision>;
```

第一阶段只透传 `requiredCapability`，正式服务不按 capability 裁剪；第二阶段由试用策略和路由 capability map 使用该字段，避免再次改动授权入口签名。

禁止在 service 直接 `.from()`；数据库错误通过 repository 的 `Errors.dbError()` 包装，业务拒绝由 service 使用稳定错误码。

- [ ] **Step 5: 运行 GREEN 并提交**

Run:

```bash
bun test apps/api/src/repositories/tenant-service-access.test.ts \
  apps/api/src/services/tenant-service-access.test.ts
git add apps/api/src/repositories/tenant-service-access* \
  apps/api/src/services/tenant-service-access*
git commit -m "feat(api): 实现租户服务访问判定"
```

### Task 4: 给所有路由提供显式访问类别

**Files:**
- Modify: `apps/api/src/types/fastify.d.ts`
- Modify: `apps/api/src/utils/decorators/route.ts`
- Modify: `apps/api/src/routes/factory.ts`
- Create: `apps/api/src/services/tenant-service-route-access.ts`
- Create: `apps/api/src/services/tenant-service-route-access.test.ts`
- Create: `apps/api/src/utils/decorators/route.test.ts`
- Create: `apps/api/src/routes/factory.test.ts`

- [ ] **Step 1: 写装饰器和工厂 RED 测试**

断言：`@Get` 默认 read，`@Post` 默认 write，显式 recovery 覆盖默认；资源 list/get 为 read，create/update 为 write。

```ts
@Post("/billing/recover", { tenantServiceAccess: "recovery" })
async recover() {}
```

- [ ] **Step 2: 运行 RED**

Run:

```bash
bun test apps/api/src/services/tenant-service-route-access.test.ts \
  apps/api/src/utils/decorators/route.test.ts \
  apps/api/src/routes/factory.test.ts
```

Expected: decorator 不接受第二参数，Fastify config 不含该字段。

- [ ] **Step 3: 实现 route config**

```ts
export interface RouteDefinitionOptions {
  tenantServiceAccess?: TenantServiceRouteAccess;
}

export function createRouteDecorator(
  method: RouteDefinition["method"],
  defaultAccess: TenantServiceRouteAccess,
) {
  return (path: string, options: RouteDefinitionOptions = {}): MethodDecorator => {
    // 保存 options.tenantServiceAccess ?? defaultAccess
  };
}
```

`registerRoutes` 和 `createResourceRoutes` 调用 Fastify 时传：

```ts
{ config: { tenantServiceAccess: route.tenantServiceAccess } }
```

在 `fastify.d.ts` 扩展 `FastifyContextConfig.tenantServiceAccess`。读取 helper 只接受 Domain 枚举，缺失时写方法安全回退 write、GET/HEAD 回退 read，并让门禁测试发现缺失。

- [ ] **Step 4: 运行 GREEN 并提交**

Run:

```bash
bun test apps/api/src/services/tenant-service-route-access.test.ts \
  apps/api/src/utils/decorators/route.test.ts \
  apps/api/src/routes/factory.test.ts
git add apps/api/src/types/fastify.d.ts apps/api/src/utils/decorators/route.ts \
  apps/api/src/routes/factory.ts apps/api/src/services/tenant-service-route-access* \
  apps/api/src/utils/decorators/route.test.ts apps/api/src/routes/factory.test.ts
git commit -m "feat(api): 标注租户路由访问类别"
```

### Task 5: 将授权入口切换到统一访问判定

**Files:**
- Modify: `apps/api/src/services/authorization/legacy-service.ts`
- Modify: `apps/api/src/services/authorization/legacy-service.test.ts`
- Modify: `apps/api/src/controllers/TenantBaseController.ts`
- Modify: `apps/api/src/controllers/billing-service-orders/index.ts`
- Modify: `apps/api/src/controllers/billing/index.ts`
- Modify: `apps/api/src/controllers/billing-recharge/index.ts`
- Modify: `apps/api/src/controllers/employee-permissions/index.ts`
- Modify: `apps/api/src/controllers/employee-self-service/index.ts`
- Modify: `apps/api/src/services/effective-branding.ts`
- Create: `apps/api/src/services/tenant-service-route-inventory.test.ts`

- [ ] **Step 1: 写授权矩阵 RED 测试**

覆盖 hard_blocked 拒绝 recovery、service_blocked 允许 recovery、grace 允许 read 拒绝 write、paid 允许 write，以及平台人员不进入租户服务判定。

- [ ] **Step 2: 修改授权 option**

```ts
export type GetRequiredAuthContextOptions = {
  tenantServiceAccess?: TenantServiceRouteAccess;
};
```

删除 `allowedWhenBillingLocked` 分支。`TenantBaseController` 使用 `getTenantServiceRouteAccess(request)`；billing 产品、订单、继续支付和取消接口显式标记 recovery。`effective-branding` 按其真实只读语义传 read，不保留布尔绕过。

- [ ] **Step 3: 建立路由清单门禁**

测试加载全部 controller/资源路由并断言：需要租户上下文的路由都有 route config；公开、visitor、平台和微信回调明确标记 `public_or_callback` 或不进入租户 guard。禁止只用 `rg allowedWhenBillingLocked` 代替运行时清单测试。

- [ ] **Step 4: 运行聚焦测试**

Run:

```bash
bun test apps/api/src/services/authorization/legacy-service.test.ts \
  apps/api/src/controllers/employee-permissions/billing-lock.test.ts \
  apps/api/src/controllers/employee-self-service/billing-lock.test.ts \
  apps/api/src/services/tenant-service-route-inventory.test.ts
rg -n "allowedWhenBillingLocked" apps/api/src
```

Expected: tests PASS；`rg` 无生产代码命中。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/services/authorization apps/api/src/controllers/TenantBaseController.ts \
  apps/api/src/controllers/billing-service-orders apps/api/src/controllers/billing \
  apps/api/src/controllers/billing-recharge apps/api/src/controllers/employee-permissions \
  apps/api/src/controllers/employee-self-service apps/api/src/services/effective-branding* \
  apps/api/src/services/tenant-service-route-inventory.test.ts
git commit -m "feat(auth): 统一租户服务访问门禁"
```

### Task 6: 接入支付、验收、退款和访问终止

**Files:**
- Modify: `apps/api/src/repositories/platform-service-orders.ts`
- Modify: `apps/api/src/repositories/platform-service-orders.test.ts`
- Modify: `apps/api/src/repositories/platform-service-fulfillment.ts`
- Modify: `apps/api/src/repositories/platform-service-fulfillment.test.ts`
- Modify: `apps/api/src/services/platform-service-order-payment-confirmation.ts`
- Modify: `apps/api/src/services/platform-service-order-payment-confirmation.test.ts`
- Modify: `apps/api/src/services/tenant-platform-service-order-acceptance.ts`
- Modify: `apps/api/src/services/tenant-platform-service-order-acceptance.test.ts`
- Create: `apps/api/src/services/platform-service-refund-execution.ts`
- Create: `apps/api/src/services/platform-service-refund-execution.test.ts`
- Modify: `apps/api/src/controllers/platform-service-refund-requests/index.ts`
- Create: `apps/api/src/controllers/platform-service-refund-requests/routes.test.ts`
- Modify: `apps/admin/components/platform-service-orders/platform-service-refund-actions.tsx`
- Modify: `apps/admin/components/platform-service-orders/platform-service-orders-page.test.ts`

- [ ] **Step 1: 写事务 adapter RED 测试**

断言支付确认返回 onboarding 事实，验收返回 contract/period，重复验收不新增 period；审核批准本身不终止访问；只有微信退款确认成功后才终止 onboarding/合同期，`service_status=canceled` 单独不终止访问。覆盖微信请求超时后查询成功、仍不确定时保持可重试，以及重复执行不重复变更合同。

- [ ] **Step 2: 实现 repository 结果校验**

RPC adapter 不使用裸 `as Record<string, unknown>` 作为最终边界；增加 Zod schema 校验：

```ts
const PaymentConfirmationResultSchema = z.object({
  order: z.object({ id: z.uuid(), payment_status: z.literal("paid") }),
  work_order: z.object({ id: z.uuid() }),
  access_mode: z.literal("paid_onboarding"),
  idempotent: z.boolean(),
});
```

- [ ] **Step 3: 实现技术服务退款执行 service**

参考已有 `platform-billing-recharge-refund-execution.ts`，但不要复制其 repository：执行 service 查询并校验原微信交易、使用订单支付配置调用 `WechatPayGateway.requestRefund()`，网络不确定时按商户退款单号查询，只有微信返回成功终态才调用 `platform_service_confirm_refund`。执行入口为 `POST /platform/billing/service-refund-requests/:id/execute`；controller 只解析请求并校验 `platform.service_refund.review`，service 编排外部调用，repository 调 RPC，错误全部通过 error-factory 包装。

- [ ] **Step 4: 增加 Admin 执行交互**

退款操作区仅在申请已批准且未完成时显示“执行退款”；按钮有稳定 loading 区域、成功/失败 toast 和刷新详情。微信状态不确定时保留订单访问并提示可重试，禁止把“审核通过”展示为“退款成功”。

- [ ] **Step 5: 运行 GREEN 并提交**

Run:

```bash
bun test apps/api/src/repositories/platform-service-orders.test.ts \
  apps/api/src/repositories/platform-service-fulfillment.test.ts \
  apps/api/src/services/platform-service-order-payment-confirmation.test.ts \
  apps/api/src/services/tenant-platform-service-order-acceptance.test.ts \
  apps/api/src/services/platform-service-refund-execution.test.ts \
  apps/api/src/controllers/platform-service-refund-requests/routes.test.ts \
  apps/admin/components/platform-service-orders/platform-service-orders-page.test.ts
git add apps/api/src/repositories/platform-service-orders* \
  apps/api/src/repositories/platform-service-fulfillment* \
  apps/api/src/services/platform-service-order-payment-confirmation* \
  apps/api/src/services/tenant-platform-service-order-acceptance* \
  apps/api/src/services/platform-service-refund-execution* \
  apps/api/src/controllers/platform-service-refund-requests \
  apps/admin/components/platform-service-orders/platform-service-refund-actions.tsx \
  apps/admin/components/platform-service-orders/platform-service-orders-page.test.ts
git commit -m "feat(service): 串联支付验收退款与正式访问"
```

### Task 7: 生成数据库类型并完成发布前验证

**Files:**
- Modify: `apps/api/src/types/database.ts`
- Create: `apps/api/src/scripts/platform-service-access-smoke.ts`
- Create: `apps/api/src/scripts/platform-service-access-smoke.test.ts`

- [ ] **Step 1: 在 Colima 隔离空库应用 migration**

Run:

```bash
colima status
supabase start
supabase db reset
supabase migration list --local
```

Expected: 全部 migration 从空库成功应用；不连接 `/Users/leefo/Public/work/gooes/.env` 的远端开发库。

- [ ] **Step 2: 重新生成类型**

Run: `supabase gen types typescript --local > apps/api/src/types/database.ts`

Expected: 新合同表、订单字段和 RPC 均进入生成类型。

- [ ] **Step 3: 写并运行本地 smoke**

smoke 创建隔离租户和订单，依次验证 paid onboarding、accepted contract、续费顺延、全额退款终止、hard block 和 service block；所有 fixture 在事务或专用清理函数中删除。

Run:

```bash
bun test apps/api/src/scripts/platform-service-access-smoke.test.ts
bun --cwd apps/api src/scripts/platform-service-access-smoke.ts
```

Expected: `ok=true`，无敏感数据输出。

- [ ] **Step 4: 运行完整静态门禁**

Run:

```bash
bun run api:typecheck
bun run api:build
bun run api:check-file-size
bun run check:permission-boundaries
bun test apps/api/src/services/tenant-service-access.test.ts \
  apps/api/src/services/tenant-service-route-inventory.test.ts
git diff --check
```

Expected: 全部退出码 0。

- [ ] **Step 5: 提交生成类型与 smoke**

```bash
git add apps/api/src/types/database.ts apps/api/src/scripts/platform-service-access-smoke*
git commit -m "test(service): 验证正式服务访问闭环"
```

### Task 8: PR、开发库 migration 和 dev smoke

**Files:**
- Verify: all files in this plan

- [ ] **Step 1: 请求代码审查并修复问题**

使用 `superpowers:requesting-code-review`，重点审查支付确认、合同期顺延、退款重算、route inventory 和 hard block。每个修复先增加失败测试再改实现。

- [ ] **Step 2: 创建 PR**

```bash
git push -u origin feat/platform-service-access-foundation
gh pr create --base main --head feat/platform-service-access-foundation \
  --title "feat(service): 建立平台技术服务访问基础" \
  --body "建立正式合同期、paid_onboarding 与统一租户服务访问门禁；验证详见实施计划。"
```

Expected: CI 全绿后 Squash merge，不跳过 migration history 检查。

- [ ] **Step 3: 使用开发数据库应用 migration**

只在 PR 合并并确认 `/Users/leefo/Public/work/gooes/.env` 为 dev 后执行：

```bash
set -a
source /Users/leefo/Public/work/gooes/.env
set +a
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
supabase db push --db-url "$SUPABASE_DB_DIRECT_URL"
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
```

Expected: Local/Remote 对齐；禁止 `supabase db reset` 远端开发库。

- [ ] **Step 4: dev 真实 smoke**

使用一张 ¥0.01 专用技术服务订单验证支付后 `paid_onboarding`、验收后合同期、重复回调不重复工单/period；退款验证使用独立订单。只记录订单 ID、状态、Request-ID 和 migration 版本，不记录 token/openid。
