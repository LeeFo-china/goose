# 新租户标准组织与权限模板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将装修公司的标准部门、岗位关系和权限角色固化为 `default_decoration_company / 2026.08.30`，并让平台直建租户与入驻审批共用同一个数据库初始化实现。

**Architecture:** 新 migration 更新 `initialize_default_decoration_tenant(...)`，并新增 `create_tenant_with_default_template(...)` 原子命令。入驻审批继续在原事务中调用初始化函数；平台直建租户改为 Repository 单次 RPC，删除 TypeScript 多步初始化。模板只影响新租户，现有租户不回填。

**Release boundary:** 先部署可同时解析 `2026.05.10` 与 `2026.08.30` 的兼容 API。切换阶段短暂停止“平台新建租户”和“入驻审批通过”，再应用 migration 并部署原子创建 API；确认新版本运行后恢复写入。数据库 migration 不做 down 回滚。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL、PL/pgSQL

**Design:** `docs/superpowers/specs/2026-08-30-tenant-standard-organization-template-design.md`

---

## 文件结构

- Create: `supabase/migrations/20260830100000_standardize_new_tenant_organization_template.sql`：模板版本、唯一初始化函数和平台原子创建命令。
- Create: `apps/api/src/services/tenant-standard-template-migration-contract.test.ts`：migration 的静态结构和业务清单合同。
- Create: `apps/api/src/repositories/platform-tenants/legacy/commands.ts`：平台原子创建 RPC、返回值解析和数据库错误映射。
- Create: `apps/api/src/repositories/platform-tenants/legacy/commands.test.ts`：Repository 参数、解析和失败关闭测试。
- Create: `apps/api/src/services/platform-tenants.test.ts`：Service 只调用原子命令、保留权限和审计行为。
- Create: `supabase/tests/tenant_standard_organization_template.sql`：事务内数据库 smoke，结尾回滚测试数据。
- Modify: `apps/api/src/repositories/platform-tenants/legacy-repository.ts`：暴露原子创建方法，移除旧初始化方法。
- Modify: `apps/api/src/repositories/platform-tenants/legacy/shared.ts`：补充原子命令返回类型和租户统一社会信用代码字段。
- Modify: `apps/api/src/services/platform-tenants.ts`：把“创建租户 + 初始化”改为单次 Repository 调用。
- Modify: `apps/api/src/repositories/tenant-onboarding-parsers.ts`：兼容历史和新模板版本。
- Modify: `apps/api/src/repositories/tenant-onboarding-parsers.test.ts`：覆盖两个模板版本。
- Modify: `apps/api/src/types/database.ts`：通过 Supabase CLI 生成新 RPC 类型。
- Delete: `apps/api/src/repositories/platform-tenants/legacy/initialization.ts`：移除第二套初始化规则。

### Task 1: 先建立模板版本滚动兼容

**Files:**
- Modify: `apps/api/src/repositories/tenant-onboarding-parsers.ts`
- Modify: `apps/api/src/repositories/tenant-onboarding-parsers.test.ts`

- [ ] **Step 1: 写失败测试**

把审批初始化测试拆成历史版本和新版本两个用例，两个结果都必须成功解析，未知版本必须失败关闭：

```ts
const initializationBase = {
  template_code: "default_decoration_company",
  departments_count: 42,
  posts_count: 48,
  roles_count: 11,
  admin_employee_id: ID,
  admin_role_id: ID_2,
};

for (const templateVersion of ["2026.05.10", "2026.08.30"] as const) {
  expect(parseTenantOnboardingApprovalRpcResult({
    status: "approved",
    application_id: ID,
    tenant_id: ID_2,
    binding_id: null,
    profile_id: ID,
    initialization: {
      ...initializationBase,
      template_version: templateVersion,
    },
    idempotent: templateVersion === "2026.05.10",
  }, "bad")).toMatchObject({
    status: "approved",
    initialization: { template_version: templateVersion },
  });
}

expect(() => parseTenantOnboardingApprovalRpcResult({
  status: "approved",
  application_id: ID,
  tenant_id: ID_2,
  binding_id: null,
  profile_id: ID,
  initialization: {
    ...initializationBase,
    template_version: "2099.01.01",
  },
  idempotent: false,
}, "bad")).toThrow(expect.objectContaining({ code: "DB_ERROR" }));
```

