# 平台技术服务试用运营 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在试用核心闭环上增加幂等到期提醒、陪跑跟进任务和 Orange 真机联调。

**Architecture:** 跟进记录和通知投递使用独立追加事实；数据库 claim RPC 按批次领取到期提醒，现有 billing reconcile worker 调用试用运营 service，不新增队列或常驻进程。Admin 复用试用详情 Sheet 和核心阶段已经提供的紧凑指标。

**Tech Stack:** Bun、TypeScript、Fastify、Supabase/PostgreSQL、现有 Notifications service、Next.js 15、React 19、shadcn/Radix。

**Prerequisite:** `docs/superpowers/plans/2026-08-10-platform-service-trial-core.md` 已 Squash merge，并在 dev 完成试用 core smoke。

**Approved design:** `docs/superpowers/specs/2026-08-10-platform-service-trial-management-design.md`

---

## File Map

- `apps/api/src/schema/service-trial-followups.ts`：跟进列表、新增和状态请求。
- `supabase/migrations/20260810210000_create_platform_service_trial_operations.sql`：跟进、通知投递和 claim/complete RPC。
- `apps/api/src/repositories/service-trial-operations.ts`：跟进和提醒数据访问。
- `apps/api/src/services/platform-service-trial-operations.ts`：跟进权限和提醒编排。
- `apps/api/src/controllers/platform-service-trials/index.ts`：增加跟进路由。
- `apps/api/src/workers/billing-reconcile-worker.ts`：增加试用提醒 child，不影响其他 child。
- `apps/admin/components/platform-service-trials/platform-service-trial-detail.tsx`：跟进时间线和新增表单。
- `apps/admin/components/platform-service-trials/platform-service-trial-table.tsx`：到期提示。
- `docs/miniprogram/2026-08-10-platform-service-trial-handoff.md`：最终 Orange 契约与验收矩阵。

### Task 1: 定义跟进 schema 和通知事件

**Files:**
- Create: `apps/api/src/schema/service-trial-followups.ts`
- Create: `apps/api/src/schema/service-trial-followups.test.ts`
- Modify: `packages/domain/src/platform-service-trial.ts`
- Modify: `packages/domain/src/platform-service-trial.test.ts`

- [ ] **Step 1: 写 RED 测试**

覆盖 follow-up type、result、summary 长度、next_follow_up_at、分页最大 100、UUID 幂等键和严格对象；Domain 通知事件固定为 application_submitted/approved/rejected/extended/revoked/7d/3d/1d/grace/expired/converted。

- [ ] **Step 2: 运行 RED**

```bash
bun test apps/api/src/schema/service-trial-followups.test.ts \
  packages/domain/src/platform-service-trial.test.ts
```

- [ ] **Step 3: 实现类型与 schema**

```ts
export const SERVICE_TRIAL_FOLLOW_UP_TYPE_VALUES = [
  "phone", "wechat", "online_meeting", "onsite", "other",
] as const;
export const SERVICE_TRIAL_FOLLOW_UP_STATUS_VALUES = [
  "pending", "completed", "canceled",
] as const;
export const SERVICE_TRIAL_NOTIFICATION_EVENT_VALUES = [
  "application_submitted", "approved", "rejected", "extended", "revoked",
  "expires_in_7_days", "expires_in_3_days", "expires_in_1_day",
  "entered_grace", "expired", "converted",
] as const;
```

- [ ] **Step 4: 运行 GREEN 并提交**

```bash
bun test apps/api/src/schema/service-trial-followups.test.ts \
  packages/domain/src/platform-service-trial.test.ts
git add apps/api/src/schema/service-trial-followups* \
  packages/domain/src/platform-service-trial*
git commit -m "feat(trial): 定义试用跟进与通知契约"
```

### Task 2: 建立跟进和提醒 claim migration

**Files:**
- Create: `apps/api/src/services/platform-service-trial-operations-migration-contract.test.ts`
- Create: `supabase/migrations/20260810210000_create_platform_service_trial_operations.sql`

- [ ] **Step 1: 写 migration RED 测试**

断言 `tenant_service_trial_followups`、`tenant_service_trial_notification_deliveries`、到期/next follow-up 索引、claim/complete/fail RPC、RLS、service_role 和审计约束。

- [ ] **Step 2: 运行 RED 并创建 migration**

```bash
bun test apps/api/src/services/platform-service-trial-operations-migration-contract.test.ts
supabase migration new create_platform_service_trial_operations
```

- [ ] **Step 3: 建立跟进事实**

