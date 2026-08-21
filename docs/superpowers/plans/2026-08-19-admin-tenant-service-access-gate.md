# Admin Tenant Service Access Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为租户 Admin 增加统一的服务访问门禁、准确的状态承接页、宽限期只读提示，以及可用的试用和正式购买恢复入口，消除各业务页重复显示通用 402 的问题。

**Architecture:** API 复用现有 `employeeServiceAccessService` 计算权威状态，再投影为不含小程序路径的 Admin 契约；Console Layout 只为租户会话预取该摘要，客户端 Shell 负责恢复路由白名单、URL 规范化和只读横幅，`requestBackendJson` 负责会话期间状态变化的 402/403 兜底。试用在 Admin 内调用现有 recovery API；正式购买通过已有小程序 URL Link 打开现有 JSAPI 选购支付页，Admin 不直接伪造 OpenID 或扩展支付领域模型。

**Tech Stack:** Bun、TypeScript、Fastify decorators、Zod、Supabase、Next.js 15 App Router、React 19、Tailwind、shadcn/Radix、Bun Test、Playwright。

---

## 实施边界与已核实前提

- 规格来源：`docs/superpowers/specs/2026-08-19-admin-tenant-service-access-gate-design.md`。
- 平台身份沿用 `isPlatformOnlySession(session)` 旁路，不由任意角色字符串推断。
- 服务状态只能来自 `GET /employee/service-access`，不得根据 402 文案、本地存储、手机号或租户名推断。
- `/billing/service-orders` 当前是微信小程序 JSAPI 支付：Admin JWT 没有 `openid`，数据库 `tenant_service_orders.payer_openid` 也为 `NOT NULL`。本计划不直接从 Admin 创建支付单。
- 正式购买复用 `wechatOpenLinkService.generateUrlLink()`，目标小程序页为 `packageEmployees/pages/platformServicePaymentSmoke/index`；orange 仓库只读，不做任何修改。
- 本计划不需要数据库 migration，不新增依赖，不改变现有 `session / recovery / read / write` 语义。
- 所有列表显式传 `page=1&pageSize=20`；所有提交正常执行 hooks，禁止 `--no-verify`。

## Task 1: 定义 Admin 服务访问共享契约

**Files:**

- Create: `packages/domain/src/admin-service-access.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/admin-service-access.test.ts`

- [ ] **Step 1: 先写契约失败测试**

覆盖以下行为：

```ts
expect(AdminTenantServiceAccessSchema.safeParse(validSummary).success).toBe(true);
expect(AdminTenantServiceAccessSchema.safeParse({
  ...validSummary,
  primaryAction: { key: "apply_trial", label: "申请试用", path: "/mini" },
}).success).toBe(false);
expect(AdminTenantServiceAccessSchema.safeParse({
  ...validSummary,
  accessStatus: "grace_period",
  readonly: false,
}).success).toBe(false);
```

运行：

```bash
cd packages/domain
bun test src/admin-service-access.test.ts
```

预期：失败，提示模块或 schema 尚不存在。

- [ ] **Step 2: 实现独立 Admin schema**

在 `admin-service-access.ts` 中定义并导出：

```ts
export const ADMIN_SERVICE_ACCESS_ACTION_VALUES = [
  "enter_workspace",
  "enter_readonly_workspace",
  "view_trial",
  "apply_trial",
  "purchase_service",
  "contact_tenant_admin",
  "contact_platform",
  "refresh",
] as const;

export const AdminServiceAccessActionSchema = z.object({
  key: z.enum(ADMIN_SERVICE_ACCESS_ACTION_VALUES),
  label: z.string().trim().min(1).max(40),
}).strict();

export const AdminTenantServiceAccessSchema = z.object({
  accessStatus: z.enum(EMPLOYEE_SERVICE_ACCESS_STATUS_VALUES),
  accessMode: z.enum(TENANT_SERVICE_ACCESS_MODE_VALUES),
  accessLevel: z.enum(["read_write", "read_only", "none"]),
  canEnterWorkspace: z.boolean(),
  readonly: z.boolean(),
  trialId: z.uuid().nullable(),
  trialStatus: z.enum(PLATFORM_SERVICE_TRIAL_STATUS_VALUES).nullable(),
  startsAt: z.iso.datetime({ offset: true }).nullable(),
  endsAt: z.iso.datetime({ offset: true }).nullable(),
  evaluatedAt: z.iso.datetime({ offset: true }),
  title: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(300),
  primaryAction: AdminServiceAccessActionSchema.nullable(),
  secondaryAction: AdminServiceAccessActionSchema.nullable(),
}).strict().superRefine(validateAdminServiceAccess);
```

