# Roles / Employee Permissions 权限边界重构闭环摘要

日期：2026-05-19

## 闭环结论

`roles` 和 `employee-permissions` 权限边界已按租户权限系统口径闭环。

本模块当前分为两条入口：

- 租户角色管理：必须有租户上下文。
- 当前登录用户权限自查：保留普通登录上下文，兼容平台管理员。

普通租户员工授权接口不再允许平台管理员通过租户接口跨租户操作员工权限。平台如后续需要代租户授权，应另建显式平台接口。

## 覆盖接口

### Roles

- `GET /roles`
- `GET /roles/:id`
- `POST /roles`
- `PATCH /roles/:id`
- `PUT /roles/:id`
- `PUT /roles/:id/permissions`

### Employee Permissions

- `GET /auth/me/permissions`
- `GET /employees/:id/permissions`
- `POST /employees/:id/roles`
- `POST /employees/:id/permission-overrides`
- `DELETE /employees/:id/permission-overrides/:permission_id`

## 当前代码边界

### roles

文件：

- `apps/api/src/controllers/roles/index.ts`
- `apps/api/src/services/permissions.ts`
- `apps/api/src/repositories/permissions.ts`

边界：

- `RolesController` 继承 `TenantBaseController`。
- 所有角色管理接口使用 `getRequiredTenantContext()`。
- 角色详情、创建、更新、权限绑定要求 `employee.permission_manage`。
- `permissionService.requireTenantRoleContext()` 统一要求 `authContext.tenantId`。
- 角色列表、详情、更新、权限绑定均按 `roles.tenant_id = authContext.tenantId` 过滤。
- 新增角色写入当前租户 `tenant_id`。

### employee-permissions

文件：

- `apps/api/src/controllers/employee-permissions/index.ts`
- `apps/api/src/services/permissions.ts`
- `apps/api/src/repositories/permissions.ts`

边界：

- `GET /auth/me/permissions` 使用 `getRequiredAuthContext()`，用于当前用户权限自查，兼容平台管理员。
- 其他员工授权接口使用 `getRequiredTenantContext()`。
- 员工授权接口要求 `employee.permission_manage`。
- `permissionService.getRequiredTenantEmployee()` 强制目标员工存在且 `employee.tenant_id = authContext.tenantId`。
- 员工角色绑定时，候选角色必须属于当前租户。
- 员工角色、权限覆盖变更后会清理目标员工权限缓存。

## 已解决风险

### 平台管理员跨租户绕过

旧审计中提到的风险是：

```ts
if (!authContext.isPlatformAdmin && employee.tenant_id !== authContext.tenantId) {
  throw Errors.forbidden();
}
```

当前实现已收紧为：

- 必须先取得租户上下文。
- 目标员工租户必须等于当前租户。
- 不使用 `isPlatformAdmin` 作为普通租户接口的绕过条件。

### 角色跨租户读取和写入

当前角色 service / repository 均通过当前租户 ID 过滤：

- `listRoles(params, tenantId)`
- `findRoleById(id, tenantId)`
- `updateRole(id, input, tenantId)`
- `listRolesByIds(roleIds, tenantId)`

新增角色由 service 写入当前租户 `tenant_id`，controller 不接受前端传入的租户归属。

### 当前用户权限自查兼容

`GET /auth/me/permissions` 不是租户管理接口，仍保留 `getRequiredAuthContext()`。

这样平台后台、租户后台都可以读取当前登录用户的权限上下文，不会因为平台管理员没有租户上下文而被误拦截。

## 验收结果

已执行：

```bash
bun run api:typecheck
bun run check:permission-boundaries
git diff --check
```

结果：

- 类型检查通过。
- 权限边界扫描通过。
- diff 空白检查通过。

## 后续建议

下一步建议继续处理 `expense-requests` 或 `system-settings` 的闭环摘要与必要代码收口。

优先级建议：

1. `expense-requests`：涉及费用审批、审批链、打款凭证，业务风险较高。
2. `system-settings`：涉及平台/租户配置隔离，之前出现过租户配置影响平台配置的问题。