```sql
CREATE TABLE public.tenant_service_trial_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  follow_up_type text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  summary text NOT NULL,
  result text NOT NULL,
  next_follow_up_at timestamptz NULL,
  created_by_employee_id uuid NOT NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (trial_id, tenant_id)
    REFERENCES public.tenant_service_trials(id, tenant_id)
);
```

禁止 UPDATE 已完成跟进正文；取消待跟进使用受控状态命令并写事件。

- [ ] **Step 4: 建立幂等通知投递**

唯一键包含 `trial_id,event_type,target_date,recipient_employee_id`。事件触发函数把 applied/approved/rejected/extended/revoked/converted 写成待投递：申请提交发送给具备 review 的有效平台人员，其他事件发送给申请人、租户管理员和已分配跟进人并去重。时间任务为 7/3/1、grace、expired 生成待投递，日期从 trial policy snapshot 读取，不使用当前默认规则回算历史试用。

claim RPC 使用 `FOR UPDATE SKIP LOCKED`、lease token 和过期时间，批次最大 100；complete/fail 必须匹配 lease token。migration 不补发上线前已经发生的审批类历史通知，只为仍未到期的 active/grace 记录建立未来提醒，避免向旧 fixture 突然发送消息。

- [ ] **Step 5: 运行 GREEN 并提交**

```bash
bun test apps/api/src/services/platform-service-trial-operations-migration-contract.test.ts
git diff --check
git add apps/api/src/services/platform-service-trial-operations-migration-contract.test.ts \
  supabase/migrations/*_create_platform_service_trial_operations.sql
git commit -m "feat(db): 建立试用跟进与提醒事实"
```

### Task 3: 实现 operations repository/service

**Files:**
- Create: `apps/api/src/repositories/service-trial-operations.ts`
- Create: `apps/api/src/repositories/service-trial-operations.test.ts`
- Create: `apps/api/src/services/platform-service-trial-operations.ts`
- Create: `apps/api/src/services/platform-service-trial-operations.test.ts`

- [ ] **Step 1: 写 repository RED 测试**

覆盖跟进分页 `.range()`、必要字段、稳定排序、claim/complete/fail 参数和 Zod 响应。

- [ ] **Step 2: 写 service RED 测试**

覆盖 manage 权限、guided/standard 均可人工跟进、跨租户拒绝、通知成功、单条失败不阻断后续、日志脱敏、同一投递重跑幂等。

- [ ] **Step 3: 运行 RED**

```bash
bun test apps/api/src/repositories/service-trial-operations.test.ts \
  apps/api/src/services/platform-service-trial-operations.test.ts
```

- [ ] **Step 4: 实现 repository/service**

提醒编排接口：

```ts
runReminderBatch(input: { limit: number }): Promise<{
  claimed: number;
  sent: number;
  failed: number;
  errors: string[];
}>;
```

每条通知复用现有 `notifications` service；错误字符串只包含 delivery ID、稳定错误码和 Request-ID，不包含手机号或正文敏感字段。

- [ ] **Step 5: 运行 GREEN 并提交**

```bash
bun test apps/api/src/repositories/service-trial-operations.test.ts \
  apps/api/src/services/platform-service-trial-operations.test.ts
git add apps/api/src/repositories/service-trial-operations* \
  apps/api/src/services/platform-service-trial-operations*
git commit -m "feat(api): 实现试用运营编排"
```

### Task 4: 暴露跟进路由

**Files:**
- Modify: `apps/api/src/controllers/platform-service-trials/index.ts`
- Modify: `apps/api/src/controllers/platform-service-trials/routes.test.ts`
- Modify: `apps/api/src/services/platform-service-trials.ts`
- Modify: `apps/api/src/services/platform-service-trials.test.ts`

- [ ] **Step 1: 写路由 RED 测试**

新增：

```text
GET  /platform/billing/service-trials/:id/follow-ups?page=1&pageSize=20
POST /platform/billing/service-trials/:id/follow-ups
```

- [ ] **Step 2: 实现 controller/service 接线**

controller 只 parse/call/success；GET 需要 read，POST 需要 manage。

- [ ] **Step 3: 运行 GREEN 并提交**

```bash
bun test apps/api/src/controllers/platform-service-trials/routes.test.ts \
  apps/api/src/services/platform-service-trials.test.ts
git add apps/api/src/controllers/platform-service-trials \
  apps/api/src/services/platform-service-trials*
git commit -m "feat(api): 暴露试用跟进与统计接口"
```

### Task 5: 接入现有 billing reconcile worker

**Files:**
- Modify: `apps/api/src/workers/billing-reconcile-worker.ts`
- Modify: `apps/api/src/workers/billing-reconcile-worker.test.ts`
- Modify: `apps/api/src/workers/billing-reconcile-worker-partial-failure.test.ts`
- Modify: `apps/api/src/workers/billing-reconcile-worker-health.test.ts`