`validateAdminServiceAccess` 按现有 `EmployeeServiceAccessSummarySchema` 的
workspace/grace/blocked 不变量校验 camelCase 字段。不要给 action 增加 `path` 字段。
导出推导类型，并从 `packages/domain/src/index.ts` 暴露。

- [ ] **Step 3: 运行契约测试和 domain 类型检查**

```bash
cd packages/domain
bun test src/admin-service-access.test.ts
bun run build
```

预期：测试全部通过，TypeScript 无错误。

- [ ] **Step 4: 提交共享契约**

```bash
git add packages/domain/src/admin-service-access.ts \
  packages/domain/src/admin-service-access.test.ts \
  packages/domain/src/index.ts
git commit -m "feat(domain): define admin service access contract"
```

## Task 2: 投影权限匹配的 Admin 服务状态

**Files:**

- Create: `apps/api/src/services/admin-tenant-service-access.ts`
- Test: `apps/api/src/services/admin-tenant-service-access.test.ts`

- [ ] **Step 1: 写权限和状态矩阵测试**

使用注入的 `resolveEmployeeAccess`，至少覆盖：

- `workspace_available` 保留“进入工作台”；
- `grace_period` + `billing.service_order.create` 显示“购买正式服务”；
- `service_blocked` 同时有 apply/create 权限时显示“申请试用”和“购买正式服务”；
- 只有 `billing.service_trial.read` 时可“查看试用”，不能申请；
- 只有 `billing.service_order.read` 时可查看订单，但不能购买；
- 无恢复权限时主动作是 `contact_tenant_admin`；
- `hard_blocked` 只保留“联系平台”和“刷新状态”；
- JSON 中不出现 `/packageEmployees/`、`/pages/` 或 `path`。

运行：

```bash
cd apps/api
bun test src/services/admin-tenant-service-access.test.ts
```

预期：失败，服务尚不存在。

- [ ] **Step 2: 实现薄投影 service**

实现依赖端口，避免复制服务状态判定：

```ts
type Dependencies = {
  resolveEmployeeAccess?: (input: {
    tenantId: string;
    permissionCodes: readonly string[];
  }) => Promise<EmployeeServiceAccessSummary>;
};

export class AdminTenantServiceAccessService {
  async resolve(input: ResolveAdminServiceAccessInput) {
    const employeeSummary = await this.resolveEmployeeAccess(input);
    const projected = projectAdminServiceAccess(
      employeeSummary,
      new Set(input.permissionCodes),
    );
    const parsed = AdminTenantServiceAccessSchema.safeParse(projected);
    if (!parsed.success) {
      throw Errors.dbError("Admin 服务访问事实不一致");
    }
    return parsed.data;
  }
}
```

投影动作时，以 employee summary 已提供的业务动作作为候选，再叠加 Admin 权限：

```ts
const ACTION_PERMISSION = {
  apply_trial: "billing.service_trial.apply",
  view_trial: "billing.service_trial.read",
  purchase_service: "billing.service_order.create",
} as const;
```

不得在这里读取 Supabase；不得重新实现合同、试用、宽限期优先级。

- [ ] **Step 3: 运行 API 单测和文件大小检查**

```bash
cd apps/api
bun test src/services/admin-tenant-service-access.test.ts \
  src/services/employee-service-access.test.ts \
  src/services/tenant-service-access.test.ts
bun run check:file-size
```

预期：全部通过，每个 API 文件不超过仓库门禁阈值。

- [ ] **Step 4: 提交投影服务**

```bash
git add apps/api/src/services/admin-tenant-service-access.ts \
  apps/api/src/services/admin-tenant-service-access.test.ts
git commit -m "feat(api): project admin tenant service access"
```

## Task 3: 暴露轻量状态接口和购买跳转接口

**Files:**

- Create: `apps/api/src/services/admin-service-purchase-link.ts`
- Create: `apps/api/src/services/admin-service-purchase-link.test.ts`
- Modify: `apps/api/src/controllers/employee-self-service/index.ts`
- Create: `apps/api/src/controllers/employee-self-service/routes.test.ts`

- [ ] **Step 1: 写路由契约失败测试**

断言 controller metadata 包含：

```ts
expect(routes).toContainEqual({
  method: "GET",
  path: "/employee/service-access",
  tenantServiceAccess: "session",
});
expect(routes).toContainEqual({
  method: "POST",
  path: "/employee/service-access/purchase-link",
  tenantServiceAccess: "recovery",
});
```

