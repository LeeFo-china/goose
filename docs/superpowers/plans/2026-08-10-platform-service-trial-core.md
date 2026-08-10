# 平台技术服务试用核心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付装企申请、平台审批/主动开通、30 天试用、7 天只读宽限期、转正式归因和 Admin 完整管理闭环。

**Architecture:** 独立 trial aggregate 保存规则快照和有效状态，Supabase RPC 在企业身份锁、租户锁、幂等和乐观锁下执行命令；Fastify 保持 controller/service/repository 分层，并复用前置计划的统一访问判定。Admin 在平台技术服务现有页面增加第四个 Tab，通过 `available_actions` 驱动操作。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL、Next.js 15、React 19、shadcn/Radix、Tailwind。

**Prerequisite:** `docs/superpowers/plans/2026-08-10-platform-service-access-foundation.md` 已 Squash merge，并在 dev 通过正式服务访问 smoke。

**Approved design:** `docs/superpowers/specs/2026-08-10-platform-service-trial-management-design.md`

---

## File Map

- `packages/domain/src/platform-service-trial.ts`：试用状态、来源、类型、scope 和动作契约。
- `packages/domain/src/permission.ts`：租户和平台试用权限。
- `apps/api/src/schema/service-trials.ts`：租户申请、平台命令、列表和规则 schema。
- `supabase/migrations/20260810200000_create_platform_service_trials.sql`：规则、试用、事件、命令、约束、索引、权限和 RPC。
- `apps/api/src/repositories/service-trials.ts`：唯一数据库访问层。
- `apps/api/src/services/tenant-service-trials.ts`：租户查询、申请和撤回。
- `apps/api/src/services/platform-service-trials.ts`：平台查询、主动开通、审核、延期、撤销、分配和规则。
- `apps/api/src/controllers/billing-service-trials/index.ts`：租户 HTTP 路由。
- `apps/api/src/controllers/platform-service-trials/index.ts`：平台 HTTP 路由。
- `apps/api/src/services/tenant-service-access.ts`：加入 active trial 和 grace 判定。
- `apps/api/src/services/tenant-platform-service-orders.ts`：订单创建固化 `source_trial_id`。
- `apps/api/src/services/platform-service-order-payment-confirmation.ts`：支付确认归因试用。
- `apps/admin/components/platform-service-trials/*`：列表、筛选、详情和操作表单。
- `apps/admin/app/(console)/platform/service-orders/page.tsx`：第四个 Tab。
- `apps/admin/app/(console)/platform/service-orders/loading.tsx`：同步骨架屏。

### Task 1: 定义权限、Domain 和 HTTP schema

**Files:**
- Create: `packages/domain/src/platform-service-trial.ts`
- Create: `packages/domain/src/platform-service-trial.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/permission.ts`
- Modify: `packages/domain/src/permission.test.ts`
- Create: `apps/api/src/schema/service-trials.ts`
- Create: `apps/api/src/schema/service-trials.test.ts`

- [ ] **Step 1: 写 Domain/权限 RED 测试**

```ts
expect(PLATFORM_SERVICE_TRIAL_STATUS_VALUES).toEqual([
  "pending_review", "scheduled", "active", "grace_period", "expired",
  "rejected", "withdrawn", "revoked", "converted",
]);
expect(PERMISSION_CODE_VALUES).toContain("billing.service_trial.apply");
expect(PERMISSION_CODE_VALUES).toContain("billing.service_trial.read");
expect(PERMISSION_CODE_VALUES).toContain("platform.service_trial.read");
expect(PERMISSION_CODE_VALUES).toContain("platform.service_trial.review");
expect(PERMISSION_CODE_VALUES).toContain("platform.service_trial.manage");
expect(PERMISSION_CODE_VALUES).toContain("platform.service_trial.override");
```

- [ ] **Step 2: 写 schema RED 测试**

覆盖：分页默认 1/20 最大 100、严格对象、UUID、手机号、人数/项目数、30/7 默认值不由前端补、`expected_version`、幂等键、审批 decision 联合、guided assignee、延期、撤销、规则整体替换。

