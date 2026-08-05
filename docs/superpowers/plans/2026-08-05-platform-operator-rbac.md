# Platform Operator RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留现有 `platform_admin` 超级管理员的前提下，新增可独立授权、可立即停用、可审计的平台运营人员和平台角色管理能力。

**Architecture:** 平台人员继续复用 `employees/roles/permissions/employee_roles`，以 `tenant_id IS NULL` 建立平台边界；新增 `platform_staff` 基础身份、平台业务角色、会话版本和独立 `/platform/operators`、`/platform/roles` 接口。数据库 RPC 原子完成角色替换、最后超管保护、版本递增和审计，Admin 只消费后端最终权限，不复用租户员工或租户角色页面。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL migrations、Next.js 15、React 19、shadcn/Radix、Tailwind、Bun Test、Playwright。

---

## 0. 执行边界与检查点

设计来源：`docs/superpowers/specs/2026-08-05-platform-operator-rbac-design.md`。

共享 LightRAG 在计划编写时返回 502，本计划以当前本地 `main`、上述已确认规格及以下现有边界文档为准：

- `docs/2026-05-11-tenant-role-management-isolation-guard.md`
- `docs/permission/2026-05-19-roles-employee-permissions-boundary-audit.md`

执行必须遵守：

- 不修改 `/Users/leefo/Public/work/orange`；
- 所有数据库变化进入 `supabase/migrations/`；
- 不手工向 dev 数据库执行 DDL/DML；
- 本地隔离 Supabase 从空库应用 migration 后，才允许向 dev 执行 `supabase db push`；
- dev 应用后执行 `supabase migration list`，确认 Local/Remote 对齐；
- 每个列表默认 `page=1&pageSize=20`，`pageSize<=100`；
- 后端 controller/service/repository 分层；
- API 错误使用 `Errors.*`；
- 每个任务按 Red → Green → Refactor 执行并独立提交。

实施建议在隔离 worktree 的功能分支完成：

```bash
git fetch origin
git worktree add ../gooes-platform-operator-rbac -b feat/platform-operator-rbac main
cd ../gooes-platform-operator-rbac
```

预期：新 worktree 位于 `feat/platform-operator-rbac`，原工作区不被实现改动污染。

## 1. 文件结构

### Domain 与数据库

- Modify: `packages/domain/src/permission.ts` — 新平台权限常量与中文配置。
- Modify: `packages/domain/src/permission.test.ts` — 权限目录与高风险权限契约。
- Create: `supabase/migrations/20260805180000_create_platform_operator_rbac_foundation.sql` — 字段、角色、权限、索引、手机号保护。
- Create: `supabase/migrations/20260805183000_create_platform_operator_commands.sql` — 原子人员/角色命令与审计。
- Modify: `apps/api/src/types/database.ts` — 通过 Supabase CLI 重新生成。
- Create: `apps/api/src/services/platform-operator-rbac-migration.test.ts` — migration 静态契约。

### API 鉴权

- Modify: `apps/api/src/services/authorization/legacy/types.ts` — 平台身份和会话版本字段。
- Modify: `apps/api/src/services/authorization/legacy/context-builder.ts` — 计算 staff/super-admin。
- Modify: `apps/api/src/repositories/permissions/legacy/shared.ts` — 员工上下文字段。
- Modify: `apps/api/src/repositories/permissions/legacy/context.ts` — 查询活动角色与新字段。
- Modify: `apps/api/src/utils/jwt.ts` — `admin_auth_version` claim 与平台 Admin 12 小时 Token。
- Modify: `apps/api/src/services/admin-auth.ts` — 登录、me、最后登录和版本 claim。
- Modify: `apps/api/src/repositories/admin-auth.ts` — 登录安全快照与最后登录写入。
- Create: `apps/api/src/repositories/platform-authorization.ts` — 每次平台请求读取新鲜安全快照。
- Create: `apps/api/src/services/platform-authorization.ts` — 平台 staff/super-admin/permission 断言。
- Modify: `apps/api/src/controllers/PlatformBaseController.ts` — staff、super-admin、permission 三种入口。
- Modify: `apps/api/src/errors/error-codes.ts` — 平台人员与角色错误码。

### API 平台人员与角色

- Create: `apps/api/src/schema/platform-operators.ts`
- Create: `apps/api/src/schema/platform-roles.ts`
- Create: `apps/api/src/repositories/platform-operators.ts`
- Create: `apps/api/src/repositories/platform-roles.ts`
- Create: `apps/api/src/services/platform-operators.ts`
- Create: `apps/api/src/services/platform-operators.test.ts`
- Create: `apps/api/src/services/platform-roles.ts`
- Create: `apps/api/src/services/platform-roles.test.ts`
- Create: `apps/api/src/controllers/platform-operators/index.ts`
- Create: `apps/api/src/controllers/platform-operators/routes.test.ts`
- Create: `apps/api/src/controllers/platform-roles/index.ts`
- Create: `apps/api/src/controllers/platform-roles/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/schema/platform-audit-logs.ts`
- Modify: `apps/api/src/services/platform-audit-logs.ts`

### Admin

- Modify: `apps/admin/lib/backend.ts` — session 平台身份字段。
- Modify: `apps/admin/lib/session-mode.ts` — staff 进入平台模式，super-admin 单独判断。
- Modify: `apps/admin/components/layout/menu-config.ts` — 所有平台菜单权限与“账号与权限”分组。
- Modify: `apps/admin/components/layout/admin-nav-visibility.test.ts`
- Modify: `apps/admin/components/layout/admin-shell.tsx` — 平台运营/平台超管身份文案。
- Create: `apps/admin/components/platform-access/platform-page-access.ts` — 统一页面权限判断。
- Create: `apps/admin/components/platform-operators/*` — 人员类型、请求、表格、表单、详情、安全动作和测试。
- Create: `apps/admin/components/platform-roles/*` — 角色类型、请求、表格、权限树、表单和测试。
- Create: `apps/admin/app/(console)/platform/operators/page.tsx`
- Create: `apps/admin/app/(console)/platform/operators/loading.tsx`
- Create: `apps/admin/app/(console)/platform/roles/page.tsx`
- Create: `apps/admin/app/(console)/platform/roles/loading.tsx`
- Modify: Task 13 `Files` 中逐项列出的 28 个现有平台 `page.tsx` — 将角色判断迁移为平台身份 + 权限判断。
- Create: `apps/admin/e2e/platform-operator-rbac-mock-backend.mjs`
- Create: `apps/admin/e2e/platform-operator-rbac.spec.ts`
- Create: `apps/admin/playwright.platform-operator-rbac.config.ts`

---

### Task 1: 固化 Domain 权限目录

**Files:**
- Modify: `packages/domain/src/permission.ts`
- Modify: `packages/domain/src/permission.test.ts`

- [ ] **Step 1: 写失败测试**

在 `permission.test.ts` 增加固定权限集合测试：

```ts
const platformFoundationPermissions = {
  "platform.dashboard.read": "查看平台概览",
  "platform.operator.read": "查看平台运营人员",
  "platform.operator.manage": "管理平台运营人员",
  "platform.role.read": "查看平台角色",
  "platform.role.manage": "管理平台角色",
  "platform.audit.read": "查看平台审计日志",
  "platform.tenant.read": "查看平台租户",
  "platform.tenant.manage": "管理平台租户",
  "platform.tenant.status.manage": "管理平台租户状态",
  "platform.device.read": "查看平台设备资产",
  "platform.device.manage": "管理平台设备资产",
  "platform.lead.read": "查看平台线索",
  "platform.lead.assign": "分配平台线索",
  "platform.picture.read": "查看平台图片资料",
  "platform.picture.manage": "管理平台图片资料",
  "platform.marketing_page.read": "查看平台 H5 活动",
  "platform.marketing_page.manage": "管理平台 H5 活动",
  "platform.marketing_page.publish": "发布平台 H5 活动",
  "platform.usage.read": "查看平台用量",
  "platform.billing.read": "查看平台计费",
  "platform.ai_config.read": "查看平台 AI 路由",
  "platform.ai_config.manage": "管理平台 AI 路由",
  "platform.identity_diagnostic.read": "查看平台身份诊断",
  "platform.system_setting.read": "查看平台系统配置",
  "platform.system_setting.manage": "管理平台系统配置",
  "platform.social_video.manage": "管理平台自媒体脚本",
  "platform.location.manage": "管理平台运营区域",
  "platform.ops.execute": "执行平台运维脚本",
} as const;

test("exposes platform operator foundation permissions", () => {
  for (const [code, label] of Object.entries(platformFoundationPermissions)) {
    expect(PERMISSION_CODE_VALUES).toContain(code);
    expect(PermissionCodeConfig[code as PermissionCode]?.label).toBe(label);
  }
});
```