并断言状态 handler 只调用 `getRequiredTenantContext`、Admin projection service 和
`ResponseHandler.success`。

- [ ] **Step 2: 写购买链接 service 失败测试**

覆盖：

- 无 `billing.service_order.create` 返回 `Errors.forbidden()`；
- `hard_blocked` 不生成链接；
- `expired` / `service_blocked` 目标 path 为
  `packageEmployees/pages/platformServicePaymentSmoke/index`；
- 有权威 `trialId` 时 query 为 `source_trial_id=<uuid>`；
- 客户端不传 tenant id、trial id 或目标 path；
- URL Link 到期时间固定为 `now + 10 minutes`，返回 `{ url, expires_at }`；
- 生成器失败时保留经过 `error-factory.ts` 包装的稳定错误。

- [ ] **Step 3: 实现购买链接 service**

注入现有服务，测试不得联网：

```ts
const PURCHASE_PAGE =
  "packageEmployees/pages/platformServicePaymentSmoke/index";
const PURCHASE_LINK_TTL_MS = 10 * 60 * 1_000;

const summary = await this.serviceAccess.resolve(input);
if (summary.accessStatus === "hard_blocked") {
  throw Errors.business(
    403,
    "企业账号当前不可发起服务购买",
    "SERVICE_PURCHASE_UNAVAILABLE",
  );
}
if (!input.permissionCodes.includes("billing.service_order.create")) {
  throw Errors.forbidden();
}
const query = summary.trialId
  ? new URLSearchParams({ source_trial_id: summary.trialId }).toString()
  : "";
```

环境版本读取沿用 `WECHAT_MINIPROGRAM_ENV_VERSION` 和
`wechatOpenLinkService.normalizeEnvVersion()`；不要新增配置键。

- [ ] **Step 4: 添加两个 controller handler**

状态接口：

```ts
@Get("/employee/service-access", { tenantServiceAccess: "session" })
async getEmployeeServiceAccess(request: FastifyRequest) {
  const authContext = await this.getRequiredTenantContext(request);
  return ResponseHandler.success(
    await adminTenantServiceAccessService.resolve({
      tenantId: authContext.tenantId,
      permissionCodes: authContext.permissions.map(({ code }) => code),
    }),
  );
}
```

购买链接接口使用同一认证上下文，调用 purchase-link service。controller 不读取
`request.body.tenant_id`、`trial_id` 或 OpenID。

- [ ] **Step 5: 运行 API 定向验证**

```bash
cd apps/api
bun test src/controllers/employee-self-service/routes.test.ts \
  src/services/admin-service-purchase-link.test.ts \
  src/services/admin-tenant-service-access.test.ts
bun run typecheck
bun run check:file-size
```

预期：测试、类型和文件大小全部通过。

- [ ] **Step 6: 提交 API 入口**

```bash
git add apps/api/src/controllers/employee-self-service/index.ts \
  apps/api/src/controllers/employee-self-service/routes.test.ts \
  apps/api/src/services/admin-service-purchase-link.ts \
  apps/api/src/services/admin-service-purchase-link.test.ts
git commit -m "feat(api): expose admin service recovery endpoints"
```

## Task 4: 在 Admin 服务端预取状态并形成明确的加载结果

**Files:**

- Create: `apps/admin/lib/tenant-service-access.ts`
- Create: `apps/admin/lib/tenant-service-access.test.ts`
- Modify: `apps/admin/app/(console)/layout.tsx`

- [ ] **Step 1: 写服务端加载结果测试**

使用注入 fetch 覆盖：

```ts
expect(await loadTenantServiceAccess({ session: platformSession, token, fetchImpl }))
  .toEqual({ kind: "bypass" });
expect(await loadTenantServiceAccess({ session: tenantSession, token, fetchImpl }))
  .toMatchObject({ kind: "ready", summary });
expect(await loadTenantServiceAccess({ session: tenantSession, token, fetchImpl: failingFetch }))
  .toMatchObject({ kind: "unavailable" });
```

断言失败结果不包含 `expired` 或 `service_blocked` 的伪造状态。

- [ ] **Step 2: 实现 no-store 服务端 fetch**

定义判别联合：

```ts
export type TenantServiceAccessLoadResult =
  | { kind: "bypass" }
  | { kind: "ready"; summary: AdminTenantServiceAccess }
  | { kind: "unavailable"; message: string };
```