- [ ] **Step 3: 运行 RED**

Run:

```bash
bun test packages/domain/src/platform-service-trial.test.ts \
  packages/domain/src/permission.test.ts \
  apps/api/src/schema/service-trials.test.ts
```

Expected: 新模块和权限不存在。

- [ ] **Step 4: 实现稳定 Domain**

```ts
export const PLATFORM_SERVICE_TRIAL_STATUS_VALUES = [
  "pending_review", "scheduled", "active", "grace_period", "expired",
  "rejected", "withdrawn", "revoked", "converted",
] as const;
export const PLATFORM_SERVICE_TRIAL_SOURCE_VALUES = [
  "tenant_application", "platform_grant",
] as const;
export const PLATFORM_SERVICE_TRIAL_TYPE_VALUES = ["standard", "guided"] as const;
export const PLATFORM_SERVICE_TRIAL_CAPABILITY_VALUES = [
  "core.projects",
  "core.customers",
  "core.employees",
  "core.workflows",
  "core.files",
  "core.notifications",
] as const;

export type PlatformServiceTrialScopeV1 = {
  version: 1;
  capabilities: Array<(typeof PLATFORM_SERVICE_TRIAL_CAPABILITY_VALUES)[number]>;
};
```

scope schema 只接受后端 allow-list 中的 capability，禁止任意字符串透传。

- [ ] **Step 5: 实现请求 schema**

导出：`ServiceTrialApplicationCreateSchema`、`ServiceTrialWithdrawSchema`、`PlatformServiceTrialListQuerySchema`、`PlatformServiceTrialGrantSchema`、`PlatformServiceTrialReviewSchema`、`PlatformServiceTrialExtendSchema`、`PlatformServiceTrialRevokeSchema`、`PlatformServiceTrialAssignSchema`、`PlatformServiceTrialPolicyUpdateSchema`。

- [ ] **Step 6: 运行 GREEN 并提交**

Run:

```bash
bun test packages/domain/src/platform-service-trial.test.ts \
  packages/domain/src/permission.test.ts apps/api/src/schema/service-trials.test.ts
git add packages/domain/src/platform-service-trial* packages/domain/src/index.ts \
  packages/domain/src/permission* apps/api/src/schema/service-trials*
git commit -m "feat(trial): 定义试用权限与接口契约"
```

### Task 2: 用 migration 建立试用 aggregate 和原子命令

**Files:**
- Create: `apps/api/src/services/platform-service-trial-migration-contract.test.ts`
- Create: `supabase/migrations/20260810200000_create_platform_service_trials.sql`

- [ ] **Step 1: 写 migration RED 测试**

断言四个对象及 RPC：

```ts
expect(sql).toContain("CREATE TABLE public.platform_service_trial_policies");
expect(sql).toContain("CREATE TABLE public.tenant_service_trials");
expect(sql).toContain("CREATE TABLE public.tenant_service_trial_events");
expect(sql).toContain("CREATE TABLE public.tenant_service_trial_commands");
expect(sql).toContain("service_trial_apply");
expect(sql).toContain("service_trial_review");
expect(sql).toContain("service_trial_grant");
expect(sql).toContain("service_trial_extend");
expect(sql).toContain("service_trial_revoke");
expect(sql).toContain("service_trial_assign");
expect(sql).toContain("service_trial_update_policy");
expect(sql).toContain("service_trial_platform_summary");
expect(sql).toContain("CREATE OR REPLACE FUNCTION public.platform_service_create_order");
expect(sql).toContain("CREATE OR REPLACE FUNCTION public.platform_service_confirm_payment");
expect(sql).toContain("pg_advisory_xact_lock");
```

同时断言 verified legal identity、effective status、企业摘要、scope_key 幂等、90 天结果、集合式 summary、部分唯一索引、RLS/FORCE RLS、权限 seed 和回滚注释。

