# 平台技术服务客户验收三期 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use `test-driven-development` before code changes, `coding-standards` for TypeScript changes, and `verification-before-completion` before commit or PR.

**Goal:** 为 Orange 小程序员工端提供平台技术服务客户验收接口，支持读取验收资料、确认验收和要求整改，并保证工单、订单、验收准备和审计事件原子一致。

**Architecture:** 继续使用 `BillingServiceOrdersController` 作为租户员工侧入口，业务编排放在 `TenantPlatformServiceOrderService`，Supabase 访问放在 `platform-service-orders` repository。客户验收写操作新增专用 migration RPC，避免跨表两步更新导致状态不一致；读取接口复用二期履约表并按租户隔离。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL migration/RPC、`@gooes/domain`

---

## Scope

实现本期：

- `GET /billing/service-orders/:id/acceptance`
- `POST /billing/service-orders/:id/acceptance/confirm`
- `POST /billing/service-orders/:id/acceptance/reject`
- 员工端 tenant 鉴权和权限复用：读取需要 `billing.service_order.read`，确认/驳回需要 `billing.service_order.create` 或后续独立权限扩展前的系统管理员角色权限。
- 返回订单、工单、验收准备、履约记录、附件和 `available_actions`。
- 写操作必须携带 `expected_work_order_version`，并由数据库 RPC 原子完成。
- 更新小程序 handoff 文档，把建议接口改为 dev 已发布契约。

不实现本期：

- 微信发货信息管理上报；
- 微信退款实际出款；
- 客户门户/业主 token；
- 小程序代码改动；
- 新文件上传引擎；
- Admin UI 新增交互。

## Files

- Modify: `supabase/migrations/20260804170000_create_platform_service_customer_acceptance.sql`
- Modify: `apps/api/src/services/platform-service-fulfillment-migration-contract.test.ts`
- Modify: `apps/api/src/schema/billing-service-orders.ts`
- Modify: `apps/api/src/schema/billing-service-orders.test.ts`
- Modify: `apps/api/src/repositories/platform-service-order-records.ts`
- Modify: `apps/api/src/repositories/platform-service-orders.ts`
- Modify: `apps/api/src/repositories/platform-service-orders.test.ts`
- Modify: `apps/api/src/services/tenant-platform-service-orders.ts`
- Modify: `apps/api/src/services/tenant-platform-service-orders.test.ts`
- Modify: `apps/api/src/controllers/billing-service-orders/index.ts`
- Modify: `apps/api/src/controllers/billing-service-orders/routes.test.ts`
- Modify: `docs/miniprogram/2026-08-04-platform-service-fulfillment-admin-handoff.md`
- Create: `docs/miniprogram/2026-08-04-platform-service-customer-acceptance-handoff.md`

## Business Rules

- 只有当前租户员工可以读取本租户订单验收资料。
- 订单必须 `payment_status = paid`，工单必须存在。
- 只有工单 `status = awaiting_acceptance` 且验收准备 `status = submitted` 时允许确认或驳回。
- 确认验收：
  - 工单 `awaiting_acceptance -> accepted`
  - 订单 `service_status -> accepted`
  - 验收准备 `status -> accepted`
  - 写 `tenant_service_work_order_events.action = customer_accept`
- 要求整改：
  - 工单 `awaiting_acceptance -> rectifying`
  - 订单 `service_status -> rectifying`
  - 验收准备 `status -> rejected`
  - 写 `tenant_service_work_order_events.action = customer_reject`
- 版本不匹配返回稳定错误码 `SERVICE_WORK_ORDER_VERSION_CONFLICT`。
- 状态不允许返回稳定错误码 `SERVICE_ACCEPTANCE_INVALID_STATE`。
- 重复确认/重复驳回不创建重复事件；本期返回稳定 409，Orange 按“请刷新状态”处理。

## Task 1: migration 契约与原子 RPC

**Files:**

- Modify: `apps/api/src/services/platform-service-fulfillment-migration-contract.test.ts`
- Create: `supabase/migrations/20260804170000_create_platform_service_customer_acceptance.sql`

- [ ] **Step 1: 写失败测试**

在 migration contract 测试中增加断言：