- [ ] **Step 2: 确认测试失败**

Run: `bun test packages/domain/src/permission.test.ts`

Expected: FAIL，首个新增 `platform.*` 编码不存在。

- [ ] **Step 3: 最小实现**

把上述 key 加入 `PERMISSION_CODE_VALUES`，并在 `PermissionCodeConfig` 中使用对应 label；module 按资源分组，例如：

```ts
'platform.operator.manage': {
  label: '管理平台运营人员',
  module: 'platform_access',
  resource: 'operator',
  action: 'manage',
},
'platform.role.manage': {
  label: '管理平台角色',
  module: 'platform_access',
  resource: 'role',
  action: 'manage',
},
```

所有新增项必须提供 `module/resource/action`，不只提供 label。

- [ ] **Step 4: 验证 Domain**

Run: `bun test packages/domain/src/permission.test.ts && bun --cwd packages/domain run build`

Expected: 全部通过，Domain 产物包含新编码。

- [ ] **Step 5: 提交**

```bash
git add packages/domain/src/permission.ts packages/domain/src/permission.test.ts
git commit -m "feat(domain): 增加平台人员权限目录"
```

---

### Task 2: 建立数据库基础结构、角色和权限种子

**Files:**
- Create: `supabase/migrations/20260805180000_create_platform_operator_rbac_foundation.sql`
- Create: `apps/api/src/services/platform-operator-rbac-migration.test.ts`

- [ ] **Step 1: 写 migration 契约失败测试**

测试读取 SQL 并断言以下不可缺少的片段：

```ts
const sql = readFileSync(
  new URL("../../../../supabase/migrations/20260805180000_create_platform_operator_rbac_foundation.sql", import.meta.url),
  "utf8",
);

test("creates platform staff foundation without tenant role leakage", () => {
  expect(sql).toContain("ADD COLUMN IF NOT EXISTS admin_auth_version integer NOT NULL DEFAULT 1");
  expect(sql).toContain("ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1");
  expect(sql).toContain("'platform_staff'");
  expect(sql).toContain("'platform_operations'");
  expect(sql).toContain("permissions.code LIKE 'platform.%'");
  expect(sql).toContain("access_scope = 'all'");
  expect(sql).toContain("CREATE FUNCTION public.guard_platform_employee_phone");
  expect(sql).toContain("pg_advisory_xact_lock");
  expect(sql).toContain("GRANT EXECUTE");
  expect(sql).toContain("TO service_role");
  expect(sql).not.toContain("TO authenticated");
});
```

- [ ] **Step 2: 确认测试失败**

Run: `bun test apps/api/src/services/platform-operator-rbac-migration.test.ts`

Expected: FAIL，migration 文件不存在。

- [ ] **Step 3: 编写 foundation migration**

Migration 必须按此顺序完成：

```sql
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS admin_auth_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER TABLE public.platform_audit_logs
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS platform_audit_logs_actor_idempotency_unique
ON public.platform_audit_logs(actor_user_id, idempotency_key)
WHERE actor_user_id IS NOT NULL AND idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS employees_platform_status_created_idx
ON public.employees(status, created_at DESC)
WHERE tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS roles_platform_status_created_idx
ON public.roles(status, created_at DESC)
WHERE tenant_id IS NULL;
```

随后 `INSERT ... ON CONFLICT` 写入 `platform_staff`、五个预设角色和 Task 1 的权限；为预设业务角色按设计规格绑定固定权限，为 `platform_admin` 绑定全部 active `platform.%` 权限。`platform_staff` 不绑定业务权限。

手机号触发器必须标准化 `btrim(NEW.phone)`，对非空手机号执行：

```sql
PERFORM pg_advisory_xact_lock(
  pg_catalog.hashtextextended('employee-phone:' || btrim(NEW.phone), 0)
);

IF NEW.tenant_id IS NULL AND EXISTS (
  SELECT 1 FROM public.employees AS existing
  WHERE existing.id <> NEW.id AND existing.phone = btrim(NEW.phone)
) THEN
  RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'PLATFORM_OPERATOR_PHONE_CONFLICT';
END IF;

IF NEW.tenant_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.employees AS existing
  WHERE existing.id <> NEW.id
    AND existing.tenant_id IS NULL
    AND existing.phone = btrim(NEW.phone)
) THEN
  RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'PLATFORM_OPERATOR_PHONE_CONFLICT';
END IF;
```

触发器挂到 `employees` 的 `BEFORE INSERT OR UPDATE OF phone, tenant_id`。文件头写明向前回滚策略：停用新角色并保留字段、权限和审计数据，不执行破坏性删除。

- [ ] **Step 4: 验证 migration 契约**

Run: `bun test apps/api/src/services/platform-operator-rbac-migration.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add supabase/migrations/20260805180000_create_platform_operator_rbac_foundation.sql apps/api/src/services/platform-operator-rbac-migration.test.ts
git commit -m "feat(db): 建立平台人员权限基础"
```

---

### Task 3: 扩展授权上下文与平台 Admin Token

**Files:**
- Modify: `apps/api/src/services/authorization/legacy/types.ts`
- Modify: `apps/api/src/services/authorization/legacy/context-builder.ts`
- Modify: `apps/api/src/repositories/permissions/legacy/shared.ts`
- Modify: `apps/api/src/repositories/permissions/legacy/context.ts`
- Modify: `apps/api/src/utils/jwt.ts`
- Modify: `apps/api/src/services/authorization/legacy-service.test.ts`
- Create: `apps/api/src/services/platform-auth-context.test.ts`

- [ ] **Step 1: 写身份计算失败测试**

覆盖三种上下文：租户员工、`platform_staff`、`platform_admin`。断言：

```ts
expect(staffContext).toMatchObject({
  tenantId: null,
  isPlatformStaff: true,
  isPlatformSuperAdmin: false,
  isPlatformAdmin: false,
  adminAuthVersion: 3,
});

expect(superContext).toMatchObject({
  isPlatformStaff: true,
  isPlatformSuperAdmin: true,
  isPlatformAdmin: true,
});

expect(tenantSystemAdmin.permissions.length).toBe(PERMISSION_CODE_VALUES.length);
expect(platformSystemAdmin.permissions).not.toEqual(
  PERMISSION_CODE_VALUES.map((code) => ({ code, scope: "all" })),
);
```

- [ ] **Step 2: 确认失败**

Run: `bun test apps/api/src/services/platform-auth-context.test.ts apps/api/src/services/authorization/legacy-service.test.ts`

Expected: FAIL，`isPlatformStaff/adminAuthVersion` 不存在，平台 `system_admin` 仍获得全部权限。

- [ ] **Step 3: 实现上下文字段与安全规则**

`AuthContext` 增加：

```ts
isPlatformStaff: boolean;
isPlatformSuperAdmin: boolean;
adminAuthVersion: number;
```

employee 上下文记录增加 `admin_auth_version`。`buildTenantContext` 使用：