RPC 必须稳定返回或映射：`SERVICE_TRIAL_NOT_FOUND`、`SERVICE_TRIAL_APPLICATION_PENDING`、`SERVICE_TRIAL_ACTIVE_EXISTS`、`SERVICE_TRIAL_FORMAL_SERVICE_ACTIVE`、`SERVICE_TRIAL_REAPPLY_COOLDOWN`、`SERVICE_TRIAL_ENTERPRISE_IDENTITY_REQUIRED`、`SERVICE_TRIAL_REPEAT_REQUIRES_OVERRIDE`、`SERVICE_TRIAL_ACTION_NOT_ALLOWED`、`SERVICE_TRIAL_VERSION_CONFLICT`、`SERVICE_TRIAL_IDEMPOTENCY_CONFLICT`、`SERVICE_TRIAL_EXTENSION_INVALID` 和 `SERVICE_TRIAL_ORDER_SOURCE_INVALID`。

- [ ] **Step 2: 运行 RED 并创建 migration**

Run:

```bash
bun test apps/api/src/services/platform-service-trial-migration-contract.test.ts
supabase migration new create_platform_service_trials
```

Expected: 先 FAIL，再生成 migration。

- [ ] **Step 3: 建立规则和试用表**

规则默认值：30 天、7 天、提醒 `[7,3,1]`、max 60/14、schedule 30、extension count 1/days 30、cooldown 30。standard/guided 默认 scope 均为 `core.projects/customers/employees/workflows/files/notifications`，guided 只增加运营跟进，不扩大功能。数据库硬约束试用不超过 365 天、宽限期不超过 30 天。

`tenant_service_trials` 必须有 `(id, tenant_id)` 唯一、`enterprise_identity_hash`、规则/scope 快照、version、转换订单和全部审计字段。

- [ ] **Step 4: 实现企业身份锁和 effective status**

RPC 从已核验租户营业执照事实读取统一社会信用代码，规范化后摘要；缺失返回 `SERVICE_TRIAL_ENTERPRISE_IDENTITY_REQUIRED`。按企业摘要和 tenant ID 取得 advisory lock，在锁内规范化过期状态再检查历史重复。

```sql
v_effective_status := CASE
  WHEN v_trial.status = 'scheduled' AND v_now >= v_trial.starts_at THEN 'active'
  WHEN v_trial.status = 'active' AND v_now >= v_trial.trial_ends_at
    AND v_now < v_trial.grace_ends_at THEN 'grace_period'
  WHEN v_trial.status IN ('active', 'grace_period')
    AND v_now >= v_trial.grace_ends_at THEN 'expired'
  ELSE v_trial.status
END;
```

- [ ] **Step 5: 实现命令幂等和状态机**

所有 RPC 先检查 `tenant_service_trial_commands(scope_key,idempotency_key)` 请求摘要；同键同请求返回保存结果，同键不同请求返回 conflict。状态更新和 event 同事务；平台命令验证 actor 是有效平台员工，租户命令验证 actor 属于同租户。

`service_trial_platform_summary` 一次聚合返回待审核、当前 active、7 天内到期、本月新增/通过/转正式；申请通过率只统计 `tenant_application`，转化率按进入 active 的 cohort，禁止 service 逐状态发起多次 count 查询。

- [ ] **Step 6: 实现权限 seed**

租户管理员默认获得 apply/read；`platform_admin` 获得四个平台权限；`platform_operations` 获得 read/review/manage，不获得 override。重复运行 migration 必须幂等。

- [ ] **Step 7: 补订单 FK 与唯一归因**

```sql
ALTER TABLE public.tenant_service_orders
  ADD CONSTRAINT tenant_service_orders_source_trial_tenant_fkey
  FOREIGN KEY (source_trial_id, tenant_id)
  REFERENCES public.tenant_service_trials(id, tenant_id);

CREATE UNIQUE INDEX tenant_service_orders_open_source_trial_unique
ON public.tenant_service_orders(source_trial_id)
WHERE source_trial_id IS NOT NULL AND payment_status <> 'closed';
```