- [ ] **Step 2: 运行测试并确认新版本失败**

Run: `cd apps/api && bun test src/repositories/tenant-onboarding-parsers.test.ts`

Expected: `2026.08.30` 因当前 `z.literal("2026.05.10")` 失败。

- [ ] **Step 3: 实现显式版本联合**

```ts
const TenantTemplateVersionSchema = z.enum([
  "2026.05.10",
  "2026.08.30",
]);

const ApprovalInitializationSchema = z.object({
  template_code: z.literal("default_decoration_company"),
  template_version: TenantTemplateVersionSchema,
  departments_count: z.number().int().nonnegative(),
  posts_count: z.number().int().nonnegative(),
  roles_count: z.number().int().nonnegative(),
  admin_employee_id: z.uuid(),
  admin_role_id: z.uuid(),
}).strict();
```

- [ ] **Step 4: 验证并提交兼容改动**

Run: `cd apps/api && bun test src/repositories/tenant-onboarding-parsers.test.ts && bun run typecheck`

Expected: 测试和类型检查通过。

```bash
git add apps/api/src/repositories/tenant-onboarding-parsers.ts \
  apps/api/src/repositories/tenant-onboarding-parsers.test.ts
git commit -m "fix(onboarding): 兼容租户模板新版本"
```

该提交必须先部署到目标环境，再应用 Task 3 的 migration。

### Task 2: 用合同测试锁定新模板

**Files:**
- Create: `apps/api/src/services/tenant-standard-template-migration-contract.test.ts`

- [ ] **Step 1: 写 migration 文件缺失的失败测试**

测试读取固定 migration 路径，提取两个函数体，并声明以下精确清单：

```ts
const migration = new URL(
  "../../../../supabase/migrations/20260830100000_standardize_new_tenant_organization_template.sql",
  import.meta.url,
);

const enabledDepartments = [
  "EXEC_OFFICE",
  "MARKETING",
  "DESIGN",
  "PROJECT",
  "FINANCE",
  "SELF_MEDIA",
  "CUSTOMER_SERVICE",
] as const;

const enabledPosts = [
  "GENERAL_MANAGER",
  "SYSTEM_ADMIN",
  "SALES_CONSULTANT",
  "MARKETING_MANAGER",
  "DESIGN_DIRECTOR",
  "CHIEF_DESIGNER",
  "ENGINEERING_DIRECTOR",
  "CONSTRUCTION_SUPER",
  "HYDROPOWER_FOREMAN",
  "TILE_FOREMAN",
  "CARPENTRY_FOREMAN",
  "PAINT_FOREMAN",
  "MAINTENANCE_WORKER",
  "FINANCE_ACCOUNTANT",
  "FINANCE_MANAGER",
  "OPERATIONS_DIRECTOR",
  "NEW_MEDIA_OPERATOR",
  "VIDEO_EDITOR",
  "LIVE_STREAM_OPERATOR",
  "CUSTOMER_SERVICE_MANAGER",
  "CUSTOMER_SERVICE",
] as const;

const stableRoles = [
  "system_admin",
  "employee_base",
  "business_manager",
  "salesperson",
  "design_manage",
  "designer",
  "engineering_manager",
  "construction_supervisor",
  "construction_worker",
  "finance_base",
  "cashier",
] as const;
```

断言内容：

- 模板代码和版本固定为 `default_decoration_company / 2026.08.30`。
- 部门块包含全部 `DEPARTMENT_CODE_VALUES`，且只有 7 个默认启用。
- 岗位块包含全部 `EMPLOYEE_POST_CODE_VALUES`，且只有 21 个默认启用。
- `department_post_rules` 恰好包含 20 条业务关系和 1 条管理员关系。
- 销售专员和财务专员分别使用 `SALES_CONSULTANT`、`FINANCE_ACCOUNTANT` 的别名，不出现随机编码。
- 角色块与 `stableRoles` 完全一致。
- `system_admin` 授权同时包含 `status = 'active'` 和 `code NOT LIKE 'platform.%'`。
- 非管理员角色权限使用显式 `VALUES`，并在插入前校验缺失权限数为 0。
- 函数为 `SECURITY DEFINER`、固定 `search_path`，仅授予 `service_role`。
- 初始化函数不写 `employee_permission_overrides`，也不为普通岗位创建 `employee_roles`；唯一自动角色关系是初始管理员到 `system_admin`。
- migration 不包含针对现有租户的无条件批量 `UPDATE` 或 `DELETE`。

