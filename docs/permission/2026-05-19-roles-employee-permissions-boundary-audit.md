# Roles / Employee Permissions 权限模型核查

日期：2026-05-19

## 结论

`roles` 和 `employee-permissions` 可以迁移到 `TenantBaseController`，但不建议直接无脑迁移。

原因是这两个 controller 属于租户权限系统核心，会影响：

- 租户角色列表、创建、编辑。
- 角色权限点绑定。
- 员工角色绑定。
- 员工权限覆盖。
- 当前登录用户权限上下文。
- Admin 菜单和按钮权限判断。

迁移前需要先明确两条边界：

1. 租户角色管理必须在租户上下文内执行。
2. 平台管理员不能通过普通租户角色接口跨租户操作员工权限。

## 当前接口

### Roles Controller

Controller：`apps/api/src/controllers/roles/index.ts`

接口：

- `GET /roles`
- `GET /roles/:id`
- `POST /roles`
- `PATCH /roles/:id`
- `PUT /roles/:id/permissions`

当前 controller 行为：

- 通过 `authorizationService.getRequiredAuthContext()` 获取登录上下文。
- 列表接口直接调用 `permissionService.listRoles()`。
- 详情、创建、更新、分配权限要求 `employee.permission_manage`。
- 目前还未继承 `TenantBaseController`。

### Employee Permissions Controller

Controller：`apps/api/src/controllers/employee-permissions/index.ts`

接口：

- `GET /auth/me/permissions`
- `GET /employees/:id/permissions`
- `POST /employees/:id/roles`
- `POST /employees/:id/permission-overrides`
- `DELETE /employees/:id/permission-overrides/:permission_id`

当前 controller 行为：

- 通过 `authorizationService.getRequiredAuthContext()` 获取登录上下文。
- `/auth/me/permissions` 直接返回当前 `authContext`。
- 其他员工权限管理接口要求 `employee.permission_manage`。
- 目前还未继承 `TenantBaseController`。

## 数据模型

核心表：

- `roles`
- `permissions`
- `role_permissions`
- `employee_roles`
- `employee_permission_overrides`

关键租户字段：

- `roles.tenant_id`
- `employees.tenant_id`

平台角色：

- `platform_admin` 是 `roles.tenant_id IS NULL` 的平台角色。
- migration `20260510100000_seed_platform_admin_role.sql` 已创建 `roles_platform_code_unique`，约束平台角色 code 唯一。

租户角色：

- migration `20260509150000_tenant_scope_organization_roles.sql` 已为 `roles` 增加 `tenant_id`。
- `roles_tenant_code_unique` 约束同租户内角色 code 唯一。

## Service 边界

Service：`apps/api/src/services/permissions.ts`

### Roles

`requireTenantRoleContext(authContext)` 已要求 `authContext.tenantId`，用于：

- `listRoles`
- `getRoleById`
- `createRole`
- `updateRole`
- `replaceRolePermissions`

这说明角色管理本质上已经是租户接口。

### Employee Permissions

员工授权接口当前逻辑：

- 先查目标员工。
- 如果 `!authContext.isPlatformAdmin && employee.tenant_id !== authContext.tenantId`，则拒绝。
- 再用 `requireTenantRoleContext(authContext)` 读取当前租户角色。
- 更新后调用 `authorizationService.invalidateAuthContext()` 清理目标员工权限缓存。

这套逻辑目前有一个需要收紧的点：

```ts
if (!authContext.isPlatformAdmin && employee.tenant_id !== authContext.tenantId) {
  throw Errors.forbidden();
}
```

如果未来 controller 迁移到 `TenantBaseController`，平台管理员无租户上下文会在 controller 层被挡住。但 service 中这段平台管理员跨租户放行逻辑仍容易让后续新入口误用。

建议后续将 employee permissions 的目标员工校验收敛为：

- 必须有当前租户上下文。
- 目标员工 `employee.tenant_id` 必须等于 `authContext.tenantId`。
- 不在普通员工授权接口里保留平台管理员跨租户放行。

平台如果未来需要“代租户授权”，应新增显式平台接口，例如：

- `POST /platform/tenants/:tenantId/employees/:id/roles`

不应复用 `/employees/:id/roles`。

## Admin 端使用现状

### 角色管理页

页面：`apps/admin/app/(console)/roles/page.tsx`

行为：

- 已通过 `getTenantBusinessAccessDenied()` 阻止平台模式进入。
- 调用 `/roles?page=1&pageSize=50`。
- 说明 admin 侧已把角色管理当作租户业务页。

### 员工角色配置

组件：`apps/admin/components/employees/employee-mutations.tsx`