同一 migration 必须扩展 `platform_service_create_order`：可选接收 `source_trial_id`，在数据库锁内校验同租户、试用有效且没有另一张未关闭来源订单；并扩展 `platform_service_confirm_payment`：只消费订单快照中的来源，正常时把该试用原子标记 `converted` 并写 event，重复回调返回同一结果，若来源已被其他订单转换则确认资金和工单但写 anomaly event，不回滚已成功支付。

- [ ] **Step 8: 运行 GREEN 并提交**

Run:

```bash
bun test apps/api/src/services/platform-service-trial-migration-contract.test.ts
git diff --check
git add apps/api/src/services/platform-service-trial-migration-contract.test.ts \
  supabase/migrations/*_create_platform_service_trials.sql
git commit -m "feat(db): 建立技术服务试用原子模型"
```

### Task 3: 实现 repository 与响应校验

**Files:**
- Create: `apps/api/src/repositories/service-trials.ts`
- Create: `apps/api/src/repositories/service-trials.test.ts`

- [ ] **Step 1: 写 RED 测试**

覆盖租户历史/当前、平台分页列表、summary、详情、规则查询和七个写 RPC。列表 `.range()`、exact count、必要字段、稳定 `created_at desc,id desc`；详情使用集合 relation，不 N+1。

- [ ] **Step 2: 运行 RED**

Run: `bun test apps/api/src/repositories/service-trials.test.ts`

- [ ] **Step 3: 实现 repository**

对外 port：

```ts
listTenantTrials(input: TenantTrialListInput): Promise<PageData<TrialRecord>>;
findCurrentTenantTrial(tenantId: string): Promise<TrialRecord | null>;
listPlatformTrials(input: PlatformTrialListInput): Promise<PageData<TrialListRecord>>;
getPlatformSummary(nowIso: string): Promise<TrialSummary>;
findTrialById(input: { id: string; tenantId?: string }): Promise<TrialDetailRecord | null>;
executeCommand(input: TrialCommandInput): Promise<TrialCommandResult>;
```

RPC envelope 用 Zod 验证；Postgres 自定义错误映射为 spec 中稳定错误码，其他错误使用 `Errors.dbError()`。

- [ ] **Step 4: 运行 GREEN 并提交**

```bash
bun test apps/api/src/repositories/service-trials.test.ts
git add apps/api/src/repositories/service-trials*
git commit -m "feat(api): 实现试用数据访问层"
```

### Task 4: 实现租户与平台 service

**Files:**
- Create: `apps/api/src/services/service-trial-views.ts`
- Create: `apps/api/src/services/tenant-service-trials.ts`
- Create: `apps/api/src/services/tenant-service-trials.test.ts`
- Create: `apps/api/src/services/platform-service-trials.ts`
- Create: `apps/api/src/services/platform-service-trials.test.ts`

- [ ] **Step 1: 写租户 service RED 测试**

覆盖 apply/read 权限、同租户、联系方式脱敏、当前 effective status、撤回 expected version、无企业身份、已有正式服务和 `available_actions`。

- [ ] **Step 2: 写平台 service RED 测试**

表驱动权限组合：review；review+manage 的 guided/assignee；review+override 的越界标准试用；manage 主动开通；manage+override 重复开通/延期/撤销/规则修改。

- [ ] **Step 3: 运行 RED**

Run:

```bash
bun test apps/api/src/services/tenant-service-trials.test.ts \
  apps/api/src/services/platform-service-trials.test.ts
```

- [ ] **Step 4: 实现 service 与 view**

controller 不参与权限组合。service 统一返回：

```ts
{
  trial: serializeServiceTrial(record, now),
  idempotent: result.idempotent,
  available_actions: buildTrialAvailableActions(record, permissions, now),
  server_time: now.toISOString(),
}
```

平台 list/summary 不在循环中查询租户或员工。拒绝无 `reason`、无 manage 的 guided/assignee 和无 override 的例外操作。