- [ ] **Step 2: 运行测试并确认因 migration 不存在而失败**

Run: `cd apps/api && bun test src/services/tenant-standard-template-migration-contract.test.ts`

Expected: FAIL，错误指向 migration 文件不存在。

- [ ] **Step 3: 提交失败测试**

```bash
git add apps/api/src/services/tenant-standard-template-migration-contract.test.ts
git commit -m "test(tenant): 固化标准组织模板合同"
```

### Task 3: 新增模板 migration 和统一初始化函数

**Files:**
- Create: `supabase/migrations/20260830100000_standardize_new_tenant_organization_template.sql`
- Modify: `apps/api/src/services/tenant-standard-template-migration-contract.test.ts`

- [ ] **Step 1: 写入模板版本记录**

migration 顶部加入以下 forward rollback 说明：

```sql
-- Rollback: use a forward migration to deactivate template version 2026.08.30
-- and switch new-tenant callers back to a compatible version. Do not delete
-- organization or permission rows from tenants that already use this version.
```

用 5 个具名 CTE 构造模板快照：`department_defaults`、`post_defaults`、`department_post_defaults`、`role_defaults`、`role_permission_defaults`。每个 CTE 使用设计文档对应表格中的完整 `VALUES` 清单；部门和岗位 CTE 还包含 `enabled`，角色权限 CTE 只包含 10 个非管理员角色并带 `access_scope`。将这些 CTE 分别 `jsonb_agg(jsonb_build_object(...))` 到 `payload.departments`、`payload.posts`、`payload.department_posts`、`payload.roles` 和 `payload.role_permissions`；另写 `payload.system_admin_permission_rule = 'active_non_platform'` 表达管理员的动态权限规则。

最终以 `ON CONFLICT (code, version)` 幂等写入：

```sql
INSERT INTO public.tenant_templates (
  code,
  name,
  version,
  description,
  payload,
  status
)
SELECT
  'default_decoration_company',
  '装修公司标准组织模板',
  '2026.08.30',
  '初始化标准部门、精选岗位关系、业务角色和租户管理员',
  pg_catalog.jsonb_build_object(
    'template_code', 'default_decoration_company',
    'template_version', '2026.08.30',
    'departments', department_payload.items,
    'posts', post_payload.items,
    'department_posts', department_post_payload.items,
    'roles', role_payload.items,
    'role_permissions', role_permission_payload.items,
    'system_admin_permission_rule', 'active_non_platform',
    'source', 'standardized_from_gushi_qingtian_read_only_audit'
  ),
  'active'
FROM department_payload
CROSS JOIN post_payload
CROSS JOIN department_post_payload
CROSS JOIN role_payload
CROSS JOIN role_permission_payload
ON CONFLICT (code, version) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  payload = EXCLUDED.payload,
  status = EXCLUDED.status,
  updated_at = pg_catalog.now();
```

合同测试从 `payload` 构造 CTE 和初始化函数各自提取编码、状态及权限三元组，要求两边逐项相等，防止审计快照与运行规则漂移。

- [ ] **Step 2: 更新规范化初始化函数**

保留既有前四个参数的类型与顺序，确保旧审批 RPC 仍能调用：

```sql
CREATE OR REPLACE FUNCTION public.initialize_default_decoration_tenant(
  p_tenant_id uuid,
  p_admin_name text,
  p_admin_phone text,
  p_operator_employee_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
```

函数按以下固定顺序执行：

1. 对租户行 `FOR UPDATE`；租户不存在抛 `TENANT_INITIALIZATION_TENANT_NOT_FOUND`。
2. 管理员姓名和手机号必须同时为空或同时非空；单边为空抛 `TENANT_INITIALIZATION_INPUT_INVALID`。
3. 对该租户的模板应用记录加锁。同版本记录存在时核对管理员身份并直接返回 `result`；任一旧版本存在时抛 `TENANT_TEMPLATE_STATE_CONFLICT`。
4. 写入 42 个部门。`enabled` 仅对 7 个标准编码为 `true`。
5. 写入 48 个标准岗位。`status` 仅对 21 个精选编码为 `1`，其他为 `0`。
6. 写入 21 条 `department_post_rules`，其中两条使用别名“销售专员”“财务专员”。
7. 写入 11 个稳定角色。
8. 使用设计文档“权限基线”表中的精确三元组 `(role_code, permission_code, access_scope)` 初始化函数内的 `v_role_permission_defaults jsonb`，再写入非管理员权限。若匹配到的 active 权限数量小于清单数量，抛 `TENANT_TEMPLATE_PERMISSION_MISSING`。
9. 给 `system_admin` 插入所有 active 且非 `platform.*` 的权限。
10. 管理员存在时，在 `EXEC_OFFICE / SYSTEM_ADMIN` 创建员工并绑定 `system_admin`；管理员为空时两个返回 ID 均为 `null`。
11. 写入 `tenant_template_applications` 并返回版本、计数和管理员 ID。

