# 员工权限管理接口摘要

日期：2026-04-19

本文档描述当前已落地的员工权限管理基础接口，供前端和后台管理页对接。

## 一、当前已落地内容

当前后端已经补齐以下基础能力：

1. 权限模型基础表：
   - `roles`
   - `permissions`
   - `role_permissions`
   - `employee_roles`
   - `employee_permission_overrides`
2. `@gooes/domain@1.3.0` 新增权限相关稳定值域
3. 后端新增角色、权限、员工授权接口
4. `GET /auth/me/permissions` 可返回当前登录员工的权限上下文

## 二、接口列表

## 1. 获取当前登录员工权限上下文

`GET /auth/me/permissions`

用途：

- 前端登录后拉取当前权限上下文
- 用于菜单显隐、按钮显隐、页面读写态判断

返回核心结构：

```json
{
  "data": {
    "authUserId": "auth-user-id",
    "employeeId": "employee-id",
    "systemRole": "admin",
    "employeeStatus": "active",
    "departmentId": "department-id",
    "postId": "post-id",
    "roleCodes": ["system_admin"],
    "permissions": [
      {
        "code": "employee.permission_manage",
        "scope": "all"
      }
    ]
  },
  "message": "success"
}
```

说明：

- `systemRole` 仍然是当前 `employees.role`
- `roleCodes` 是业务角色模板编码
- `permissions` 是最终生效的权限集合
- `scope` 是该权限对应的数据范围

## 2. 角色管理

### `GET /roles`

查询参数：

- `page`
- `pageSize`
- `status`
- `keyword`

### `GET /roles/:id`

获取单个角色模板。

### `POST /roles`

请求体：

```json
{
  "code": "design_manager",
  "name": "设计主管",
  "description": "设计主管模板角色",
  "status": "active"
}
```

### `PATCH /roles/:id`

支持局部更新：

- `name`
- `description`
- `status`

## 3. 权限点管理

### `GET /permissions`

查询参数：

- `page`
- `pageSize`
- `status`
- `module`
- `keyword`

### `GET /permissions/:id`

获取单个权限点。

### `POST /permissions`

请求体示例：

```json
{
  "code": "project.update",
  "module": "project",
  "resource": "project",
  "action": "update",
  "description": "编辑项目",
  "status": "active"
}
```

### `PATCH /permissions/:id`

支持局部更新：

- `module`
- `resource`
- `action`
- `description`
- `status`

## 4. 查询员工权限上下文

`GET /employees/:id/permissions`

用途：

- 权限管理页查看某个员工的当前授权结果

返回内容包括：

- 员工基础信息
- 员工已分配的角色模板
- 最终生效权限

## 5. 给员工分配角色模板

`POST /employees/:id/roles`

请求体：

```json
{
  "role_ids": [
    "role-uuid-1",
    "role-uuid-2"
  ]
}
```

说明：

- 当前语义是“整体替换”
- 不是增量追加

返回：

- `roles`
- `auth_context`

## 6. 给员工设置权限覆盖

`POST /employees/:id/permission-overrides`

请求体：

```json
{
  "permission_id": "permission-uuid",
  "effect": "allow",
  "access_scope": "department",
  "reason": "临时开放本部门项目查看权限"
}
```

说明：

- `effect = allow` 时，可传 `access_scope`
- `effect = deny` 时，后端会忽略 `access_scope`
- 同一个员工对同一个权限是 upsert 语义

## 7. 删除员工权限覆盖

`DELETE /employees/:id/permission-overrides/:permission_id`

用途：

- 取消员工级临时授权或拒绝项

## 三、domain 需要同步给前端的内容

前端如果依赖 `@gooes/domain`，应升级到：

- `@gooes/domain@1.3.0`

本次新增可复用值域：

- `ROLE_STATUS_VALUES`
- `PERMISSION_STATUS_VALUES`
- `ACCESS_SCOPE_VALUES`
- `PERMISSION_OVERRIDE_EFFECT_VALUES`
- `PERMISSION_CODE_VALUES`

以及对应类型和配置：

- `RoleStatus`
- `PermissionStatus`
- `AccessScope`
- `PermissionOverrideEffect`
- `PermissionCode`
- `AccessScopeConfig`
- `PermissionCodeConfig`

## 四、前端对接重点

1. 前端必须以 `/auth/me/permissions` 为权限上下文来源
2. 前端只能做菜单/按钮显隐，不能代替后端授权
3. `scope` 是后端授权结果，前端可以展示，但不能自行扩大
4. 给员工分配角色时，当前接口是全量替换，不是局部增删
5. 员工级权限覆盖优先于角色模板授权

## 五、当前状态说明

这次已完成：

1. domain 值域
2. 数据库表结构
3. 基础后端接口
4. 远端 Supabase migration
5. `types/database.ts` 重新生成

后续如果继续推进，下一阶段建议：

1. 把核心业务接口逐步接入统一 `authorize(permissionCode)`
2. 把 `project.read` / `employee.read` 等数据范围过滤真正下沉到 service/repository
3. 补权限管理后台页面
