# 租户角色管理隔离保护说明

日期：2026-05-11

## 背景

多租户改造后，`roles` 表已经带有 `tenant_id`，租户后台的角色管理应只影响当前租户。

前端已在平台超管模式下隐藏并阻断 `/roles` 页面，但后端仍需要独立防御，避免平台超管或异常登录态直连 `/roles` 时绕过租户过滤。

## 当前结论

`/roles` 定义为租户业务接口：

- 租户管理员可管理本租户角色。
- 普通租户员工是否可操作，由 `employee.permission_manage` 权限决定。
- 平台超管在 `tenant_id = null` 的平台管理模式下不能调用 `/roles`。
- 平台角色管理后续必须单独设计 `/platform/roles`，不复用租户接口。

## 后端保护

已在 `PermissionService` 增加租户上下文硬校验。

受影响接口：

```text
GET /roles
GET /roles/:id
POST /roles
PATCH /roles/:id
PUT /roles/:id/permissions
POST /employees/:id/roles
```

当 `authContext.tenantId` 缺失时，接口返回：

```json
{
  "code": "TENANT_CONTEXT_REQUIRED",
  "message": "角色管理必须在租户上下文中操作"
}
```

## 为什么不能只依赖前端

前端菜单隐藏只能改善正常操作体验，不能作为数据隔离边界。

角色仓储层的租户过滤规则是：

```text
有 tenantId -> 追加 roles.tenant_id = tenantId
无 tenantId -> 不追加 tenant_id 条件
```

因此必须在 service 层阻断空租户上下文，防止平台模式或历史异常账号触发无过滤查询。

## Admin 对接要求

- 租户后台继续使用现有 `/roles` 接口，不需要传 `tenant_id`。
- 平台超管模式下继续隐藏“角色管理”菜单，并阻断直接访问 `/roles` 页面。
- 如果接口返回 `TENANT_CONTEXT_REQUIRED`，展示“当前为平台管理模式，不能访问租户角色管理”。
- 不要为平台超管在前端临时拼租户参数调用 `/roles`。

## 验收清单

- A 租户角色列表只返回 A 租户角色。
- B 租户角色列表只返回 B 租户角色。
- A 租户不能通过角色 ID 读取或更新 B 租户角色。
- A 租户不能给员工分配 B 租户角色。
- 平台超管直接调用 `/roles` 返回 403。
- 平台超管直接访问 admin `/roles` 页面被平台模式拦截。