```ts
expect(sql).toContain("CREATE OR REPLACE FUNCTION public.tenant_service_decide_acceptance");
expect(sql).toContain("p_decision text");
expect(sql).toContain("SERVICE_WORK_ORDER_VERSION_CONFLICT");
expect(sql).toContain("SERVICE_ACCEPTANCE_INVALID_STATE");
expect(sql).toContain("customer_accept");
expect(sql).toContain("customer_reject");
expect(sql).toContain("UPDATE public.tenant_service_acceptance_preparations");
expect(sql).not.toContain("DROP TABLE public.tenant_service_orders");
```

- [ ] **Step 2: 运行并确认失败**

Run:

```bash
bun test apps/api/src/services/platform-service-fulfillment-migration-contract.test.ts
```

Expected：FAIL，原因是新 migration/RPC 尚不存在。

- [ ] **Step 3: 实现 migration**

新增 `tenant_service_decide_acceptance(...) RETURNS jsonb`：

```sql
p_service_order_id uuid,
p_decision text,
p_expected_work_order_version integer,
p_operator_employee_id uuid,
p_remark text DEFAULT NULL,
p_metadata jsonb DEFAULT '{}'::jsonb
```

函数必须 `FOR UPDATE` 锁定订单、工单和验收准备，校验租户关系、支付状态、工单状态、验收准备状态和版本，然后一次事务内更新三张表并写事件。

- [ ] **Step 4: 运行 migration 契约测试**

Run:

```bash
bun test apps/api/src/services/platform-service-fulfillment-migration-contract.test.ts
```

Expected：PASS。

## Task 2: schema 与路由契约

**Files:**

- Modify: `apps/api/src/schema/billing-service-orders.ts`
- Modify: `apps/api/src/schema/billing-service-orders.test.ts`
- Modify: `apps/api/src/controllers/billing-service-orders/index.ts`
- Modify: `apps/api/src/controllers/billing-service-orders/routes.test.ts`

- [ ] **Step 1: 写 schema 失败测试**

覆盖：

```ts
ServiceAcceptanceDecisionSchema.parse({
  expected_work_order_version: 5,
  remark: "确认验收通过",
});
```

以及非法版本、空白驳回原因、超长备注。

- [ ] **Step 2: 实现 schema**

新增：

```ts
export const ServiceAcceptanceDecisionSchema = z.object({
  expected_work_order_version: z.number().int().positive("工单版本必须大于 0"),
  remark: z.string().trim().max(500, "备注不能超过 500 个字符").optional(),
}).strict();
```

- [ ] **Step 3: 写 route 失败测试**

断言 `BillingServiceOrdersController.registerExtraRoutes()` 包含：

```ts
{ method: "GET", path: "/billing/service-orders/:id/acceptance" }
{ method: "POST", path: "/billing/service-orders/:id/acceptance/confirm" }
{ method: "POST", path: "/billing/service-orders/:id/acceptance/reject" }
```

- [ ] **Step 4: 实现 controller**

Controller 只做：获取 billing allowed auth context、参数校验、body 校验、调用 service、`ResponseHandler.success`。

- [ ] **Step 5: 运行测试**

Run:

```bash
bun test apps/api/src/schema/billing-service-orders.test.ts \
  apps/api/src/controllers/billing-service-orders/routes.test.ts
```

Expected：PASS。

## Task 3: repository 读取聚合与 RPC 调用

**Files:**

- Modify: `apps/api/src/repositories/platform-service-order-records.ts`
- Modify: `apps/api/src/repositories/platform-service-orders.ts`
- Modify: `apps/api/src/repositories/platform-service-orders.test.ts`

- [ ] **Step 1: 写 repository 失败测试**

断言：

- `findAcceptanceViewByTenantAndOrderId` 查询 `tenant_service_orders` 时限定 `tenant_id`、`id`；
- 关联选择包含 `work_orders`、`acceptance_preparations`、`fulfillment_records` 和 `fulfillment_attachments`；
- `decideAcceptance` 调用 `tenant_service_decide_acceptance` 并传 `expected_work_order_version`、`decision`、`operator_employee_id`。

- [ ] **Step 2: 实现 repository**

新增方法：