```ts
const isGlobalEmployee = Boolean(employee) && !tenantId;
const isPlatformSuperAdmin = isGlobalEmployee && roleCodes.includes("platform_admin");
const isPlatformStaff = isPlatformSuperAdmin || (
  isGlobalEmployee && roleCodes.includes("platform_staff")
);

return {
  tenantId,
  tenantName,
  tenantSlug,
  tenantStatus,
  isPlatformAdmin: isPlatformSuperAdmin,
  isPlatformStaff,
  isPlatformSuperAdmin,
};
```

`system_admin` 全权限快捷逻辑增加 `tenantId !== null` 条件。非 active 员工仍保留身份描述，但后续平台 guard 必须拒绝。

- [ ] **Step 4: 增加 JWT claim 与平台过期策略**

`JwtPayload` 增加：

```ts
admin_auth_version?: number;
```

新增：

```ts
export function signAdminToken(
  payload: Omit<JwtPayload, "iat" | "exp">,
  options: { platform: boolean },
) {
  const expiresIn = options.platform
    ? process.env.PLATFORM_ADMIN_JWT_EXPIRES_IN || "12h"
    : process.env.JWT_EXPIRES_IN || "7d";
  return signJwtPayload(payload, expiresIn);
}
```

保留 `signToken` 给其他登录链路，禁止全局改变小程序或租户 Token 生命周期。

- [ ] **Step 5: 验证并提交**

Run: `bun test apps/api/src/services/platform-auth-context.test.ts apps/api/src/services/authorization/legacy-service.test.ts && bun run api:typecheck`

Expected: PASS。

```bash
git add apps/api/src/services/authorization apps/api/src/repositories/permissions apps/api/src/utils/jwt.ts apps/api/src/services/platform-auth-context.test.ts
git commit -m "feat(auth): 区分平台人员与平台超管"
```

---

### Task 4: 实现平台请求会话校验

**Files:**
- Create: `apps/api/src/repositories/platform-authorization.ts`
- Create: `apps/api/src/services/platform-authorization.ts`
- Create: `apps/api/src/services/platform-authorization.test.ts`
- Modify: `apps/api/src/controllers/PlatformBaseController.ts`
- Create: `apps/api/src/controllers/platform-base-controller.test.ts`
- Modify: `apps/api/src/errors/error-codes.ts`

- [ ] **Step 1: 写失败测试**

Repository mock 返回：

```ts
{
  employee_id: "employee-1",
  tenant_id: null,
  status: "active",
  admin_auth_version: 4,
  role_codes: ["platform_staff", "platform_operations"],
}
```

测试必须覆盖：版本一致放行、缺 claim 拒绝、版本不一致返回 `ADMIN_SESSION_REVOKED`、非 active 返回 `PLATFORM_STAFF_REQUIRED`、租户员工拒绝、缺权限返回 `PLATFORM_PERMISSION_REQUIRED`、超管入口拒绝普通 staff。

- [ ] **Step 2: 确认失败**

Run: `bun test apps/api/src/services/platform-authorization.test.ts apps/api/src/controllers/platform-base-controller.test.ts`

Expected: FAIL，新 service 和 guard 不存在。

- [ ] **Step 3: 实现 repository 和 service**

Repository 每次只查必要字段，按 employee id 限制一条：

```ts
.from("employees")
.select("id,tenant_id,status,admin_auth_version,employee_roles(role:roles(code,status,tenant_id))")
.eq("id", employeeId)
.limit(1)
.maybeSingle();
```

Service 暴露：

```ts
assertPlatformSession(
  authContext: AuthContext,
  tokenVersion: number | undefined,
): Promise<PlatformStaffAuthContext>;

assertSuperAdmin(authContext: PlatformStaffAuthContext): void;
assertPermission(authContext: PlatformStaffAuthContext, code: PermissionCode): void;
```

对平台 Token 缺版本或版本不一致使用：

```ts
throw Errors.business(
  401,
  "平台会话已失效，请重新登录",
  ErrorCodes.ADMIN_SESSION_REVOKED,
);
```

- [ ] **Step 4: 扩展 PlatformBaseController**

增加：

```ts
protected async getRequiredPlatformStaffContext(request: FastifyRequest) {
  const authContext = await this.getRequiredAuthContext(request);
  return platformAuthorizationService.assertPlatformSession(
    authContext,
    request.user?.admin_auth_version,
  );
}

protected async getRequiredPlatformPermissionContext(
  request: FastifyRequest,
  permissionCode: PermissionCode,
) {
  const authContext = await this.getRequiredPlatformStaffContext(request);
  platformAuthorizationService.assertPermission(authContext, permissionCode);
  return authContext;
}

protected async getRequiredPlatformSuperAdminContext(request: FastifyRequest) {
  const authContext = await this.getRequiredPlatformStaffContext(request);
  platformAuthorizationService.assertSuperAdmin(authContext);
  return authContext;
}
```

旧 `getRequiredPlatformAdminContext` 保持超管语义，并内部调用新的 super-admin 方法。

- [ ] **Step 5: 验证并提交**

Run: `bun test apps/api/src/services/platform-authorization.test.ts apps/api/src/controllers/platform-base-controller.test.ts && bun run api:typecheck`

Expected: PASS，Repository 查询只有一次且使用 `.limit(1)`。

```bash
git add apps/api/src/repositories/platform-authorization.ts apps/api/src/services/platform-authorization.ts apps/api/src/services/platform-authorization.test.ts apps/api/src/controllers/PlatformBaseController.ts apps/api/src/controllers/platform-base-controller.test.ts apps/api/src/errors/error-codes.ts
git commit -m "feat(auth): 校验平台人员会话版本"
```

---

### Task 5: 更新 Admin 登录与当前会话接口

**Files:**
- Modify: `apps/api/src/repositories/admin-auth.ts`
- Modify: `apps/api/src/services/admin-auth.ts`
- Create: `apps/api/src/services/admin-auth-platform-session.test.ts`
- Modify: `apps/api/src/controllers/admin-auth/index.ts`

- [ ] **Step 1: 写失败测试**

断言平台登录：

```ts
expect(signAdminToken).toHaveBeenCalledWith(
  expect.objectContaining({
    sub: "auth-platform",
    login_channel: "admin_web",
    roles: ["employee"],
    admin_auth_version: 5,
  }),
  { platform: true },
);
expect(updateLastLogin).toHaveBeenCalledWith("platform-employee");
```

并断言租户登录调用 `{ platform: false }`、`me` 在平台版本不一致时返回 401、平台登录成功响应包含 `is_platform_staff/is_platform_super_admin`。

- [ ] **Step 2: 确认失败**

Run: `bun test apps/api/src/services/admin-auth-platform-session.test.ts`

Expected: FAIL，登录仍调用 `signToken`。

- [ ] **Step 3: 最小实现**

`AdminAuthEmployeeRecord` 查询增加 `admin_auth_version`。Repository 新增：

```ts
async updateLastLogin(employeeId: string, loggedInAt: string): Promise<void>;
```

登录获取最终 `authContext` 后调用：

```ts
const token = signAdminToken({
  sub: authUserId,
  login_channel: "admin_web",
  roles: ["employee"],
  admin_auth_version: authContext.adminAuthVersion,
}, { platform: authContext.isPlatformStaff });
```

登录成功更新 `last_login_time`，并通过现有 `userAuthEventService` 写脱敏登录事件。`me` 接收并校验 `request.user?.admin_auth_version`；平台历史 Token 缺 claim 时返回 `ADMIN_SESSION_REVOKED`。

- [ ] **Step 4: 验证并提交**

Run: `bun test apps/api/src/services/admin-auth-platform-session.test.ts apps/api/src/services/admin-auth-login-timing.test.ts && bun run api:typecheck`

Expected: PASS，既有租户登录计时测试不回归。

