# Employee Service Access Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让员工登录后的 `/employee/bootstrap` 返回统一 `service_access`，按后端权威状态进入工作台或服务状态承接页，避免 pending/scheduled/expired 被表现成登录或首页异常。

**Architecture:** 保留现有 bootstrap 单请求，将路由调整为 session 边界并在首页数据加载前调用统一服务访问摘要。数据库 access-facts RPC 在同一时钟快照内增加最近试用展示事实；现有访问判定仍决定合同、付费开通、试用、legacy 与 blocked 的优先级，新的纯 projector 只生成承接状态、文案和动作。

**Tech Stack:** Bun、TypeScript、Fastify decorators、Zod、Supabase/PostgreSQL migration、`@gooes/domain`、TDD。

---

## 文件结构

- `packages/domain/src/platform-service-access.ts`：共享 service access 状态、动作和响应类型。
- `packages/domain/src/platform-service-access.test.ts`：共享枚举与 schema 契约。
- `supabase/migrations/20260812071000_add_employee_service_access_bootstrap.sql`：原位替换 access-facts RPC，增加 bounded latest trial fact；实际执行时先用 `supabase migration new add_employee_service_access_bootstrap` 生成，并将本文路径同步为 CLI 返回的唯一文件名。
- `apps/api/src/repositories/tenant-service-access.ts`：严格解析 current/latest trial 与 DB server time。
- `apps/api/src/repositories/tenant-service-access.test.ts`：RPC envelope、兼容旧 envelope、绑定和脱敏测试。
- `apps/api/src/services/employee-service-access.ts`：纯 service_access projector 与编排 service。
- `apps/api/src/services/employee-service-access.test.ts`：完整状态矩阵与优先级测试。
- `apps/api/src/services/tenant-service-access.ts`：公开不重复查询的 access resolution 方法。
- `apps/api/src/controllers/employee-self-service/bootstrap-types.ts`：bootstrap 新增 required service_access。
- `apps/api/src/controllers/employee-self-service/bootstrap-handler.ts`：服务状态优先编排与 blocked short-circuit。
- `apps/api/src/controllers/employee-self-service/index.ts`：bootstrap route metadata 调整为 session。
- `apps/api/src/controllers/employee-self-service/service-access.test.ts`：真实 controller/bootstrap 契约与副作用测试。
- `apps/api/src/controllers/employee-self-service/billing-lock.test.ts`：旧 fixture 补真实 Fastify method/routeOptions，不放宽生产门禁。
- `apps/api/src/services/tenant-service-route-inventory.test.ts`：route inventory 更新为 session。
- `docs/2026-08-12-employee-service-access-miniprogram-handoff.md`：Orange 对接契约、字段映射与六账号 smoke。

### Task 1: 发布共享 service_access 契约

**Files:**
- Modify: `packages/domain/src/platform-service-access.ts`
- Modify: `packages/domain/src/platform-service-access.test.ts`

- [ ] **Step 1: 写失败的 Domain 契约测试**

```ts
expect(EMPLOYEE_SERVICE_ACCESS_STATUS_VALUES).toEqual([
  "workspace_available", "pending_review", "scheduled", "grace_period",
  "expired", "service_blocked", "hard_blocked",
]);
expect(EMPLOYEE_SERVICE_ACCESS_ACTION_VALUES).toEqual([
  "enter_workspace", "enter_readonly_workspace", "view_trial",
  "apply_trial", "purchase_service", "contact_platform", "refresh",
]);
expect(EmployeeServiceAccessSummarySchema.safeParse(validSummary).success)
  .toBe(true);
expect(EmployeeServiceAccessSummarySchema.safeParse({
  ...validSummary,
  can_enter_workspace: false,
  readonly: true,
}).success).toBe(false);
```

- [ ] **Step 2: 运行 RED**

Run: `cd packages/domain && bun test src/platform-service-access.test.ts`

Expected: FAIL，缺少 employee service access exports。

- [ ] **Step 3: 实现严格共享 schema**

在现有 access mode 类型旁新增状态/action 常量、类型和 strict Zod schema。用 `superRefine` 锁定：`readonly` 必须同时 `can_enter_workspace=true` 且 `access_level=read_only`；`workspace_available` 必须可进入；`grace_period` 必须只读；其他 blocked 状态不得进入。

- [ ] **Step 4: 运行 GREEN 与 Domain 类型检查**

Run: `cd packages/domain && bun test src/platform-service-access.test.ts && bunx tsc -p tsconfig.json --noEmit`

Expected: PASS，0 failures/0 type errors。

- [ ] **Step 5: 提交**