- [ ] **Step 5: 运行 GREEN 并提交**

```bash
bun test apps/api/src/services/tenant-service-trials.test.ts \
  apps/api/src/services/platform-service-trials.test.ts
git add apps/api/src/services/service-trial-views.ts \
  apps/api/src/services/tenant-service-trials* \
  apps/api/src/services/platform-service-trials*
git commit -m "feat(api): 实现试用申请审批服务"
```

### Task 5: 注册租户和平台路由

**Files:**
- Create: `apps/api/src/controllers/billing-service-trials/index.ts`
- Create: `apps/api/src/controllers/billing-service-trials/routes.test.ts`
- Create: `apps/api/src/controllers/platform-service-trials/index.ts`
- Create: `apps/api/src/controllers/platform-service-trials/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: 写路由 RED 测试**

断言以下全部路径、GET=read、租户申请/撤回=recovery、平台路由使用 PlatformBaseController 权限入口，controller 只做 Zod、service、ResponseHandler：

```text
GET  /billing/service-trials
GET  /billing/service-trials/current
GET  /billing/service-trials/applications/:id
POST /billing/service-trials/applications
POST /billing/service-trials/applications/:id/withdraw
GET  /platform/billing/service-trials
GET  /platform/billing/service-trials/summary
GET  /platform/billing/service-trials/:id
POST /platform/billing/service-trials
POST /platform/billing/service-trials/:id/review
POST /platform/billing/service-trials/:id/extend
POST /platform/billing/service-trials/:id/revoke
POST /platform/billing/service-trials/:id/assign
GET  /platform/billing/service-trial-policy
PUT  /platform/billing/service-trial-policy
```

- [ ] **Step 2: 运行 RED**

Run:

```bash
bun test apps/api/src/controllers/billing-service-trials/routes.test.ts \
  apps/api/src/controllers/platform-service-trials/routes.test.ts
```

- [ ] **Step 3: 实现 controller**

租户入口示例：

```ts
@Post("/billing/service-trials/applications", {
  tenantServiceAccess: "recovery",
})
async apply(request: FastifyRequest) {
  const context = await this.getRequiredTenantContext(request);
  const body = parseOrThrow(ServiceTrialApplicationCreateSchema, request.body);
  return ResponseHandler.success(await service().apply(context, body));
}
```

平台 controller 使用 `getRequiredPlatformStaffContext`，具体 AND 权限由 service 再校验。

- [ ] **Step 4: 注册并运行 GREEN**

```bash
bun test apps/api/src/controllers/billing-service-trials/routes.test.ts \
  apps/api/src/controllers/platform-service-trials/routes.test.ts \
  apps/api/src/services/tenant-service-route-inventory.test.ts
git add apps/api/src/controllers/billing-service-trials \
  apps/api/src/controllers/platform-service-trials apps/api/src/routes/index.ts