```bash
git add apps/api/src/repositories/admin-auth.ts apps/api/src/services/admin-auth.ts apps/api/src/services/admin-auth-platform-session.test.ts apps/api/src/controllers/admin-auth/index.ts
git commit -m "feat(auth): 加固平台后台登录会话"
```

---

### Task 6: 创建原子人员与角色命令 migration

**Files:**
- Create: `supabase/migrations/20260805183000_create_platform_operator_commands.sql`
- Modify: `apps/api/src/services/platform-operator-rbac-migration.test.ts`

- [ ] **Step 1: 扩展失败契约测试**

断言 SQL 定义以下 service-role-only RPC：

```ts
for (const fn of [
  "create_platform_operator",
  "update_platform_operator",
  "replace_platform_operator_roles",
  "transition_platform_operator_status",
  "revoke_platform_operator_sessions",
  "create_platform_role",
  "update_platform_role",
  "replace_platform_role_permissions",
  "archive_platform_role",
]) {
  expect(sql).toContain(`FUNCTION public.${fn}`);
  expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}[\\s\\S]*TO service_role`));
}

expect(sql).toContain("PLATFORM_LAST_SUPER_ADMIN_REQUIRED");
expect(sql).toContain("platform_audit_logs");
expect(sql).toContain("admin_auth_version = admin_auth_version + 1");
expect(sql).toContain("permissions.code LIKE 'platform.%'");
```

- [ ] **Step 2: 确认失败**

Run: `bun test apps/api/src/services/platform-operator-rbac-migration.test.ts`

Expected: FAIL，命令 migration 不存在。

- [ ] **Step 3: 实现人员 RPC**

每个命令必须：

1. 校验 actor 是 active `platform_admin` 且 `tenant_id IS NULL`；
2. 对 `actor_user_id + idempotency_key` 加 advisory lock；
3. 检查 `platform_audit_logs` 是否已有同幂等键；
4. 锁定目标员工或有效超管集合；
5. 校验 `expected_version`；
6. 只接受 `tenant_id IS NULL` 的 active 平台角色；
7. 自动保留 `platform_staff`；
8. 禁止普通 operator 绑定 `system_admin`；
9. 修改 `version` 和 `admin_auth_version`；
10. 原子插入审计并返回 `jsonb_build_object('record', ..., 'idempotent', false)`。

状态转换只接受：

```sql
p_target_status = ANY (ARRAY['active', 'suspended', 'leaved']::text[])
```

如果目标拥有 `platform_admin`，变更前执行 `SELECT ... FOR UPDATE` 并保证至少还有一名 active、手机号非空的超管。

- [ ] **Step 4: 实现角色 RPC**

角色命令只处理 `roles.tenant_id IS NULL`。自定义 code 由数据库生成：

```sql
'platform_custom_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
```

权限替换必须拒绝：非 active 权限、非 `platform.%` 编码、`access_scope <> 'all'`。变更角色权限后查询全部已绑定 active 平台员工并递增 `admin_auth_version`。受保护角色集合固定为：

```sql
ARRAY['platform_admin', 'platform_staff']::text[]
```

外部系统不参与这些命令，因此角色/人员写入与审计必须完全原子。

- [ ] **Step 5: 验证并提交**

Run: `bun test apps/api/src/services/platform-operator-rbac-migration.test.ts`

Expected: PASS。

```bash
git add supabase/migrations/20260805183000_create_platform_operator_commands.sql apps/api/src/services/platform-operator-rbac-migration.test.ts
git commit -m "feat(db): 增加平台人员原子命令"
```

---

### Task 7: 实现平台运营人员 API

**Files:**
- Create: `apps/api/src/schema/platform-operators.ts`
- Create: `apps/api/src/repositories/platform-operators.ts`
- Create: `apps/api/src/services/platform-operators.ts`
- Create: `apps/api/src/services/platform-operators.test.ts`
- Create: `apps/api/src/controllers/platform-operators/index.ts`
- Create: `apps/api/src/controllers/platform-operators/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: 写 schema 与 service 失败测试**

Schema 固定：

```ts
export const PlatformOperatorListQuerySchema = PaginationQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  keyword: z.string().trim().max(80).optional(),
  status: z.enum(EMPLOYEE_STATUS_VALUES).optional(),
  roleId: z.uuid().optional(),
});

export const CreatePlatformOperatorSchema = z.object({
  name: z.string().trim().min(2).max(50),
  phone: z.string().regex(/^1[3-9]\d{9}$/),
  role_ids: z.array(z.uuid()).min(1).max(10),
  status: z.enum(["pending", "active"]).default("pending"),
  idempotency_key: z.uuid(),
});
```

更新、角色替换和状态动作必须带正整数 `expected_version`；动作必须带 UUID 幂等键。

Service 测试覆盖分页传递、手机号冲突映射、平台基础角色自动保留、最后超管错误映射、权限校验、列表手机号脱敏和完整手机号仅 manage 权限可见。

- [ ] **Step 2: 确认失败**

Run: `bun test apps/api/src/services/platform-operators.test.ts apps/api/src/controllers/platform-operators/routes.test.ts`

Expected: FAIL，新模块不存在。

- [ ] **Step 3: 实现 repository**

Repository 列表使用一次分页主查询和一次批量角色查询，禁止逐员工查角色：

```ts
list(input: {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: EmployeeStatus;
  roleId?: string;
}): Promise<PlatformOperatorPage>;

findById(id: string): Promise<PlatformOperatorRecord | null>;
createCommand(input: CreatePlatformOperatorCommand): Promise<CommandResult>;
updateCommand(input: UpdatePlatformOperatorCommand): Promise<CommandResult>;
replaceRolesCommand(input: ReplacePlatformOperatorRolesCommand): Promise<CommandResult>;
transitionStatusCommand(input: TransitionPlatformOperatorStatusCommand): Promise<CommandResult>;
revokeSessionsCommand(input: RevokePlatformOperatorSessionsCommand): Promise<CommandResult>;
```

主查询限定字段：`id,name,phone,status,last_login_time,created_at,updated_at,version,admin_auth_version`。列表手机号统一服务层脱敏为 `138****8000`。

- [ ] **Step 4: 实现 service/controller/routes**

权限规则：

```text
list/detail -> platform.operator.read
create/update/roles/status/revoke -> platform.operator.manage + super-admin
```

Controller 只做 Zod、上下文、service、`ResponseHandler.success`。注册规格中的 9 条路由，并在 `routes/index.ts` 显式注册 controller。

- [ ] **Step 5: 验证并提交**

Run: `bun test apps/api/src/services/platform-operators.test.ts apps/api/src/controllers/platform-operators/routes.test.ts && bun run api:typecheck`

Expected: PASS。

```bash
git add apps/api/src/schema/platform-operators.ts apps/api/src/repositories/platform-operators.ts apps/api/src/services/platform-operators.ts apps/api/src/services/platform-operators.test.ts apps/api/src/controllers/platform-operators apps/api/src/routes/index.ts
git commit -m "feat(api): 增加平台运营人员管理"
```

---

### Task 8: 实现平台角色 API