```bash
git add packages/domain/src/platform-service-access.ts packages/domain/src/platform-service-access.test.ts
git commit -m "feat(domain): 定义员工服务访问摘要"
```

### Task 2: 扩展数据库同一时钟访问事实

**Files:**
- Create via CLI: `supabase/migrations/20260812071000_add_employee_service_access_bootstrap.sql`
- Modify: `apps/api/src/repositories/tenant-service-access.ts`
- Modify: `apps/api/src/repositories/tenant-service-access.test.ts`
- Create: `apps/api/src/services/employee-service-access-migration-contract.test.ts`

- [ ] **Step 1: 用 CLI 创建 migration**

Run: `supabase migration new add_employee_service_access_bootstrap`

Expected: 只生成一个晚于 `20260812032820` 的 migration。若实际时间戳不同，立即将本计划中的 migration 路径替换成 CLI 输出路径。

- [ ] **Step 2: 写 migration/repository RED**

契约测试必须断言：函数签名仍为 `platform_service_trial_access_facts(uuid)`；只有一个 MATERIALIZED clock；latest trial 按 `created_at DESC, id DESC LIMIT 1`；service_role-only ACL；无动态 SQL。repository 测试必须覆盖 pending_review、scheduled、expired、converted，旧 envelope 缺 `latest_trial` 时归一为 null，以及跨租户/partial time/raw error 失败。

```ts
expect(await repository.getAccessFacts({ tenantId })).toMatchObject({
  evaluatedAt: now,
  latestTrial: {
    id: trialId,
    tenant_id: tenantId,
    status: "pending_review",
  },
});
```

- [ ] **Step 3: 运行 RED**

Run: `cd apps/api && bun test src/repositories/tenant-service-access.test.ts src/services/employee-service-access-migration-contract.test.ts`

Expected: FAIL，RPC envelope 和 parser 均无 latest trial。

- [ ] **Step 4: 实现 migration**

复制当前函数完整定义并只增加：

```sql
, latest_trial_fact AS (
  SELECT jsonb_build_object(
    'id', trial.id,
    'tenant_id', trial.tenant_id,
    'status', CASE
      WHEN trial.status IN ('scheduled', 'active', 'grace_period')
        AND access_clock.server_time < trial.starts_at THEN 'scheduled'
      WHEN trial.status IN ('scheduled', 'active', 'grace_period')
        AND access_clock.server_time < trial.trial_ends_at THEN 'active'
      WHEN trial.status IN ('scheduled', 'active', 'grace_period')
        AND access_clock.server_time < trial.grace_ends_at THEN 'grace_period'
      WHEN trial.status IN ('scheduled', 'active', 'grace_period') THEN 'expired'
      ELSE trial.status
    END,
    'starts_at', trial.starts_at,
    'trial_ends_at', trial.trial_ends_at,
    'grace_ends_at', trial.grace_ends_at
  ) AS latest_trial
  FROM public.tenant_service_trials AS trial
  CROSS JOIN access_clock
  WHERE trial.tenant_id = p_tenant_id
  ORDER BY trial.created_at DESC, trial.id DESC
  LIMIT 1
)
```

顶层 JSON 增加 `latest_trial`。重新执行精确 revoke/grant；不得改变 current trial、合同、paid onboarding 或 legacy 查询。

- [ ] **Step 5: 实现严格 parser**

新增 `latestTrial` 最小类型。Zod 字段对部署过渡使用 `.optional()`，缺失归一为 null；存在时必须 strict、tenant 绑定、status 为 Domain enum，scheduled/active/grace/expired 时间事实完整且顺序合法，其他状态时间字段必须与数据库约束一致。所有 `{error}`、promise reject、malformed data 均 `Errors.dbError("查询租户服务访问事实失败")`，不传 raw details。

- [ ] **Step 6: 运行 GREEN**

Run: `cd apps/api && bun test src/repositories/tenant-service-access.test.ts src/services/employee-service-access-migration-contract.test.ts`

Expected: PASS。

- [ ] **Step 7: fresh reset 与 SQL smoke**

Run: `supabase db reset --local`

Run: `supabase migration list --local | tail -5`

Expected: reset exit 0，最新 migration Local/Remote 列对齐。事务 smoke 插入六种 trial 状态，调用 RPC 后验证 effective status，最后 ROLLBACK；authenticated/anon 无 execute，service_role 有 execute。

- [ ] **Step 8: 提交**

```bash
git add supabase/migrations apps/api/src/repositories/tenant-service-access.ts apps/api/src/repositories/tenant-service-access.test.ts apps/api/src/services/employee-service-access-migration-contract.test.ts
git commit -m "feat(db): 扩展员工服务访问事实"
```