明确的管理员权限 SQL：

```sql
INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT v_admin_role_id, permission.id, 'all'
FROM public.permissions AS permission
WHERE permission.status = 'active'
  AND permission.code NOT LIKE 'platform.%'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;
```

明确的权限缺失检查：

```sql
SELECT pg_catalog.count(*)::integer
INTO v_expected_role_permission_count
FROM pg_catalog.jsonb_to_recordset(v_role_permission_defaults) AS defaults(
  role_code text,
  permission_code text,
  access_scope text
);

SELECT pg_catalog.count(*)::integer
INTO v_resolved_role_permission_count
FROM pg_catalog.jsonb_to_recordset(v_role_permission_defaults) AS defaults(
  role_code text,
  permission_code text,
  access_scope text
)
JOIN public.permissions AS permission
  ON permission.code = defaults.permission_code
 AND permission.status = 'active';

IF v_expected_role_permission_count <> v_resolved_role_permission_count THEN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'TENANT_TEMPLATE_PERMISSION_MISSING';
END IF;
```

- [ ] **Step 3: 新增平台原子创建命令**

`create_tenant_with_default_template(...)` 使用显式参数承接 `CreatePlatformTenantInput` 的所有租户字段、可选管理员字段和操作者 ID。函数在同一事务中插入租户、调用初始化函数，并在初始化后按返回的 `admin_employee_id` 写入可选 `auth_user_id`。

```sql
v_initialization := public.initialize_default_decoration_tenant(
  v_tenant.id,
  p_admin_name,
  p_admin_phone,
  p_operator_employee_id
);

IF p_admin_auth_user_id IS NOT NULL
  AND v_initialization->>'admin_employee_id' IS NOT NULL
THEN
  UPDATE public.employees
  SET user_id = p_admin_auth_user_id
  WHERE id = (v_initialization->>'admin_employee_id')::uuid
    AND tenant_id = v_tenant.id;
END IF;

RETURN pg_catalog.jsonb_build_object(
  'tenant', pg_catalog.to_jsonb(v_tenant),
  'initialization', v_initialization
);
```

slug 并发冲突抛 `TENANT_SLUG_EXISTS`，管理员手机号并发冲突抛 `TENANT_ADMIN_PHONE_EXISTS`。命令仅授予 `service_role`。

- [ ] **Step 4: 运行合同测试直到通过**

Run: `cd apps/api && bun test src/services/tenant-standard-template-migration-contract.test.ts src/services/tenant-onboarding-approval-sql-contract.test.ts`

Expected: 新 migration 合同通过；历史 migration 合同仍通过，证明没有改写旧 migration。

- [ ] **Step 5: 提交 migration**

```bash
git add supabase/migrations/20260830100000_standardize_new_tenant_organization_template.sql \
  apps/api/src/services/tenant-standard-template-migration-contract.test.ts
git commit -m "feat(tenant): 新增标准组织模板迁移"
```

### Task 4: 收口 Repository 到单次原子命令

**Files:**
- Create: `apps/api/src/repositories/platform-tenants/legacy/commands.ts`
- Create: `apps/api/src/repositories/platform-tenants/legacy/commands.test.ts`
- Modify: `apps/api/src/repositories/platform-tenants/legacy/shared.ts`
- Modify: `apps/api/src/repositories/platform-tenants/legacy-repository.ts`

- [ ] **Step 1: 写 Repository 失败测试**

测试通过依赖注入的 RPC 调用器验证：