git commit -m "feat(api): 暴露试用管理路由"
```

### Task 6: 接入访问判定和正式订单归因

**Files:**
- Modify: `apps/api/src/repositories/tenant-service-access.ts`
- Modify: `apps/api/src/repositories/tenant-service-access.test.ts`
- Modify: `apps/api/src/services/tenant-service-access.ts`
- Modify: `apps/api/src/services/tenant-service-access.test.ts`
- Create: `apps/api/src/services/tenant-service-capability-map.ts`
- Create: `apps/api/src/services/tenant-service-capability-map.test.ts`
- Modify: `apps/api/src/schema/billing-service-orders.ts`
- Modify: `apps/api/src/schema/billing-service-orders.test.ts`
- Modify: `apps/api/src/services/tenant-platform-service-orders.ts`
- Modify: `apps/api/src/services/tenant-platform-service-orders.test.ts`
- Modify: `apps/api/src/services/platform-service-order-payment-confirmation.ts`
- Modify: `apps/api/src/services/platform-service-order-payment-confirmation.test.ts`

- [ ] **Step 1: 写访问和归因 RED 测试**

覆盖 active trial 覆盖 legacy locked、grace read-only、expired service_blocked、hard block 优先、scope 外路由返回 `TENANT_SERVICE_CAPABILITY_NOT_INCLUDED`；订单 create 校验同租户 `source_trial_id`，并发第二张未关闭订单冲突；支付确认同订单幂等、历史归因冲突不回滚付款。

- [ ] **Step 2: 扩展订单 schema**

```ts
source_trial_id: z.uuid("试用来源格式不正确").optional(),
```

- [ ] **Step 3: 建立 capability 路由映射**

`tenant-service-capability-map.ts` 将租户业务路由前缀映射为六个 v1 capability；billing/service-trials/auth 使用 recovery/session，不进入 capability。测试读取路由 inventory，断言所有 read/write 租户路由都有且只有一个 capability，支付配置、平台设置和独立增值权益明确排除在试用范围外。

- [ ] **Step 4: 实现访问和订单绑定**

repository 在统一访问查询中加入当前有效试用；service 按数据库时间解析 active/grace。创建订单 RPC 接收 `source_trial_id` 并在数据库锁内校验状态、tenant 和唯一索引。

- [ ] **Step 5: 扩展支付确认 RPC adapter**

支付回调只消费订单快照来源；service/repository 解析 migration 中 `platform_service_confirm_payment` 的 trial conversion 结果，已同订单转换为 idempotent，异常绑定其他订单时保持付款确认成功并暴露可审计 anomaly，不在 TypeScript 中另做非原子状态更新。

- [ ] **Step 6: 运行 GREEN 并提交**

```bash
bun test apps/api/src/repositories/tenant-service-access.test.ts \
  apps/api/src/services/tenant-service-access.test.ts \
  apps/api/src/services/tenant-service-capability-map.test.ts \
  apps/api/src/schema/billing-service-orders.test.ts \
  apps/api/src/services/tenant-platform-service-orders.test.ts \
  apps/api/src/services/platform-service-order-payment-confirmation.test.ts
git add apps/api/src/repositories/tenant-service-access* \
  apps/api/src/services/tenant-service-access* \
  apps/api/src/services/tenant-service-capability-map* \
  apps/api/src/schema/billing-service-orders* \
  apps/api/src/services/tenant-platform-service-orders* \
  apps/api/src/services/platform-service-order-payment-confirmation*
git commit -m "feat(service): 串联试用访问与正式购买"
```

### Task 7: 实现 Admin 试用管理 Tab

**Files:**
- Create: `apps/admin/components/platform-service-trials/platform-service-trial-types.ts`
- Create: `apps/admin/components/platform-service-trials/platform-service-trial-rules.ts`
- Create: `apps/admin/components/platform-service-trials/platform-service-trial-filters.tsx`
- Create: `apps/admin/components/platform-service-trials/platform-service-trial-table.tsx`
- Create: `apps/admin/components/platform-service-trials/platform-service-trial-detail.tsx`
- Create: `apps/admin/components/platform-service-trials/platform-service-trial-action-dialog.tsx`
- Create: `apps/admin/components/platform-service-trials/platform-service-trial-policy-dialog.tsx`
- Create: `apps/admin/components/platform-service-trials/platform-service-trials-page.test.ts`
- Modify: `apps/admin/app/(console)/platform/service-orders/page.tsx`
- Modify: `apps/admin/app/(console)/platform/service-orders/loading.tsx`
- Modify: `apps/admin/components/platform-service-orders/platform-service-order-rules.ts`

- [ ] **Step 1: 写页面 RED 测试**

断言第四个 Tab、四项紧凑指标、筛选、分页、权限、右侧 Sheet、动作 Dialog、规则入口、成功/失败提示及 loading 第四个 Tab 骨架。

- [ ] **Step 2: 运行 RED**

Run: `bun test apps/admin/components/platform-service-trials/platform-service-trials-page.test.ts`

- [ ] **Step 3: 实现类型与 query rules**

所有状态/动作类型从 `@gooes/domain` 导入；构建 URL 时保留 active tab 自己的 page/pageSize，切 Tab 不串用筛选状态。

- [ ] **Step 4: 实现列表与详情**

复用 `PlatformListPageShell`、现有 Tabs class、`Table`、`Sheet`、`Dialog`、`Badge`、`Skeleton` 和 `sonner`。详情按企业、申请、范围、期限、审计顺序；不嵌套多层 Card，不在按钮点击时插入导致布局跳动的临时块。

- [ ] **Step 5: 实现 action 和 policy 表单**

按钮由 `available_actions.enabled` 控制；disabled 展示后端 reason。请求期间按钮内 spinner 占固定尺寸，成功后刷新当前详情和列表；错误解析复用 Admin backend helper。

- [ ] **Step 6: 运行 GREEN、类型检查并提交**

```bash
bun test apps/admin/components/platform-service-trials/platform-service-trials-page.test.ts
pnpm --dir apps/admin check
git add apps/admin/components/platform-service-trials \
  apps/admin/app/'(console)'/platform/service-orders/page.tsx \
  apps/admin/app/'(console)'/platform/service-orders/loading.tsx \
  apps/admin/components/platform-service-orders/platform-service-order-rules.ts