### Task 3: 建立统一 bootstrap access projector

**Files:**
- Create: `apps/api/src/services/employee-service-access.ts`
- Create: `apps/api/src/services/employee-service-access.test.ts`
- Modify: `apps/api/src/services/tenant-service-access.ts`

- [ ] **Step 1: 写表驱动 RED**

每个 case 明确 facts、trial rollout、expected summary；至少覆盖 paid、paid_onboarding、legacy、active、grace、pending_review、scheduled、expired、rejected、withdrawn、revoked、converted valid、converted missing formal、hard block。断言正式事实优先于 latest pending/expired。

```ts
expect(await service.resolve({ tenantId, permissions })).toEqual({
  can_enter_workspace: false,
  readonly: false,
  access_mode: "service_blocked",
  access_level: "none",
  access_status: "pending_review",
  trial_id: trialId,
  trial_status: "pending_review",
  primary_action: {
    key: "view_trial",
    label: "查看申请进度",
    path: `/packageEmployees/pages/platformServiceTrialDetail/index?id=${trialId}`,
  },
  secondary_action: { key: "refresh", label: "刷新状态", path: null },
  evaluated_at: now,
});
```

- [ ] **Step 2: 运行 RED**

Run: `cd apps/api && bun test src/services/employee-service-access.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 消除重复查询并实现 projector**

在 `TenantServiceAccessService` 增加接收已查 facts 的公开方法：

```ts
resolveFactsForRoute(
  facts: TenantServiceAccessFacts,
  trialAccessEnabled: boolean,
  routeAccess: TenantServiceRouteAccess,
  requiredCapability?: PlatformServiceTrialCapability | null,
): TenantServiceAccessDecision
```

新的 `EmployeeServiceAccessService.resolve()` 只调用一次 repository，按是否存在 current/latest trial 获取 rollout 开关，再用现有 access decision 和纯 `projectEmployeeServiceAccess` 构建 schema-validated summary。动作路径只来自代码常量，不消费数据库 URL。apply action 只有具备 `billing.service_trial.apply` 且 rollout application enabled 时出现。

- [ ] **Step 4: 运行 GREEN 与旧 access 回归**

Run: `cd apps/api && bun test src/services/employee-service-access.test.ts src/services/tenant-service-access.test.ts`

Expected: PASS，旧 route matrix 不变。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/services/employee-service-access.ts apps/api/src/services/employee-service-access.test.ts apps/api/src/services/tenant-service-access.ts
git commit -m "feat(service): 统一员工服务访问摘要"
```

### Task 4: 接入 employee bootstrap 并短路 blocked 首页数据

**Files:**
- Modify: `apps/api/src/controllers/employee-self-service/index.ts`
- Modify: `apps/api/src/controllers/employee-self-service/bootstrap-handler.ts`
- Modify: `apps/api/src/controllers/employee-self-service/bootstrap-types.ts`
- Create: `apps/api/src/controllers/employee-self-service/service-access.test.ts`
- Modify: `apps/api/src/controllers/employee-self-service/billing-lock.test.ts`
- Modify: `apps/api/src/services/tenant-service-route-inventory.test.ts`

- [ ] **Step 1: 写 controller/bootstrap RED**

真实 Fastify route inventory 断言 `GET /employee/bootstrap` 为 session。注入假的 access service 与 home/task/personalization ports，覆盖：blocked 返回 service_access 且调用数全 0；grace 返回 readonly summary；paid 保留旧 response shape；cache/in-flight 重用一致 summary；hard block 能获得承接响应而不是门禁异常。

- [ ] **Step 2: 运行 RED**

Run: `cd apps/api && bun test src/controllers/employee-self-service/service-access.test.ts src/controllers/employee-self-service/billing-lock.test.ts src/services/tenant-service-route-inventory.test.ts`

Expected: FAIL，route 仍为 read 且 response 无 service_access。

- [ ] **Step 3: 调整 handler 依赖边界**

为 `EmployeeBootstrapHandlerOptions` 增加 injectable access resolver/home/task/personalization ports，默认仍使用生产 singleton。`resolveEmployeeBootstrap` 在权限断言前获得 summary。

```ts
const serviceAccess = await this.options.resolveServiceAccess(authContext);
if (!serviceAccess.can_enter_workspace) {
  return this.buildServiceAccessOnlyResponse(authContext, profile, serviceAccess, query);
}
```

blocked response 不调用 `prewarmDeferredHomeData`、`prewarmDeferredSummaryData`、home stats、task summary、personalization。profile 可返回现有安全身份字段；personalization 使用 `getEmptyPayload("employee_home")`。grace 允许 read 数据构建，但 summary readonly=true。