租户会话使用当前 Admin token 请求 `GET /employee/service-access`；使用
`AdminTenantServiceAccessSchema.safeParse` 校验响应。401 仍由现有 Admin session 逻辑处理，
网络/5xx/契约错误统一返回可重试的 `unavailable`。

- [ ] **Step 3: 接入 Console Layout**

`layout.tsx` 的顺序固定为：

1. `getAdminSession()`；
2. 无 session 则 `redirect("/login")`；
3. 获取 token；
4. 平台身份不请求租户状态；
5. 将 `serviceAccess` 结果传给 `<AdminShell>`。

- [ ] **Step 4: 运行 Admin 定向测试和类型检查**

```bash
cd apps/admin
bun test lib/tenant-service-access.test.ts
pnpm run typecheck
```

预期：通过。

- [ ] **Step 5: 提交服务端预检**

```bash
git add apps/admin/lib/tenant-service-access.ts \
  apps/admin/lib/tenant-service-access.test.ts \
  'apps/admin/app/(console)/layout.tsx'
git commit -m "feat(admin): preload tenant service access"
```

## Task 5: 实现 Shell 门禁、恢复白名单和只读上下文

**Files:**

- Create: `apps/admin/components/service-access/service-access-routes.ts`
- Create: `apps/admin/components/service-access/service-access-routes.test.ts`
- Create: `apps/admin/components/service-access/service-access-context.tsx`
- Create: `apps/admin/components/service-access/service-access-gate.tsx`
- Create: `apps/admin/components/service-access/service-readonly-banner.tsx`
- Modify: `apps/admin/components/layout/admin-shell.tsx`
- Modify: `apps/admin/components/layout/admin-nav.tsx`
- Modify: `apps/admin/components/layout/menu-config.ts`
- Test: `apps/admin/components/layout/admin-session-guard.test.ts`

- [ ] **Step 1: 先写纯路由决策测试**

实现前先固定白名单和决策：

```ts
expect(isServiceRecoveryRoute("/service-access")).toBe(true);
expect(isServiceRecoveryRoute("/billing")).toBe(true);
expect(isServiceRecoveryRoute("/billing/history")).toBe(true);
expect(isServiceRecoveryRoute("/projects")).toBe(false);
expect(decideServiceAccessView(blocked, "/projects")).toBe("replace");
expect(decideServiceAccessView(blocked, "/service-access")).toBe("recovery");
expect(decideServiceAccessView(grace, "/projects")).toBe("readonly");
expect(decideServiceAccessView(available, "/projects")).toBe("workspace");
```

白名单只能包含 `/service-access` 和 `/billing` 路由范围，不得用 `/`、`/api` 或任意
业务模块宽前缀。

- [ ] **Step 2: 实现 context 与 gate**

Context 暴露：

```ts
type ServiceAccessContextValue = {
  loadResult: TenantServiceAccessLoadResult;
  summary: AdminTenantServiceAccess | null;
  permissionCodes: readonly string[];
  refresh: () => Promise<void>;
  refreshing: boolean;
};
```

`permissionCodes` 来自当前 `AdminSession.permissions.map(({ code }) => code)`，用于隐藏只读
列表和表单入口；API 仍执行最终权限校验。

Gate 使用 `usePathname()` 和 `useRouter()`：

- `bypass` / `workspace_available` 渲染业务 children；
- `grace_period` 渲染 children 和只读横幅；
- 阻断状态在恢复路由渲染 children；
- 阻断状态在普通路由隐藏业务 children，立即渲染统一状态 workspace，并以单次
  `router.replace("/service-access")` 规范 URL；
- `unavailable` 渲染“服务状态暂时无法加载”及重试，不显示“已到期”。

- [ ] **Step 3: 收敛阻断态导航**

在 `menu-config.ts` 增加恢复导航组：

```ts
export const tenantServiceRecoveryNavGroups: AdminMenuGroup[] = [{
  label: "服务恢复",
  items: [
    { href: "/service-access", label: "服务状态", icon: Shield },
    { href: "/billing", label: "计费账户", icon: CircleDollarSign },
  ],
}];
```

`AdminNav` 根据 context 选择普通租户导航或恢复导航；平台导航不受影响。

- [ ] **Step 4: 在 AdminShell 内接线**

Provider 必须包住 `AdminSessionGuard`、导航、横幅和主内容。保留顶部租户、员工、偏好设置
和退出登录；阻断时只收敛侧边导航，不移除退出能力。