git commit -m "feat(admin): 增加技术服务试用管理"
```

### Task 8: 数据库类型、隔离 smoke 和完整门禁

**Files:**
- Modify: `apps/api/src/types/database.ts`
- Create: `apps/api/src/scripts/platform-service-trial-smoke.ts`
- Create: `apps/api/src/scripts/platform-service-trial-smoke.test.ts`

- [ ] **Step 1: Colima 空库验证并生成类型**

```bash
supabase start
supabase db reset
supabase migration list --local
supabase gen types typescript --local > apps/api/src/types/database.ts
```

Expected: 全部 migration 成功；不读取远端 `.env`。

- [ ] **Step 2: 实现 smoke**

在隔离库覆盖申请、重复申请、审批、并发版本、scheduled、active、grace、expired、延期、撤销、企业跨租户重复、订单归因、支付转换和 hard block。使用固定时钟 RPC 参数或数据库事务时间 fixture，不修改系统时钟。

- [ ] **Step 3: 运行门禁**

```bash
bun test apps/api/src/scripts/platform-service-trial-smoke.test.ts
bun --cwd apps/api src/scripts/platform-service-trial-smoke.ts
bun run api:check
pnpm --dir apps/admin check
pnpm --dir apps/admin build
bun run check:permission-boundaries
git diff --check
```

Expected: 全部退出码 0，smoke `ok=true`，API/Admin 文件大小通过。

- [ ] **Step 4: 提交**

```bash
git add apps/api/src/types/database.ts apps/api/src/scripts/platform-service-trial-smoke*
git commit -m "test(trial): 验证试用授权核心闭环"
```

### Task 9: PR、开发库发布与交接

**Files:**
- Create: `docs/miniprogram/2026-08-10-platform-service-trial-core-handoff.md`

- [ ] **Step 1: 写 Orange 交接文档**

包含最终接口、权限、字段、`available_actions`、错误码、30/7 默认规则、source_trial_id、fixture 和脱敏异常回传格式。只写 Gooes 文档，不修改 Orange。

- [ ] **Step 2: 审查、PR 和 Squash merge**

使用 requesting-code-review，修复后运行 Task 8 门禁，再推送 `feat/platform-service-trial-core` 创建 PR。推荐 squash 标题：

```text
feat(trial): 增加平台技术服务试用管理
```

- [ ] **Step 3: 应用开发库 migration**

确认 `.env` 为 dev 后先 `migration list`，再 `db push`，最后再次 `migration list`。禁止远端 `db reset`，失败通过新的前向 migration 修复。

- [ ] **Step 4: dev fixture 和 API smoke**

准备 tenant application、platform grant、active、grace、expired、converted 六组隔离 fixture；验证列表分页、权限和 Admin 操作。功能开关保持仅 dev，生产不开放。