- 函数名为 `create_tenant_with_default_template`。
- 地址、联系人、管理员和操作者字段完整映射。
- 返回值必须同时包含严格的 `tenant` 和 `initialization`。
- 初始化版本只接受 `2026.08.30`；缺字段、错误 UUID 或额外字段失败关闭。
- 下列稳定数据库错误映射为 `Errors.business(...)`，未知错误映射为 `Errors.dbError(...)`。

错误映射固定为：

```ts
const commandErrors = {
  TENANT_SLUG_EXISTS: [409, "租户标识已存在"],
  TENANT_ADMIN_PHONE_EXISTS: [409, "管理员手机号已绑定员工身份"],
  TENANT_TEMPLATE_STATE_CONFLICT: [409, "租户模板状态冲突"],
  TENANT_TEMPLATE_PERMISSION_MISSING: [503, "租户模板权限配置不完整"],
  TENANT_INITIALIZATION_INPUT_INVALID: [400, "租户管理员信息无效"],
} as const;
```

建议返回类型：

```ts
export type PlatformTenantAtomicCreateResult = {
  tenant: PlatformTenantRecord;
  initialization: PlatformTenantInitializationResult;
};

export type PlatformTenantRpc = (
  functionName: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;
```

`PlatformTenantRecord` 补充数据库现有字段 `unified_social_credit_code: string | null`；严格返回 schema 同时声明该字段，避免 RPC 返回完整租户行时因额外字段误判失败。

- [ ] **Step 2: 运行测试并确认模块缺失**

Run: `cd apps/api && bun test src/repositories/platform-tenants/legacy/commands.test.ts`

Expected: FAIL，`commands.ts` 尚不存在。

- [ ] **Step 3: 实现命令与严格解析**

`commands.ts` 使用项目已安装的 Zod 4 API，不引入依赖。RPC 参数固定为：

```ts
{
  p_name: input.name,
  p_slug: input.slug,
  p_status: input.status,
  p_address: input.address ?? null,
  p_address_title: input.address_title ?? null,
  p_address_poi_id: input.address_poi_id ?? null,
  p_address_province: input.address_province ?? null,
  p_address_city: input.address_city ?? null,
  p_address_district: input.address_district ?? null,
  p_address_adcode: input.address_adcode ?? null,
  p_address_latitude: input.address_latitude ?? null,
  p_address_longitude: input.address_longitude ?? null,
  p_address_source: input.address_source ?? null,
  p_address_confidence: input.address_confidence ?? null,
  p_address_confirmed_at: input.address_confirmed_at ?? null,
  p_contact_name: input.contact_name ?? null,
  p_contact_phone: input.contact_phone ?? null,
  p_admin_name: input.admin?.name ?? null,
  p_admin_phone: input.admin?.phone ?? null,
  p_admin_auth_user_id: input.admin?.auth_user_id ?? null,
  p_operator_employee_id: operatorEmployeeId,
}
```

`department_code` 和 `post_code` 继续由 API schema 接受以兼容旧客户端，但不传入 RPC；管理员组织固定为模板规定的 `EXEC_OFFICE / SYSTEM_ADMIN`。

- [ ] **Step 4: 暴露 Repository 方法并验证**

`legacy-repository.ts` 增加 `createWithDefaultTemplate`，本任务暂不删除旧方法，保证每个提交可编译。

Run: `cd apps/api && bun test src/repositories/platform-tenants/legacy/commands.test.ts && bun run typecheck`

Expected: Repository 测试和类型检查通过。

- [ ] **Step 5: 提交 Repository**

```bash
git add apps/api/src/repositories/platform-tenants/legacy/commands.ts \
  apps/api/src/repositories/platform-tenants/legacy/commands.test.ts \
  apps/api/src/repositories/platform-tenants/legacy/shared.ts \
  apps/api/src/repositories/platform-tenants/legacy-repository.ts
git commit -m "feat(tenant): 接入原子租户创建命令"
```

### Task 5: 切换 Service 并删除重复初始化

**Files:**
- Create: `apps/api/src/services/platform-tenants.test.ts`
- Modify: `apps/api/src/services/platform-tenants.ts`
- Modify: `apps/api/src/repositories/platform-tenants/legacy-repository.ts`
- Delete: `apps/api/src/repositories/platform-tenants/legacy/initialization.ts`

- [ ] **Step 1: 写 Service 失败测试**

使用 `mock.module` 替换 Repository、平台权限服务和审计服务。至少覆盖：