- [ ] **Step 4: 改 route metadata 和测试 fixture**

```ts
@Get("/employee/bootstrap", { tenantServiceAccess: "session" })
```

`billing-lock.test.ts` 的 request fixture 必须提供真实 `method: "GET"` 与 `/employee/bootstrap` routeOptions，不在生产 helper 增加 undefined fallback。inventory 期望从 read 改为 session。

- [ ] **Step 5: 运行 GREEN**

Run: `cd apps/api && bun test src/controllers/employee-self-service/service-access.test.ts src/controllers/employee-self-service/billing-lock.test.ts src/services/tenant-service-route-inventory.test.ts src/services/authorization/legacy-service.test.ts`

Expected: PASS。

- [ ] **Step 6: API 全门禁**

Run: `bun run api:check && bun run check:permission-boundaries`

Expected: typecheck/build/file-size/permission boundaries 全部 exit 0。

- [ ] **Step 7: 提交**

```bash
git add apps/api/src/controllers/employee-self-service apps/api/src/services/tenant-service-route-inventory.test.ts
git commit -m "feat(api): 在员工 bootstrap 承接服务状态"
```

### Task 5: 编写 Orange 正式交接文档

**Files:**
- Create: `docs/2026-08-12-employee-service-access-miniprogram-handoff.md`

- [ ] **Step 1: 写完整字段与导航契约**

文档必须包含 endpoint/method/auth、完整 JSON 示例、状态矩阵、action key 到 Orange 路径的映射、grace 明确确认流程、force refresh、旧后端兼容、错误码与 Request-ID 脱敏要求。

- [ ] **Step 2: 写只读影响清单**

明确列出 Orange 自行修改：

- `src/services/employee_bootstrap.ts`
- `src/services/auth_navigation.ts`
- `src/services/auth.ts`
- `src/app.config.ts`
- 新增 service access landing page 与 model/tests

声明 Gooes 未修改 Orange。

- [ ] **Step 3: 写六账号验收矩阵**

包含 19900009101～19900009106 的预期导航、文案、动作、只读写拒绝和 source_trial_id 正式购买链路。

- [ ] **Step 4: 文档自检并提交**

Run: `rg -n "TBD|TODO|token|OpenID|签名" docs/2026-08-12-employee-service-access-miniprogram-handoff.md`

Expected: 无占位符；token/OpenID 只出现在“禁止回传”安全说明。

```bash
git add docs/2026-08-12-employee-service-access-miniprogram-handoff.md
git commit -m "docs(service): 交接员工服务状态承接"
```

### Task 6: 最终真实验证与交付

**Files:**
- Verify all files from Tasks 1-5

- [ ] **Step 1: fresh 数据库验证**

Run: `supabase db reset --local`

Run: `supabase migration list --local | tail -5`

Expected: 所有 migration 重放成功，Local/Remote 对齐到本次 migration。

- [ ] **Step 2: 聚焦回归**

Run:

```bash
cd apps/api
bun test \
  src/repositories/tenant-service-access.test.ts \
  src/services/tenant-service-access.test.ts \
  src/services/employee-service-access.test.ts \
  src/services/employee-service-access-migration-contract.test.ts \
  src/controllers/employee-self-service/service-access.test.ts \
  src/controllers/employee-self-service/billing-lock.test.ts \
  src/services/authorization/legacy-service.test.ts \
  src/services/tenant-service-route-inventory.test.ts
```

Expected: 0 failures。

- [ ] **Step 3: 全静态门禁**

Run: `bun run api:check && bun run check:permission-boundaries && git diff --check`

Run: `cd packages/domain && bun test src/platform-service-access.test.ts && bunx tsc -p tsconfig.json --noEmit`

Expected: 全部 exit 0，手写文件不超过 500 行。

- [ ] **Step 4: 独立代码审查**

按 requesting-code-review 检查：session route 是否只暴露最小 blocked payload；RPC 是否单时钟/有界/service-role only；projector 是否正式事实优先；Orange handoff 是否不要求本地拼状态。

- [ ] **Step 5: 修复审查 findings 后 fresh 重跑**

任何 Critical/Important/合理 Minor 必须先写 RED，再修复并重跑 Task 6 Step 1-3。

- [ ] **Step 6: 最终提交状态**

Run: `git status --short --branch && git log --oneline origin/main..HEAD`

Expected: worktree clean；提交仅覆盖设计、Domain、migration、API 和 Gooes handoff 文档；Orange worktree 无变化。