行为：

- 打开员工角色弹窗时调用：
  - `/roles?page=1&pageSize=100&status=active`
  - `/employees/:id/permissions`
- 保存时调用：
  - `POST /employees/:id/roles`

说明员工授权能力依赖租户角色列表和目标员工权限上下文。

## 风险点

### 1. `/auth/me/permissions` 不是普通租户管理接口

该接口是当前登录用户自查，Admin 启动后菜单、按钮、页面权限可能依赖它。

建议：

- 可以继承 `TenantBaseController`，但要确认平台后台是否也调用它。
- 如果平台后台需要调用，则不能强制 `getRequiredTenantContext()`。
- 更稳妥做法是先保留为 `getRequiredAuthContext()`，因为平台管理员也需要拿到自己的平台角色。

### 2. 员工授权接口必须阻断跨租户员工

以下接口必须强制目标员工属于当前租户：

- `GET /employees/:id/permissions`
- `POST /employees/:id/roles`
- `POST /employees/:id/permission-overrides`
- `DELETE /employees/:id/permission-overrides/:permission_id`

迁移时不能只依赖角色 ID 过滤，还必须校验目标员工租户归属。

### 3. 角色权限绑定要避免平台权限误下放

当前 `replaceRolePermissions()` 允许绑定任意 `permissions.id`。

这本身是租户角色系统的能力，但后续如果存在平台专属权限点，需要明确是否允许租户角色绑定。

目前可先保持现状，不在基类迁移中改变权限点可绑定范围。

### 4. 平台管理员跨租户放行逻辑应移除或隔离

普通租户权限接口不应让 `isPlatformAdmin` 成为跨租户绕过条件。

建议迁移时同步做：

- `assignEmployeeRoles`
- `upsertEmployeePermissionOverride`
- `deleteEmployeePermissionOverride`
- `getEmployeePermissionContext`

上述方法均改为要求目标员工租户与当前 `authContext.tenantId` 一致。

## 建议迁移方案

### 阶段 1：迁移 Roles Controller

目标：

- `RolesController` 继承 `TenantBaseController`。
- 所有接口统一使用 `getRequiredTenantContext()`。
- 删除 controller 内重复 `authorizationService` 依赖。
- 保留 `employee.permission_manage` 权限判断。
- service 行为保持不变。

验收：

- 平台模式不能访问 `/roles`。
- 租户员工无 `employee.permission_manage` 不能创建、更新、分配角色权限。
- 角色列表只返回当前租户角色。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

### 阶段 2：拆 Employee Permissions 入口口径

建议将 `employee-permissions` 分两类处理：

当前用户自查：

- `GET /auth/me/permissions`
- 继续使用 `getRequiredAuthContext()`。
- 不强制租户上下文，兼容平台管理员。

租户员工授权：

- `GET /employees/:id/permissions`
- `POST /employees/:id/roles`
- `POST /employees/:id/permission-overrides`
- `DELETE /employees/:id/permission-overrides/:permission_id`
- 使用 `getRequiredTenantContext()`。
- 保留 `employee.permission_manage` 权限判断。

### 阶段 3：收紧 service 跨租户逻辑

将 service 中平台管理员绕过目标员工租户校验的逻辑改为普通租户口径：

- 当前上下文必须有 `tenantId`。
- 目标员工必须属于当前租户。
- 不用 `authContext.isPlatformAdmin` 作为普通租户接口的绕过条件。

如果后续确实需要平台代管租户员工权限，应新增平台专属接口，走 `PlatformBaseController`，且必须显式传 `tenantId`。

## 推荐执行顺序

1. 迁移 `roles`。
2. 验证并提交。
3. 迁移 `employee-permissions` 的租户员工授权接口，但保留 `/auth/me/permissions` 的普通 auth 口径。
4. 收紧 `permissionService` 中目标员工租户校验。
5. 验证 admin 角色页和员工角色弹窗。

## 验收标准

必须满足：

- `GET /auth/me/permissions` 对平台管理员仍可用。
- 平台管理员不能通过 `/roles` 管理租户角色，除非未来新增显式代租户入口。
- 平台管理员不能通过 `/employees/:id/roles` 直接修改任意租户员工角色。
- 租户管理员只能管理本租户角色和本租户员工权限。
- 角色列表只返回当前租户角色。
- 员工角色候选只来自当前租户角色。
- 目标员工不属于当前租户时返回 `FORBIDDEN`。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

## 下一步建议

下一步先迁移 `roles`。

不要先迁移 `employee-permissions`，因为它需要保留 `/auth/me/permissions` 的平台兼容口径，并同步收紧 service 中的目标员工租户校验。