- [ ] **Step 5: 运行组件逻辑测试**

```bash
cd apps/admin
bun test components/service-access/service-access-routes.test.ts \
  components/layout/admin-session-guard.test.ts
pnpm run typecheck
pnpm run check:file-size
```

预期：通过；新增组件均低于文件大小门禁。

- [ ] **Step 6: 提交 Shell 门禁**

```bash
git add apps/admin/components/service-access \
  apps/admin/components/layout/admin-shell.tsx \
  apps/admin/components/layout/admin-nav.tsx \
  apps/admin/components/layout/menu-config.ts \
  apps/admin/components/layout/admin-session-guard.test.ts
git commit -m "feat(admin): gate tenant console by service access"
```

## Task 6: 增加全局 402/403 运行时兜底

**Files:**

- Create: `apps/admin/lib/admin-service-access-errors.ts`
- Create: `apps/admin/lib/admin-service-access-errors.test.ts`
- Modify: `apps/admin/lib/backend-client.ts`
- Modify: `apps/admin/lib/backend-client.test.ts`

- [ ] **Step 1: 写错误决策和去重测试**

覆盖：

- `401 / TOKEN_EXPIRED` 仍只触发现有 session expiry；
- `402 / TENANT_SERVICE_ACCESS_EXPIRED` 在普通请求上只 `replace` 一次；
- 当前已在 `/service-access` 不重复跳转；
- `/employee/service-access`、purchase-link、service-trials、service-products、service-orders
  和 `/billing` 请求不形成恢复循环；
- `403 / TENANT_SERVICE_READ_ONLY` 不跳转，错误消息归一为“当前处于只读宽限期”；
- `403 / TENANT_SERVICE_HARD_BLOCKED` 跳转承接页；
- `TENANT_SERVICE_CAPABILITY_NOT_INCLUDED` 留在原页面；
- 网络和 5xx 不触发租户服务跳转。

- [ ] **Step 2: 实现纯决策函数和浏览器副作用**

```ts
export function classifyAdminServiceAccessError(input: {
  path: string;
  status: number;
  code?: string;
}): "redirect" | "readonly" | "capability" | "none";
```

浏览器跳转使用模块级去重锁和 `window.location.replace("/service-access")`；测试暴露
`resetAdminServiceAccessRedirectForTests()`，生产代码不得依赖该 reset。

- [ ] **Step 3: 接入 backend client**

调用顺序保持：先处理 401 session expiry，再处理 service access error，最后抛出保留
`status/code/requestId/payload` 的 Error。只读错误改为稳定用户文案，但不得吞掉异常。

- [ ] **Step 4: 运行回归测试**

```bash
cd apps/admin
bun test lib/admin-service-access-errors.test.ts \
  lib/backend-client.test.ts \
  lib/admin-session-expiry.test.ts
```

预期：全部通过，原 401 测试不变。

- [ ] **Step 5: 提交运行时兜底**

```bash
git add apps/admin/lib/admin-service-access-errors.ts \
  apps/admin/lib/admin-service-access-errors.test.ts \
  apps/admin/lib/backend-client.ts \
  apps/admin/lib/backend-client.test.ts
git commit -m "feat(admin): centralize service access errors"
```

## Task 7: 构建统一服务状态承接页

**Files:**

- Create: `apps/admin/app/(console)/service-access/page.tsx`
- Create: `apps/admin/components/service-access/service-access-workspace.tsx`
- Create: `apps/admin/components/service-access/service-access-status-panel.tsx`
- Create: `apps/admin/components/service-access/service-access-display.ts`
- Create: `apps/admin/components/service-access/service-access-display.test.ts`

- [ ] **Step 1: 写状态展示模型测试**

测试每个状态的 tone、标题、时间标签和允许动作：

```ts
expect(buildServiceAccessDisplay(pending).tone).toBe("warning");
expect(buildServiceAccessDisplay(expired).title).toBe("试用服务已到期");
expect(buildServiceAccessDisplay(hardBlocked).tone).toBe("danger");
expect(buildServiceAccessDisplay(unavailable).title)
  .toBe("服务状态暂时无法加载");
```

网络失败测试不得出现“已到期”“未开通”。

- [ ] **Step 2: 实现克制的中后台状态面板**

复用 `Card`、`Badge`、`Alert`、`Button` 和 Lucide 图标：