```ts
expect(createWithDefaultTemplate).toHaveBeenCalledWith(input, {
  operatorEmployeeId: authContext.employeeId,
});
expect(createLegacy).not.toHaveBeenCalled();
expect(initializeDefaultData).not.toHaveBeenCalled();
expect(recordBestEffort).toHaveBeenCalledTimes(2);
```

另加两个失败用例：缺少 `platform.tenant.manage` 时不调用 Repository；管理员手机号预检查命中时抛 `TENANT_ADMIN_PHONE_EXISTS`。

- [ ] **Step 2: 运行测试并确认仍走两步写入**

Run: `cd apps/api && bun test src/services/platform-tenants.test.ts`

Expected: FAIL，当前 Service 仍分别调用 `create()` 与 `initializeDefaultData()`。

- [ ] **Step 3: 切换为单次 Repository 调用**

```ts
const { tenant: record, initialization } =
  await platformTenantRepository.createWithDefaultTemplate(input, {
    operatorEmployeeId: authContext.employeeId,
  });
```

保留现有权限校验、slug 快速预检查、管理员手机号快速预检查、usage 查询和两条 best-effort 审计。审计 metadata 继续包含完整 `initialization`。

- [ ] **Step 4: 删除旧初始化实现**

从 `legacy-repository.ts` 移除以下成员及导入：

```text
initializeDefaultData
upsertDefaultDepartments
upsertDefaultPosts
upsertDefaultRoles
grantAllPermissionsToRole
createTenantAdminEmployee
findTenantDepartmentIdByCode
assignEmployeeRole
recordTemplateApplication
```

删除 `legacy/initialization.ts`。保留 `legacy/tenants.ts:create` 仅当其他调用者仍使用；用 `rg` 证明其调用边界，不能因本任务顺手删除通用 CRUD。

- [ ] **Step 5: 验证并提交 Service 收口**

Run: `cd apps/api && bun test src/services/platform-tenants.test.ts src/repositories/platform-tenants/legacy/commands.test.ts && bun run typecheck`

Expected: 测试和类型检查通过，`rg -n "initializeDefaultData|grantAllPermissionsToRole" apps/api/src` 无生产代码命中。

```bash
git add apps/api/src/services/platform-tenants.ts \
  apps/api/src/services/platform-tenants.test.ts \
  apps/api/src/repositories/platform-tenants/legacy-repository.ts \
  apps/api/src/repositories/platform-tenants/legacy/initialization.ts
git commit -m "refactor(tenant): 统一新租户初始化链路"
```

### Task 6: 增加数据库事务 smoke

**Files:**
- Create: `supabase/tests/tenant_standard_organization_template.sql`

- [ ] **Step 1: 编写回滚式 smoke**

测试必须包在 `BEGIN; ... ROLLBACK;` 中，使用唯一 slug 创建一个平台直建测试租户；再插入第二个空租户并直接调用初始化函数模拟审批内部调用。两者逐项断言：

- 模板版本为 `2026.08.30`。
- 42 个部门且恰好 7 个启用。
- 48 个岗位且恰好 21 个启用。
- 21 条启用部门岗位关系。
- 11 个角色。
- `system_admin` 没有任何 `platform.*` 权限。
- 两个租户的非管理员角色权限三元组完全一致。
- 重放第二个租户的同版本初始化返回相同管理员 ID，员工数不增加。
- 使用旧模板应用记录调用新初始化时抛 `TENANT_TEMPLATE_STATE_CONFLICT`。

结尾必须清楚显示事务回滚：

```sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.role_permissions AS role_permission
    JOIN public.roles AS role ON role.id = role_permission.role_id
    JOIN public.permissions AS permission ON permission.id = role_permission.permission_id
    WHERE role.tenant_id IN (v_direct_tenant_id, v_approval_tenant_id)
      AND role.code = 'system_admin'
      AND permission.code LIKE 'platform.%'
  ) THEN
    RAISE EXCEPTION 'tenant system administrator received platform permission';
  END IF;
END;
$$;

ROLLBACK;
```

UUID 变量必须位于同一个 `DO` 块或临时表中，不能引用块外局部变量。

- [ ] **Step 2: 在隔离数据库运行 smoke**

首选已启动且 migration 状态可核对的本地 Supabase：