**Files:**
- Create: `apps/api/src/schema/platform-roles.ts`
- Create: `apps/api/src/repositories/platform-roles.ts`
- Create: `apps/api/src/services/platform-roles.ts`
- Create: `apps/api/src/services/platform-roles.test.ts`
- Create: `apps/api/src/controllers/platform-roles/index.ts`
- Create: `apps/api/src/controllers/platform-roles/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: 写失败测试**

固定接口契约：

```text
GET   /platform/roles
POST  /platform/roles
GET   /platform/roles/:id
PATCH /platform/roles/:id
PUT   /platform/roles/:id/permissions
POST  /platform/roles/:id/archive
GET   /platform/permissions
```

测试覆盖：仅列出 `tenant_id IS NULL`；权限目录只返回 active `platform.%`；列表分页；权限替换只接受 `all`；受保护角色不可编辑/归档；使用中的角色不可归档；角色权限变化触发已绑定人员会话版本递增。

- [ ] **Step 2: 确认失败**

Run: `bun test apps/api/src/services/platform-roles.test.ts apps/api/src/controllers/platform-roles/routes.test.ts`

Expected: FAIL，新模块不存在。

- [ ] **Step 3: 实现 schema/repository/service**

创建 body：

```ts
z.object({
  name: z.string().trim().min(2).max(50),
  description: z.string().trim().max(500).nullable().optional(),
  permission_ids: z.array(z.uuid()).max(100).default([]),
  idempotency_key: z.uuid(),
});
```

权限替换 body：

```ts
z.object({
  permissions: z.array(z.object({
    permission_id: z.uuid(),
    access_scope: z.literal("all"),
  })).max(100),
  expected_version: z.number().int().positive(),
  idempotency_key: z.uuid(),
});
```

角色和权限列表分别使用 `.range(from,to)`，角色人数和权限数量使用批量聚合/RPC，禁止 N+1。

- [ ] **Step 4: 实现 controller 并注册**

读取要求 `platform.role.read`；写入要求 `platform.role.manage` 且为 super-admin。错误映射使用规格中的 `PLATFORM_ROLE_*`。

- [ ] **Step 5: 验证并提交**

Run: `bun test apps/api/src/services/platform-roles.test.ts apps/api/src/controllers/platform-roles/routes.test.ts && bun run api:typecheck`

Expected: PASS。

```bash
git add apps/api/src/schema/platform-roles.ts apps/api/src/repositories/platform-roles.ts apps/api/src/services/platform-roles.ts apps/api/src/services/platform-roles.test.ts apps/api/src/controllers/platform-roles apps/api/src/routes/index.ts
git commit -m "feat(api): 增加平台角色管理"
```

---

### Task 9: 补齐平台 API 权限边界

**Files:**
- Modify: `apps/api/src/controllers/platform-tenants/index.ts`
- Modify: `apps/api/src/controllers/platform-audit-logs/index.ts`
- Modify: `apps/api/src/controllers/admin-ops/index.ts`
- Modify: `apps/api/src/controllers/platform-location/index.ts`
- Modify: `apps/api/src/controllers/picture-library/index.ts`
- Modify: `apps/api/src/controllers/platform-partners/index.ts`
- Modify: `apps/api/src/controllers/platform-partner-revenue/index.ts`
- Modify: `apps/api/src/controllers/platform-tenant-onboarding/index.ts`
- Modify: `apps/api/src/controllers/platform-suppliers/index.ts`
- Modify: `apps/api/src/controllers/platform-supplier-catalog/index.ts`
- Modify: `apps/api/src/controllers/platform-service-products/index.ts`
- Modify: `apps/api/src/controllers/platform-service-orders/index.ts`
- Modify: `apps/api/src/controllers/platform-service-work-orders/index.ts`
- Modify: `apps/api/src/controllers/platform-service-refund-requests/index.ts`
- Modify: `apps/api/src/controllers/platform-payment-configs/index.ts`
- Modify: `apps/api/src/controllers/platform-wechat-pay-applyments/index.ts`
- Modify: `apps/api/src/controllers/platform-virtual-products/index.ts`
- Modify: `apps/api/src/controllers/site-content/index.ts`
- Modify: `apps/api/src/controllers/platform-douyin-miniapps/index.ts`
- Modify: `apps/api/src/services/platform-tenants.ts`
- Modify: `apps/api/src/services/platform-audit-logs.ts`
- Modify: `apps/api/src/services/docker-service-health.ts`
- Modify: `apps/api/src/services/location-governance.ts`
- Modify: `apps/api/src/services/ops-scripts.ts`
- Modify: `apps/api/src/services/release-deployments.ts`
- Modify: `apps/api/src/services/tencent-lbs.ts`
- Modify: `apps/api/src/services/picture-library.ts`
- Modify: `apps/api/src/services/picture-library-health.ts`
- Modify: `apps/api/src/services/platform-partners.ts`
- Modify: `apps/api/src/services/platform-partner-tenant-onboarding.ts`
- Modify: `apps/api/src/services/platform-partner-revenue.ts`
- Modify: `apps/api/src/services/tenant-onboarding-review.ts`
- Modify: `apps/api/src/services/tenant-service-providers.ts`
- Modify: `apps/api/src/services/platform-suppliers.ts`
- Modify: `apps/api/src/services/supplier-catalog.ts`
- Modify: `apps/api/src/services/platform-service-products.ts`
- Modify: `apps/api/src/services/platform-service-fulfillment.ts`
- Modify: `apps/api/src/services/platform-payment-configs.ts`
- Modify: `apps/api/src/services/wechat-pay-applyments.ts`
- Modify: `apps/api/src/services/platform-virtual-products.ts`
- Modify: `apps/api/src/services/platform-virtual-product-channels.ts`
- Modify: `apps/api/src/services/site-content.ts`
- Modify: `apps/api/src/services/platform-douyin-miniapps.ts`
- Create: `apps/api/src/services/platform-permission-boundary.test.ts`

- [ ] **Step 1: 建立失败的权限矩阵测试**

测试以固定表驱动，不扫描运行时猜测：

```ts
const platformRouteMatrix = [
  ["GET", "/platform/tenants", "platform.tenant.read"],
  ["POST", "/platform/tenants", "platform.tenant.manage"],
  ["POST", "/platform/tenants/:id/suspend", "platform.tenant.status.manage"],
  ["GET", "/platform/audit-logs", "platform.audit.read"],
  ["GET", "/platform/partners", "platform.partner.read"],
  ["GET", "/platform/picture-library/assets", "platform.picture.read"],
  ["POST", "/platform/picture-library/assets", "platform.picture.manage"],
  ["GET", "/platform/billing/service-orders", "platform.service_order.read"],
  ["GET", "/platform/payment-configs", "platform.payment.config.read"],
  ["POST", "/admin/ops/scripts/:scriptKey/run", "platform.ops.execute"],
] as const;
```

每个代表路由测试 staff 有权限放行、无权限 403、tenant employee 403、旧无版本 Token 401。完整矩阵必须覆盖所有 25 个平台菜单入口及其写动作。

- [ ] **Step 2: 确认失败**

Run: `bun test apps/api/src/services/platform-permission-boundary.test.ts`

Expected: FAIL，仍有 handler 仅调用旧超管 guard。

- [ ] **Step 3: 分模块替换 guard 并补 service 断言**

Controller 统一使用：

```ts
const authContext = await this.getRequiredPlatformPermissionContext(
  request,
  "platform.tenant.read",
);
```

Service 对公开方法再次调用：

```ts
platformAuthorizationService.assertPermission(
  authContext,
  "platform.tenant.read",
);
```

只读和写入不得共用 manage 权限代替 read；高风险动作继续保留 super-admin 限制。每完成一个模块就运行该模块现有测试，避免一次性大爆炸修改。

- [ ] **Step 4: 更新平台审计读取权限**

`PlatformAuditLogService.list` 从 `isPlatformAdmin` 改为 `platform.audit.read`。审计 action schema增加规格中的人员和角色动作编码。高风险本地写操作不得使用 `recordBestEffort`。

- [ ] **Step 5: 验证并提交**

Run: `bun test $(rg --files apps/api/src | rg 'platform-.*\.test\.ts$')`

Expected: 全部通过。

```bash
git add apps/api/src/controllers apps/api/src/services apps/api/src/schema/platform-audit-logs.ts
git commit -m "fix(auth): 收紧平台接口权限边界"
```

---

### Task 10: 更新 Admin 平台身份和全量导航权限

**Files:**
- Modify: `apps/admin/lib/backend.ts`
- Modify: `apps/admin/lib/session-mode.ts`
- Modify: `apps/admin/components/layout/menu-config.ts`
- Modify: `apps/admin/components/layout/admin-nav-visibility.test.ts`
- Modify: `apps/admin/components/layout/admin-shell.tsx`
- Create: `apps/admin/components/platform-access/platform-page-access.ts`
- Create: `apps/admin/components/platform-access/platform-page-access.test.ts`

- [ ] **Step 1: 写失败测试**

AdminSession 增加：

```ts
is_platform_staff: boolean;
is_platform_super_admin: boolean;
```

测试 staff session 即使没有 `platform_admin` 角色也进入平台导航；tenant session 不进入。断言 `platformNavGroups.flatMap(...).every(item => Boolean(item.permission || item.requiredPermissions?.length))` 为 true。

- [ ] **Step 2: 确认失败**

Run: `bun test apps/admin/components/layout/admin-nav-visibility.test.ts apps/admin/components/platform-access/platform-page-access.test.ts`

Expected: FAIL，当前 `isPlatformOnlySession` 仍只识别 `platform_admin`，16 个入口没有权限。

- [ ] **Step 3: 实现 session 与页面访问 helper**

```ts
export function isPlatformOnlySession(session: AdminSession | null | undefined) {
  return Boolean(session?.is_platform_staff && !session.tenant);
}