- 单卡片，不做营销 Hero、渐变和多层卡片；
- `pending_review` / `scheduled` 使用浅橙；
- `hard_blocked` 使用浅红；
- 显示后端 title/message、开始/结束时间和最后评估时间；
- action key 映射本地交互，不读取 API path；
- `contact_tenant_admin` 只显示说明，不渲染无效按钮；
- `contact_platform` 显示“请联系平台客服处理”，不硬编码个人手机号，也不渲染无法执行的
  假链接。

- [ ] **Step 3: 实现刷新状态**

刷新调用 `GET /employee/service-access` 并校验 schema：

- 恢复为 `workspace_available` 时 `router.replace("/dashboard")` 后 `router.refresh()`；
- 进入 `grace_period` 时同样回到 dashboard，但保留 readonly context；
- 仍阻断则原地更新摘要；
- 失败显示可重试错误，不重放任何写请求。

- [ ] **Step 4: 运行状态页测试与类型检查**

```bash
cd apps/admin
bun test components/service-access/service-access-display.test.ts
pnpm run typecheck
pnpm run check:file-size
```

预期：通过。

- [ ] **Step 5: 提交承接页**

```bash
git add 'apps/admin/app/(console)/service-access/page.tsx' \
  apps/admin/components/service-access/service-access-workspace.tsx \
  apps/admin/components/service-access/service-access-status-panel.tsx \
  apps/admin/components/service-access/service-access-display.ts \
  apps/admin/components/service-access/service-access-display.test.ts
git commit -m "feat(admin): add tenant service access page"
```

## Task 8: 接入试用申请和试用状态恢复能力

**Files:**

- Create: `apps/admin/components/service-access/service-trial-api.ts`
- Create: `apps/admin/components/service-access/service-trial-api.test.ts`
- Create: `apps/admin/components/service-access/service-trial-section.tsx`
- Create: `apps/admin/components/service-access/service-trial-form.tsx`
- Modify: `apps/admin/components/service-access/service-access-workspace.tsx`

- [ ] **Step 1: 写 API adapter 失败测试**

固定请求契约：

```ts
expect(fetchCurrentTrial).toHaveBeenCalledWith(
  "/billing/service-trials/current",
  expect.anything(),
);
expect(fetchTrialList).toHaveBeenCalledWith(
  "/billing/service-trials?page=1&pageSize=20",
  expect.anything(),
);
```

申请 body 必须包含：`application_reason`、`expected_user_count`、
`expected_project_count`、`contact_name`、`contact_phone`、UUID v4
`idempotency_key`。不得包含 tenant id。

- [ ] **Step 2: 实现试用 API adapter**

所有请求使用 `requestBackendJson`，错误保留 code/requestId。列表参数写死首期分页
`page=1&pageSize=20`，不做全量请求。

- [ ] **Step 3: 实现权限差异 UI**

- `apply_trial`：显示申请表单；提交中禁用重复提交，同一次提交复用同一个幂等键；
- `view_trial`：显示当前/最近申请状态和关键时间；
- `pending_review` / `scheduled`：只显示状态，不重复开放申请；
- 无 apply/read 动作：显示“请联系企业管理员处理”；
- 成功提交后刷新试用状态和服务访问摘要。

表单使用现有 `Input`、`Textarea`、`Label`、`Button`，不新增表单依赖。

- [ ] **Step 4: 运行试用模块测试**

```bash
cd apps/admin
bun test components/service-access/service-trial-api.test.ts \
  components/service-access/service-access-display.test.ts
pnpm run typecheck
pnpm run check:file-size
```

预期：通过。

- [ ] **Step 5: 提交试用恢复模块**

```bash
git add apps/admin/components/service-access/service-trial-api.ts \
  apps/admin/components/service-access/service-trial-api.test.ts \
  apps/admin/components/service-access/service-trial-section.tsx \
  apps/admin/components/service-access/service-trial-form.tsx \
  apps/admin/components/service-access/service-access-workspace.tsx
git commit -m "feat(admin): add service trial recovery flow"
```

## Task 9: 接入套餐、订单和小程序购买跳转

**Files:**

- Create: `apps/admin/components/service-access/service-purchase-api.ts`
- Create: `apps/admin/components/service-access/service-purchase-api.test.ts`
- Create: `apps/admin/components/service-access/service-purchase-section.tsx`
- Create: `apps/admin/components/service-access/service-product-list.tsx`
- Create: `apps/admin/components/service-access/service-order-list.tsx`
- Modify: `apps/admin/components/service-access/service-access-workspace.tsx`

- [ ] **Step 1: 写购买 adapter 失败测试**

固定三个请求：