```bash
supabase start
supabase migration list --local
supabase db push --local
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 \
  -f supabase/tests/tenant_standard_organization_template.sql
```

Expected: 所有断言通过，最后输出 `ROLLBACK`；查询测试 slug 返回 0 行。

如果本地 Docker 不可用，使用明确确认的开发数据库直连执行同一回滚式 SQL；禁止在生产数据库执行该 smoke。

- [ ] **Step 3: 提交 smoke**

```bash
git add supabase/tests/tenant_standard_organization_template.sql
git commit -m "test(tenant): 增加标准模板数据库冒烟"
```

### Task 7: 应用开发 migration 并同步真实类型

**Files:**
- Modify: `apps/api/src/types/database.ts`

- [ ] **Step 1: 核对待执行 migration**

先确认 Task 1 的兼容 API 已部署到开发环境；若无法单独部署该提交，则暂停开发环境的平台新建租户和入驻审批通过，直到本任务 Step 4 完成。

```bash
set -a
source /Users/leefo/Public/work/gooes/.env
set +a
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
supabase db push --dry-run --db-url "$SUPABASE_DB_DIRECT_URL"
```

Expected: 只出现已审查且计划应用的待执行 migration；若出现其他未知 migration，停止执行并核对来源。

- [ ] **Step 2: 应用开发 migration 并验证对齐**

```bash
supabase db push --db-url "$SUPABASE_DB_DIRECT_URL" --yes
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
```

Expected: Local/Remote migration 列表对齐。

- [ ] **Step 3: 从已应用的开发项目生成类型**

```bash
bun run gen
git diff -- apps/api/src/types/database.ts
```

Expected: 生成类型包含 `create_tenant_with_default_template` 的真实参数和返回类型；不得手写或猜测第三方类型。

- [ ] **Step 4: 运行开发数据库 smoke 并提交类型**

Run: `psql "$SUPABASE_DB_DIRECT_URL" -v ON_ERROR_STOP=1 -f supabase/tests/tenant_standard_organization_template.sql`

Expected: 断言全部通过并回滚，无测试租户残留。

```bash
git add apps/api/src/types/database.ts
git commit -m "chore(database): 同步标准模板 RPC 类型"
```

### Task 8: 完整验证与发布准备

**Files:**
- Verify: `apps/api/src/**`
- Verify: `supabase/migrations/20260830100000_standardize_new_tenant_organization_template.sql`
- Verify: `supabase/tests/tenant_standard_organization_template.sql`

- [ ] **Step 1: 运行聚焦测试**

```bash
cd apps/api
bun test \
  src/repositories/tenant-onboarding-parsers.test.ts \
  src/repositories/platform-tenants/legacy/commands.test.ts \
  src/services/platform-tenants.test.ts \
  src/services/tenant-standard-template-migration-contract.test.ts \
  src/services/tenant-onboarding-approval-sql-contract.test.ts
```

Expected: 全部通过，0 个失败。

- [ ] **Step 2: 运行 API 全量检查**

Run: `bun run api:check`

Expected: 类型检查、构建和 API 文件大小检查全部通过。

- [ ] **Step 3: 审查数据库和现有租户边界**

```bash
git diff origin/main...HEAD --check
git diff origin/main...HEAD --stat
rg -n "UPDATE public\.(tenant_departments|posts|department_post_rules|roles|role_permissions|employee_roles|employee_permission_overrides)" \
  supabase/migrations/20260830100000_standardize_new_tenant_organization_template.sql
```

Expected: 无空白错误；migration 只在新租户函数作用域内写组织权限表，没有 migration 顶层对现有租户的批量更新或删除。

- [ ] **Step 4: 确认仓库和 orange 边界**

Run: `git status --short && git -C /Users/leefo/Public/work/orange status --short`

Expected: gooes 只包含本计划文件；orange 状态与执行前一致且没有任何由本任务造成的改动。

- [ ] **Step 5: 准备分阶段发布记录**

发布说明必须写明：

1. 兼容提交先部署并验证审批解析。
2. 暂停平台新建租户和入驻审批通过。
3. 应用 migration，确认 `supabase migration list` 对齐。
4. 部署原子创建 API，创建一个开发验证租户并核对模板版本。
5. 恢复租户创建和审批写入。
6. 生产回滚只回滚 API 调用方；数据库模板版本通过后续 forward migration 停用，不删除已应用数据。