```ts
findAcceptanceViewByTenantAndOrderId(input: { tenantId: string; orderId: string })
decideAcceptance(input: {
  tenantId: string;
  serviceOrderId: string;
  decision: "accepted" | "rejected";
  expectedWorkOrderVersion: number;
  operatorEmployeeId: string;
  remark?: string;
})
```

- [ ] **Step 3: 运行 repository 测试**

Run:

```bash
bun test apps/api/src/repositories/platform-service-orders.test.ts
```

Expected：PASS。

## Task 4: tenant service 编排和视图

**Files:**

- Modify: `apps/api/src/services/tenant-platform-service-orders.ts`
- Modify: `apps/api/src/services/tenant-platform-service-orders.test.ts`

- [ ] **Step 1: 写 service 失败测试**

覆盖：

- 租户员工可读取本租户验收资料；
- 无读取权限拒绝；
- `awaiting_acceptance + submitted` 返回 accept/reject enabled；
- 非待验收状态返回 disabled action；
- 确认验收调用 repository `decision=accepted`；
- 要求整改调用 repository `decision=rejected`；
- 版本冲突映射到 `SERVICE_WORK_ORDER_VERSION_CONFLICT`。

- [ ] **Step 2: 实现 service**

新增：

```ts
getAcceptance(authContext, orderId)
confirmAcceptance(authContext, orderId, input)
rejectAcceptance(authContext, orderId, input)
```

并复用现有 `assertCanRead`、`assertCanCreate`、`requireEmployee`。

- [ ] **Step 3: 运行 service 测试**

Run:

```bash
bun test apps/api/src/services/tenant-platform-service-orders.test.ts
```

Expected：PASS。

## Task 5: 小程序 handoff 和完整验证

**Files:**

- Modify: `docs/miniprogram/2026-08-04-platform-service-fulfillment-admin-handoff.md`
- Create: `docs/miniprogram/2026-08-04-platform-service-customer-acceptance-handoff.md`

- [ ] **Step 1: 更新 handoff**

写明三期最终接口、鉴权、请求/响应、错误码、脱敏回传字段、真机 smoke 清单。

- [ ] **Step 2: 运行最小验证**

Run:

```bash
bun test apps/api/src/services/platform-service-fulfillment-migration-contract.test.ts \
  apps/api/src/schema/billing-service-orders.test.ts \
  apps/api/src/controllers/billing-service-orders/routes.test.ts \
  apps/api/src/repositories/platform-service-orders.test.ts \
  apps/api/src/services/tenant-platform-service-orders.test.ts
bun run api:typecheck
bun scripts/check-api-file-size.ts
```

Expected：全部 PASS。

- [ ] **Step 3: 提交**

Commit:

```bash
git add supabase/migrations/20260804170000_create_platform_service_customer_acceptance.sql \
  apps/api/src/services/platform-service-fulfillment-migration-contract.test.ts \
  apps/api/src/schema/billing-service-orders.ts \
  apps/api/src/schema/billing-service-orders.test.ts \
  apps/api/src/repositories/platform-service-order-records.ts \
  apps/api/src/repositories/platform-service-orders.ts \
  apps/api/src/repositories/platform-service-orders.test.ts \
  apps/api/src/services/tenant-platform-service-orders.ts \
  apps/api/src/services/tenant-platform-service-orders.test.ts \
  apps/api/src/controllers/billing-service-orders/index.ts \
  apps/api/src/controllers/billing-service-orders/routes.test.ts \
  docs/miniprogram/2026-08-04-platform-service-fulfillment-admin-handoff.md \
  docs/miniprogram/2026-08-04-platform-service-customer-acceptance-handoff.md \
  docs/superpowers/plans/2026-08-04-platform-service-customer-acceptance.md
git commit -m "feat(billing): 增加平台服务客户验收接口"
```

## Self-review

- Spec coverage：覆盖客户侧读取、确认、驳回、附件展示、版本冲突、状态校验和小程序 handoff。
- Boundary：不修改 Orange，不碰虚拟支付，不改变平台支付通道，不实现微信发货。
- Data integrity：写操作通过新增 RPC 原子更新，避免工单与验收准备状态不一致。
- Performance：读取详情为单订单聚合查询；无列表接口新增，不涉及无分页列表。