```ts
GET  /billing/service-products?page=1&pageSize=20
GET  /billing/service-orders?page=1&pageSize=20
POST /employee/service-access/purchase-link
```

断言 Admin adapter 永远不调用 `POST /billing/service-orders`，也不提交
`payer_openid`、tenant id 或 trial id。

- [ ] **Step 2: 实现套餐和订单展示**

- 有 `purchase_service` 动作时分页读取并展示套餐名称、年限、价格、服务范围和条款版本；
- context 中包含 `billing.service_order.read` 时展示最近 20 条本租户订单；
- 金额统一按分转元，不使用浮点金额提交；
- 没有可售商品时显示明确空状态；
- 无读取权限时不请求订单列表。

- [ ] **Step 3: 实现小程序购买跳转**

点击“打开微信小程序购买”后 POST purchase-link；成功后：

```ts
window.location.assign(result.url);
```

同时保留可复制链接按钮，展示 `expires_at`；失败时显示后端稳定错误和 requestId。
页面明确说明“套餐选择、条款确认和微信支付将在小程序内完成”。不得把该链接放入日志或
localStorage。

- [ ] **Step 4: 运行购买模块测试**

```bash
cd apps/admin
bun test components/service-access/service-purchase-api.test.ts \
  lib/admin-service-access-errors.test.ts
pnpm run typecheck
pnpm run check:file-size
```

预期：通过。

- [ ] **Step 5: 提交购买恢复模块**

```bash
git add apps/admin/components/service-access/service-purchase-api.ts \
  apps/admin/components/service-access/service-purchase-api.test.ts \
  apps/admin/components/service-access/service-purchase-section.tsx \
  apps/admin/components/service-access/service-product-list.tsx \
  apps/admin/components/service-access/service-order-list.tsx \
  apps/admin/components/service-access/service-access-workspace.tsx
git commit -m "feat(admin): add service purchase handoff"
```

## Task 10: 增加浏览器级门禁回归测试

**Files:**

- Create: `apps/admin/e2e/service-access-mock-fixture.mjs`
- Create: `apps/admin/e2e/service-access-mock-backend.mjs`
- Create: `apps/admin/e2e/service-access-gate.spec.ts`
- Create: `apps/admin/playwright.service-access.config.ts`
- Modify: `apps/admin/package.json`

- [ ] **Step 1: 建立最小 mock fixture**

fixture 提供五种会话：

- 正常租户；
- `service_blocked` 管理员（apply/create/read 权限齐全）；
- `service_blocked` 普通员工（无恢复权限）；
- `grace_period` 租户；
- 平台管理员。

mock backend 只实现登录/session、service-access、试用、商品、订单、purchase-link 和一个
普通 `/projects` 端点；所有列表返回分页元数据，记录请求次数用于断言无循环。

- [ ] **Step 2: 写 Playwright 场景**

覆盖：

1. 阻断管理员访问 `/projects` 后 URL 收敛为 `/service-access`，只看到一次权威标题；
2. 页面不显示通用“租户服务访问已到期”；
3. 有权限管理员能打开试用表单和生成购买链接；
4. 普通员工只看到联系企业管理员；
5. `/billing` 在阻断态仍可访问；
6. 宽限期保留 `/projects` 并显示只读横幅；
7. 正常租户和平台管理员不被重定向；
8. 模拟运行中 402 只发生一次 replace；
9. 状态接口 503 时显示可重试系统错误，不显示到期文案。

- [ ] **Step 3: 增加专用命令并执行**

`apps/admin/package.json` 增加：

```json
"test:e2e:service-access": "env -u NO_COLOR playwright test --config=playwright.service-access.config.ts"
```

运行：

```bash
cd apps/admin
pnpm run test:e2e:service-access
```

预期：全部通过，无 console error、无重定向循环。

- [ ] **Step 4: 提交 E2E**

```bash
git add apps/admin/e2e/service-access-mock-fixture.mjs \
  apps/admin/e2e/service-access-mock-backend.mjs \
  apps/admin/e2e/service-access-gate.spec.ts \
  apps/admin/playwright.service-access.config.ts \
  apps/admin/package.json
git commit -m "test(admin): cover tenant service access gate"
```

## Task 11: 完整验证、开发环境 smoke 与交付

**Files:**

- Modify only if evidence requires: `docs/superpowers/specs/2026-08-19-admin-tenant-service-access-gate-design.md`
- Modify only if a real operational caveat is found: `docs/superpowers/plans/2026-08-19-admin-tenant-service-access-gate.md`