- [ ] **Step 1: 写 worker RED 测试**

断言 config 增加 `serviceTrialReminderBatchSize`，tick 调用 `runReminderBatch`；试用提醒失败不阻断 subscription/refund/virtual payment，健康证据仍在所有 child settle 后更新。

- [ ] **Step 2: 实现 worker child**

环境变量：

```text
BILLING_SERVICE_TRIAL_REMINDER_BATCH_SIZE=50
```

范围 1～100。使用动态 import 与现有 branding child 模式一致，禁止在 worker 顶层引入循环依赖。

- [ ] **Step 3: 运行 GREEN 并提交**

```bash
bun test apps/api/src/workers/billing-reconcile-worker.test.ts \
  apps/api/src/workers/billing-reconcile-worker-partial-failure.test.ts \
  apps/api/src/workers/billing-reconcile-worker-health.test.ts
git add apps/api/src/workers/billing-reconcile-worker*
git commit -m "feat(worker): 发送试用到期提醒"
```

### Task 6: 完善 Admin 运营交互

**Files:**
- Modify: `apps/admin/components/platform-service-trials/platform-service-trial-detail.tsx`
- Modify: `apps/admin/components/platform-service-trials/platform-service-trial-table.tsx`
- Create: `apps/admin/components/platform-service-trials/platform-service-trial-follow-up-form.tsx`
- Create: `apps/admin/components/platform-service-trials/platform-service-trial-follow-ups.tsx`
- Modify: `apps/admin/components/platform-service-trials/platform-service-trials-page.test.ts`

- [ ] **Step 1: 写 Admin RED 测试**

断言详情分页加载跟进、空状态、固定高度提交反馈、next follow-up、即将到期 badge、失败后保留表单和刷新详情。

- [ ] **Step 2: 实现交互**

复用本地 `Sheet`、`Dialog`、`Textarea`、`Select`、`Button`、`Skeleton`；跟进记录按时间线展示，不新增嵌套 Card。提交中按钮保留宽高，spinner 使用固定 `size-4` 容器。

- [ ] **Step 3: 运行检查并提交**

```bash
bun test apps/admin/components/platform-service-trials/platform-service-trials-page.test.ts
pnpm --dir apps/admin check
pnpm --dir apps/admin build
git add apps/admin/components/platform-service-trials
git commit -m "feat(admin): 完善试用跟进与指标"
```

### Task 7: 空库、dev、Orange 真机和收口

**Files:**
- Modify: `apps/api/src/types/database.ts`
- Create: `apps/api/src/scripts/platform-service-trial-operations-smoke.ts`
- Create: `apps/api/src/scripts/platform-service-trial-operations-smoke.test.ts`
- Create: `docs/miniprogram/2026-08-10-platform-service-trial-handoff.md`

- [ ] **Step 1: Colima 空库和类型**

```bash
supabase start
supabase db reset
supabase migration list --local
supabase gen types typescript --local > apps/api/src/types/database.ts
```

- [ ] **Step 2: 运营 smoke**

固定数据库时间 fixture 验证 7/3/1、grace、expired 每个通知只发送一次；单条失败可租约到期重试；跟进分页正确。

```bash
bun test apps/api/src/scripts/platform-service-trial-operations-smoke.test.ts
bun --cwd apps/api src/scripts/platform-service-trial-operations-smoke.ts
```

- [ ] **Step 3: 完整门禁**

```bash
bun run api:check
pnpm --dir apps/admin check
pnpm --dir apps/admin build
bun run check:permission-boundaries
git diff --check
```

- [ ] **Step 4: 写最终 Orange 交接**

文档包含申请、撤回、当前/历史、购买 `source_trial_id`、available_actions、提醒展示、hard/service blocked、fixture 和真机矩阵。禁止修改 `/Users/leefo/Public/work/orange`。

- [ ] **Step 5: PR 与开发库发布**

代码审查通过后创建 PR，推荐 squash 标题：

```text
feat(trial): 完善技术服务试用运营闭环
```

合并后确认 dev `.env`，执行 migration list → db push → migration list；禁止远端 reset。

- [ ] **Step 6: Orange 真机验收**

准备申请中、active、grace、expired、converted 和 hard_blocked 六组 fixture。Orange 验证入口、申请、撤回、倒计时、只读提示、购买跳转和转正式；异常只回传 HTTP、错误码、Request-ID、trial/order ID 和幂等键复用情况，不回传 token、openid、手机号或企业证照值。