export function isPlatformSuperAdminSession(session: AdminSession | null | undefined) {
  return Boolean(session?.is_platform_super_admin && !session.tenant);
}

export function hasPlatformPermission(session: AdminSession, code: string) {
  return isPlatformOnlySession(session)
    && session.permissions.some((item) => item.code === code);
}
```

`platform-page-access.ts` 返回 `{ allowed, reason }`，页面统一展示明确的权限不足，不静默当成 404。

- [ ] **Step 4: 完成 25 个菜单权限映射**

按规格第 6 节映射；“平台审计”移动到新分组“账号与权限”，新增：

```ts
{
  label: "账号与权限",
  items: [
    { href: "/platform/operators", label: "运营人员", icon: UserCog, permission: "platform.operator.read" },
    { href: "/platform/roles", label: "平台角色", icon: Shield, permission: "platform.role.read" },
    { href: "/platform/audit-logs", label: "平台审计", icon: ScrollText, permission: "platform.audit.read" },
  ],
}
```

Header 根据 super-admin/staff 分别显示“平台超管”“平台运营”，主要角色名称来自 session roles，不再把所有平台人员称为超管。

- [ ] **Step 5: 验证并提交**

Run: `bun test apps/admin/components/layout/admin-nav-visibility.test.ts apps/admin/components/platform-access/platform-page-access.test.ts && pnpm --dir apps/admin typecheck`

Expected: PASS。

```bash
git add apps/admin/lib apps/admin/components/layout apps/admin/components/platform-access
git commit -m "feat(admin): 区分平台运营与平台超管"
```

---

### Task 11: 实现 Admin 运营人员页面

**Files:**
- Create: `apps/admin/components/platform-operators/platform-operator-types.ts`
- Create: `apps/admin/components/platform-operators/platform-operator-requests.ts`
- Create: `apps/admin/components/platform-operators/platform-operator-table.tsx`
- Create: `apps/admin/components/platform-operators/platform-operator-form.tsx`
- Create: `apps/admin/components/platform-operators/platform-operator-detail.tsx`
- Create: `apps/admin/components/platform-operators/platform-operator-actions.tsx`
- Create: `apps/admin/components/platform-operators/platform-operators-page.test.ts`
- Create: `apps/admin/app/(console)/platform/operators/page.tsx`
- Create: `apps/admin/app/(console)/platform/operators/loading.tsx`

- [ ] **Step 1: 写页面契约失败测试**

断言页面调用分页接口、权限代码、固定列、新增表单、危险动作、稳定 Spinner 和同步骨架：

```ts
expect(page).toContain("/platform/operators?");
expect(page).toContain("normalizePlatformListPageSize");
expect(page).toContain("platform.operator.read");
expect(source).toContain("新增运营人员");
expect(source).toContain("强制退出");
expect(source).toContain("expected_version");
expect(source).toContain("idempotency_key");
expect(source).not.toContain("pageSize=100");
```

- [ ] **Step 2: 确认失败**

Run: `bun test apps/admin/components/platform-operators/platform-operators-page.test.ts`

Expected: FAIL，页面文件不存在。

- [ ] **Step 3: 实现列表与请求层**

页面使用 `PlatformListPageShell`。筛选固定为 keyword/status/roleId；表格列固定为姓名与脱敏手机号、角色、状态、最后登录、最近操作、创建时间、操作。请求层仅封装：

```ts
listPlatformOperators(search: URLSearchParams): Promise<PlatformOperatorPage>;
createPlatformOperator(input: CreatePlatformOperatorInput): Promise<PlatformOperator>;
updatePlatformOperator(id: string, input: UpdatePlatformOperatorInput): Promise<PlatformOperator>;
replacePlatformOperatorRoles(id: string, input: VersionedRoleInput): Promise<PlatformOperator>;
runPlatformOperatorAction(id: string, action: "activate" | "suspend" | "leave" | "revoke-sessions", input: VersionedActionInput): Promise<PlatformOperator>;
```

- [ ] **Step 4: 实现表单、详情和危险动作**

一个表单收集姓名、手机号、业务角色、初始状态。`platform_staff` 不显示为可取消项。所有提交使用 `crypto.randomUUID()` 生成幂等键；409 版本冲突提示刷新详情；手机号冲突直接定位手机号字段。

按钮使用固定 `min-w` 和按钮内 Spinner，例如：

```tsx
<Button disabled={pending} className="min-w-24">
  {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
  {pending ? "处理中" : "确认停用"}
</Button>
```

禁止向 Card 临时插入状态块造成高度跳动。

- [ ] **Step 5: 验证并提交**

Run: `bun test apps/admin/components/platform-operators/platform-operators-page.test.ts && pnpm --dir apps/admin check`

Expected: PASS，新增 TS/TSX 文件均不超过仓库限制。

```bash
git add apps/admin/components/platform-operators apps/admin/app/'(console)'/platform/operators
git commit -m "feat(admin): 增加平台运营人员管理"
```

---

### Task 12: 实现 Admin 平台角色页面

**Files:**
- Create: `apps/admin/components/platform-roles/platform-role-types.ts`
- Create: `apps/admin/components/platform-roles/platform-role-requests.ts`
- Create: `apps/admin/components/platform-roles/platform-role-table.tsx`
- Create: `apps/admin/components/platform-roles/platform-role-form.tsx`
- Create: `apps/admin/components/platform-roles/platform-role-permission-groups.tsx`
- Create: `apps/admin/components/platform-roles/platform-role-detail.tsx`
- Create: `apps/admin/components/platform-roles/platform-roles-page.test.ts`
- Create: `apps/admin/app/(console)/platform/roles/page.tsx`
- Create: `apps/admin/app/(console)/platform/roles/loading.tsx`

- [ ] **Step 1: 写失败页面契约测试**

断言分页、权限、列、模块权限、风险标记、保护角色和保存差异摘要：

```ts
expect(page).toContain("/platform/roles?");
expect(page).toContain("platform.role.read");
expect(source).toContain("人员数量");
expect(source).toContain("权限数量");
expect(source).toContain("高风险");
expect(source).toContain("新增权限");
expect(source).toContain("移除权限");
expect(source).not.toContain("一键全选全部");
```

- [ ] **Step 2: 确认失败**

Run: `bun test apps/admin/components/platform-roles/platform-roles-page.test.ts`

Expected: FAIL，页面文件不存在。

- [ ] **Step 3: 实现角色列表和表单**

列表列：名称、编码、类型、状态、人员数量、权限数量、更新时间、操作。自定义角色表单只输入名称、说明和权限；code 不由前端输入。只有 super-admin 且拥有 `platform.role.manage` 才显示写按钮。

- [ ] **Step 4: 实现权限分组**

权限按 `module` 分组，支持“全选当前模块”，高风险集合固定为设计规格第 6.3 节。保存前以 Set 差集生成新增/移除摘要。`platform_admin`、`platform_staff` 详情只读且没有归档按钮。

- [ ] **Step 5: 验证并提交**

Run: `bun test apps/admin/components/platform-roles/platform-roles-page.test.ts && pnpm --dir apps/admin check`

Expected: PASS。

```bash
git add apps/admin/components/platform-roles apps/admin/app/'(console)'/platform/roles
git commit -m "feat(admin): 增加平台角色管理"
```

---

### Task 13: 迁移现有平台页面到 staff + permission

**Files:**
- Modify: `apps/admin/app/(console)/platform/ai-config/page.tsx`
- Modify: `apps/admin/app/(console)/platform/ai-models/page.tsx`
- Modify: `apps/admin/app/(console)/platform/audit-logs/page.tsx`
- Modify: `apps/admin/app/(console)/platform/billing/page.tsx`
- Modify: `apps/admin/app/(console)/platform/branding-addon/page.tsx`
- Modify: `apps/admin/app/(console)/platform/branding/page.tsx`
- Modify: `apps/admin/app/(console)/platform/catalog/page.tsx`
- Modify: `apps/admin/app/(console)/platform/devices/page.tsx`
- Modify: `apps/admin/app/(console)/platform/identity-diagnostics/page.tsx`
- Modify: `apps/admin/app/(console)/platform/leads/page.tsx`
- Modify: `apps/admin/app/(console)/platform/marketing-pages/page.tsx`
- Modify: `apps/admin/app/(console)/platform/marketing-pages/[id]/edit/page.tsx`
- Modify: `apps/admin/app/(console)/platform/ocr/page.tsx`
- Modify: `apps/admin/app/(console)/platform/partners/page.tsx`
- Modify: `apps/admin/app/(console)/platform/picture-library/page.tsx`
- Modify: `apps/admin/app/(console)/platform/service-orders/page.tsx`
- Modify: `apps/admin/app/(console)/platform/service-products/page.tsx`
- Modify: `apps/admin/app/(console)/platform/site-content/page.tsx`
- Modify: `apps/admin/app/(console)/platform/site-content/new/page.tsx`
- Modify: `apps/admin/app/(console)/platform/site-content/[id]/page.tsx`
- Modify: `apps/admin/app/(console)/platform/suppliers/page.tsx`
- Modify: `apps/admin/app/(console)/platform/tenant-onboarding/page.tsx`
- Modify: `apps/admin/app/(console)/platform/tenants/page.tsx`
- Modify: `apps/admin/app/(console)/platform/tenants/[id]/page.tsx`
- Modify: `apps/admin/app/(console)/platform/usage/page.tsx`
- Modify: `apps/admin/app/(console)/platform/virtual-products/page.tsx`
- Modify: `apps/admin/app/(console)/platform/wechat-pay/applyments/page.tsx`
- Modify: `apps/admin/app/(console)/platform/wechat-pay/applyments/[id]/page.tsx`
- Modify: `apps/admin/app/(console)/dashboard/page.tsx`
- Modify: `apps/admin/app/(console)/settings/page.tsx`
- Modify: `apps/admin/app/(console)/ops/page.tsx`
- Create: `apps/admin/components/platform-access/platform-page-permission-matrix.test.ts`

- [ ] **Step 1: 写失败矩阵测试**

建立“路由 → 权限”固定 Map，与 `menu-config.ts` 对照：

```ts
const expected = new Map([
  ["/platform/tenants", "platform.tenant.read"],
  ["/platform/suppliers", "platform.supplier.view"],
  ["/platform/partners", "platform.partner.read"],
  ["/platform/devices", "platform.device.read"],
  ["/platform/leads", "platform.lead.read"],
  ["/platform/picture-library", "platform.picture.read"],
  ["/platform/marketing-pages", "platform.marketing_page.read"],
  ["/platform/site-content", "platform.site_content.read"],
  ["/platform/usage", "platform.usage.read"],
  ["/platform/billing", "platform.billing.read"],
  ["/platform/service-orders", "platform.service_order.read"],
  ["/platform/wechat-pay/applyments", "platform.wechat_pay.applyment.read"],
  ["/platform/ai-models", "platform.ai_config.read"],
  ["/platform/audit-logs", "platform.audit.read"],
  ["/platform/ocr", "platform.ocr.recognition.read"],
  ["/platform/identity-diagnostics", "platform.identity_diagnostic.read"],
]);
```

测试读取页面源码，要求使用 `hasPlatformPermission`，禁止保留 `session.roles.includes("platform_admin")` 作为普通页面访问条件。

- [ ] **Step 2: 确认失败**

Run: `bun test apps/admin/components/platform-access/platform-page-permission-matrix.test.ts`

Expected: FAIL，多数页面仍直接检查角色。

- [ ] **Step 3: 逐页面迁移**

统一模板：

```ts
const session = await getAdminSession();
if (!session) redirect("/login");
const allowed = hasPlatformPermission(session, REQUIRED_PERMISSION);
```

无权限时渲染统一拒绝面板并且不请求后端。写按钮分别使用 manage/publish/review 等权限，不因有 read 权限而显示。

- [ ] **Step 4: 同步骨架与身份文案**

页面布局变化时同步对应 `loading.tsx`；骨架保留相同顶层高度、筛选区和表格区，不新增与真实页面不一致的标题。Dashboard 和 Settings 也按平台 staff 识别，不能要求 `platform_admin`。

- [ ] **Step 5: 验证并提交**

Run: `bun test apps/admin/components/platform-access/platform-page-permission-matrix.test.ts apps/admin/components/layout/admin-nav-visibility.test.ts && pnpm --dir apps/admin check`

Expected: PASS，`rg -n 'roles.includes\("platform_admin"\)' apps/admin/app/'(console)'/platform` 无普通业务页面命中。

```bash
git add apps/admin/app/'(console)' apps/admin/components/platform-access
git commit -m "fix(admin): 按权限开放平台运营页面"
```

---

### Task 14: 增加 Admin E2E 权限矩阵

**Files:**
- Create: `apps/admin/e2e/platform-operator-rbac-mock-backend.mjs`
- Create: `apps/admin/e2e/platform-operator-rbac.spec.ts`
- Create: `apps/admin/playwright.platform-operator-rbac.config.ts`
- Modify: `apps/admin/package.json`

- [ ] **Step 1: 写 E2E 测试**

Mock backend 支持切换 `super_admin`、`operations`、`supplier_operations`、`service_delivery`、`finance_review`、`technical_operations`、`suspended` 七种身份，并返回真实形状的 `/admin/auth/me`、operators、roles、permissions、audit 响应。

Playwright 测试覆盖：

```ts
test("operations sees tenant and content but not payment or ops", async ({ page }) => {});
test("supplier operator can review but cannot blacklist", async ({ page }) => {});
test("service delivery can manage work orders but not prices", async ({ page }) => {});
test("finance reviewer cannot edit payment secrets", async ({ page }) => {});
test("technical operator cannot review refunds", async ({ page }) => {});
test("suspended operator is redirected to login after session rejection", async ({ page }) => {});
test("super admin can manage operators and protected roles remain read only", async ({ page }) => {});
```

- [ ] **Step 2: 确认至少一个用例失败**

Run: `pnpm --dir apps/admin exec playwright test --config=playwright.platform-operator-rbac.config.ts`

Expected: FAIL，mock 配置脚本或页面能力尚未完全接好。

- [ ] **Step 3: 完成 mock 与配置**

新增 package script：

```json
"test:e2e:platform-operator-rbac": "env -u NO_COLOR playwright test --config=playwright.platform-operator-rbac.config.ts"
```

Mock 写接口校验 `expected_version/idempotency_key`，重复幂等键返回同一结果，版本错误返回 409。

- [ ] **Step 4: 验证并提交**

Run: `pnpm --dir apps/admin test:e2e:platform-operator-rbac`

Expected: 7 个用例全部 PASS。

```bash
git add apps/admin/e2e/platform-operator-rbac* apps/admin/playwright.platform-operator-rbac.config.ts apps/admin/package.json
git commit -m "test(admin): 覆盖平台人员权限矩阵"
```

---

### Task 15: 本地 migration、类型与全量静态验证

**Files:**
- Modify: `apps/api/src/types/database.ts`

- [ ] **Step 1: 启动本地隔离 Supabase**

确认 Colima 运行后执行：

```bash
colima status
supabase start
```

Expected: 本项目本地 Supabase 服务启动，不连接 dev 数据库。

- [ ] **Step 2: 从空库应用全部 migration**

```bash
supabase db reset
supabase migration list
```

Expected: reset 成功；Local 列包含 `20260805180000`、`20260805183000`，无 SQL 顺序错误。

- [ ] **Step 3: 生成数据库类型**

使用本地 Supabase：

```bash
supabase gen types typescript --local > apps/api/src/types/database.ts
```

确认 `employees.Row` 包含 `admin_auth_version/version`，`roles.Row` 包含 `version`，审计包含 `request_id/idempotency_key`。

- [ ] **Step 4: 运行完整静态与测试门禁**

```bash
bun test packages/domain/src/permission.test.ts
bun test apps/api/src/services/platform-operator-rbac-migration.test.ts
bun test apps/api/src/services/platform-auth-context.test.ts
bun test apps/api/src/services/platform-authorization.test.ts
bun test apps/api/src/services/platform-operators.test.ts
bun test apps/api/src/services/platform-roles.test.ts
bun run check:permission-boundaries
bun run api:check
pnpm --dir apps/admin check
pnpm --dir apps/admin test:e2e:platform-operator-rbac
git diff --check
```

Expected: 所有命令 exit 0。

- [ ] **Step 5: 提交生成类型**

```bash
git add apps/api/src/types/database.ts
git commit -m "chore(api): 同步平台人员数据库类型"
```

---

### Task 16: 应用 dev migration 并执行真实 smoke

**Files:**
- Create: `docs/2026-08-05-platform-operator-rbac-dev-smoke.md`

- [ ] **Step 1: 发布前只读检查**

从 `/Users/leefo/Public/work/gooes/.env` 加载 dev 数据库连接，但不输出变量值。执行：

```bash
set -a
source /Users/leefo/Public/work/gooes/.env
set +a
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
```

Expected: 明确看到 dev 尚缺两个新 migration；本仓库 `.env` 已确认存在 `SUPABASE_DB_DIRECT_URL`，禁止打印其 value。

- [ ] **Step 2: 应用 migration**

```bash
supabase db push --db-url "$SUPABASE_DB_DIRECT_URL"
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
```

Expected: Local/Remote 对齐。禁止执行 `supabase db reset` 指向 dev。

- [ ] **Step 3: 发布 API/Admin dev**

按仓库现有 dev 发布流程构建并重启，记录实际 commit。发布后使用现有超管 Token 调用：

```text
GET /platform/operators?page=1&pageSize=20
GET /platform/roles?page=1&pageSize=20
GET /platform/permissions?page=1&pageSize=100
```

Expected: HTTP 200，分页字段完整，当前超管仍具有全部平台权限。

- [ ] **Step 4: 通过 API 创建隔离测试人员**

使用不属于任何员工的测试手机号，通过 `POST /platform/operators` 创建 `pending` 测试人员，绑定一个业务角色；不得手工插入数据库。验收：

1. pending 不能登录；
2. 启用后短信登录成功；
3. 只显示获授权菜单；
4. 越权 API 返回 403；
5. 强制退出后旧 Token 返回 401；
6. 停用后不能重新登录；
7. 平台审计存在完整人员和角色动作。

- [ ] **Step 5: 写 smoke 记录并提交**

文档记录 commit、migration、接口、HTTP、错误码、Request-ID、角色和脱敏手机号，不记录 Token、验证码或完整手机号。

```bash
git add docs/2026-08-05-platform-operator-rbac-dev-smoke.md
git commit -m "docs(platform): 记录运营人员 dev 验收"
```

---

### Task 17: 最终安全审计与 PR

**Files:**
- Review: `git diff --name-only main...HEAD` 输出的 Tasks 1-16 变更文件

- [ ] **Step 1: 搜索残留越权模式**

```bash
rg -n 'roles.includes\("platform_admin"\)' apps/admin/app/'(console)'/platform apps/admin/components
rg -n 'getRequiredPlatformAdminContext' apps/api/src/controllers
rg -n 'recordBestEffort' apps/api/src/services/platform-operators.ts apps/api/src/services/platform-roles.ts
rg -n 'system_admin' apps/api/src/services/platform-* apps/api/src/controllers/platform-* apps/admin/components/platform-*
```

Expected:

- 平台普通业务页面无角色硬编码；
- 旧超管 guard 只留在明确超管专属入口；
- 人员/角色高风险写入不使用 best-effort 审计；
- 平台模块不向普通运营人员分配 `system_admin`。

- [ ] **Step 2: 检查查询性能边界**

核对 operators/roles/audit 列表都使用 `.range()`，只选择必要字段，无逐行查询。对 migration 新索引执行本地 `EXPLAIN ANALYZE`：平台人员按 status+created_at、角色按 status+created_at、审计按 actor+idempotency 均命中新索引或唯一索引。

- [ ] **Step 3: 运行最终门禁**

```bash
bun run api:check
pnpm --dir apps/admin check
bun run check:permission-boundaries
pnpm --dir apps/admin test:e2e:platform-operator-rbac
git diff --check
git status --short --branch
```

Expected: 全部 exit 0，工作区只包含计划内提交。

- [ ] **Step 4: 创建 PR**

```bash
git push -u origin feat/platform-operator-rbac
gh pr create \
  --base main \
  --head feat/platform-operator-rbac \
  --title "feat(platform): 增加运营人员与权限管理" \
  --body-file docs/superpowers/specs/2026-08-05-platform-operator-rbac-design.md
```

PR 描述需另补验证命令结果、dev migration 对齐和 smoke 摘要，不能包含密钥或测试验证码。

- [ ] **Step 5: 等待 CI 和人工审核**

检查：

```bash
gh pr checks --watch
gh pr view --json reviewDecision,state,statusCheckRollup
```

Expected: CI 全绿且 reviewDecision 满足仓库规则。没有用户明确指令时不自动 merge。

---

## 2. 计划自检映射

| 规格要求 | 实施任务 |
| --- | --- |
| platform_staff 与平台身份拆分 | Tasks 2-4 |
| platform_admin 保持超管 | Tasks 2-4、6 |
| system_admin 不作为平台权限来源 | Tasks 3、6、17 |
| 独立平台人员 API | Task 7 |
| 独立平台角色 API | Task 8 |
| 最后超管保护 | Task 6 |
| 手机号全局冲突保护 | Task 2 |
| 停用与强制退出立即失效 | Tasks 3-6 |
| 全量平台权限目录 | Tasks 1-2 |
| 25 个菜单/页面/API 四层一致 | Tasks 9、10、13 |
| 人员与角色 Admin UI | Tasks 11-12 |
| 稳定 loading/Spinner/骨架 | Tasks 11-13 |
| 原子审计 | Tasks 2、6、9 |
| 分页与查询性能 | Tasks 7-8、15、17 |
| 空库 migration 验证 | Task 15 |
| dev 数据库应用与真实 smoke | Task 16 |
| PR 与最终门禁 | Task 17 |

本期明确不实现平台区域数据范围、租户模拟登录、员工级平台覆盖 UI、双人审批和新身份中心。