- [ ] **Step 1: 运行 API 全套必要检查**

```bash
cd apps/api
bun test src/services/admin-tenant-service-access.test.ts \
  src/services/admin-service-purchase-link.test.ts \
  src/controllers/employee-self-service/routes.test.ts \
  src/services/employee-service-access.test.ts \
  src/services/tenant-service-access.test.ts
bun run typecheck
bun run build
bun run check:file-size
```

预期：0 fail；build 成功；文件大小门禁通过。

- [ ] **Step 2: 运行 Admin 全套必要检查**

```bash
cd apps/admin
bun test lib/tenant-service-access.test.ts \
  lib/admin-service-access-errors.test.ts \
  lib/backend-client.test.ts \
  lib/admin-session-expiry.test.ts \
  components/service-access/service-access-routes.test.ts \
  components/service-access/service-access-display.test.ts \
  components/service-access/service-trial-api.test.ts \
  components/service-access/service-purchase-api.test.ts \
  components/layout/admin-session-guard.test.ts
pnpm run typecheck
pnpm run build
pnpm run check:file-size
pnpm run test:e2e:service-access
```

预期：全部通过。

- [ ] **Step 3: 确认无数据库变更且 migration 状态未漂移**

```bash
git diff --name-only origin/main...HEAD -- supabase/migrations
supabase migration list
```

预期：第一条无输出；第二条 Local/Remote 已有 migration 对齐。若环境缺少 Supabase
凭据，记录“未执行原因”，不得改为手工 SQL。

- [ ] **Step 4: 开发环境真实账号 smoke**

使用 `19000005001`：

1. 登录后进入 `/service-access`；
2. 显示后端摘要“尚未开通平台技术服务”，而非通用 402；
3. 手动访问 `/projects` 会重新收敛到承接页；
4. 试用按钮是否出现与权限一致；
5. 购买按钮生成短时效小程序链接并可打开既有正式选购页；
6. `/billing`、刷新和退出可用；
7. Network 面板无循环请求。

另用正常租户、宽限期 fixture、普通员工 fixture 和平台管理员完成对应 smoke。真实支付不在
Admin 中发起；只验证跳转到小程序选购页，避免产生非必要真实订单。

- [ ] **Step 5: 最终静态审计**

```bash
git diff --check
rg -n "TODO|FIXME|HACK|as any|throw new Error" \
  packages/domain/src/admin-service-access.ts \
  apps/api/src/services/admin-tenant-service-access.ts \
  apps/api/src/services/admin-service-purchase-link.ts \
  apps/admin/components/service-access \
  apps/admin/lib/tenant-service-access.ts \
  apps/admin/lib/admin-service-access-errors.ts
git status --short
git log --oneline origin/main..HEAD
```

预期：`git diff --check` 无输出；扫描没有新增占位或禁用模式；工作区只包含计划内改动。

- [ ] **Step 6: 请求代码审查并修复确认的问题**

使用 `superpowers:requesting-code-review`，按 blocker/important/minor 分类核对：

- 后端权限和租户边界；
- 状态契约与 UI 文案；
- 402/403 循环风险；
- 恢复 API 白名单；
- URL Link 是否泄漏或可被客户端篡改归因；
- 列表分页和文件大小。

修复后重新执行受影响的定向测试和 Task 11 的完整验证。

- [ ] **Step 7: 提交文档修正或验证记录（仅有实际改动时）**

```bash
git add docs/superpowers/specs/2026-08-19-admin-tenant-service-access-gate-design.md \
  docs/superpowers/plans/2026-08-19-admin-tenant-service-access-gate.md
git commit -m "docs: finalize admin service access delivery"
```

若文档没有新增变化，跳过该提交，不创建空 commit。

## 验收清单

- [ ] `19000005001` 只看到统一、准确的服务状态承接页。
- [ ] 普通业务页面不再向用户散落展示通用 402。
- [ ] 正常租户、平台管理员、登录失效流程无回归。
- [ ] 宽限期租户可读、写入仍由后端拒绝，并有统一横幅/错误提示。
- [ ] 试用申请、试用查看、套餐查看、订单查看与小程序购买跳转严格按权限出现。
- [ ] 无权限员工只看到联系企业管理员，不出现不可执行按钮。
- [ ] 网络/5xx 不被误报为“服务到期”。
- [ ] API/Admin 测试、typecheck、build、file-size hook 和 E2E 全部通过。
- [ ] 无 migration、无 orange 写入、无新依赖、无 `--no-verify`。
