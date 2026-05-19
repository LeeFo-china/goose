# Departments / Department Post Rules 权限边界重构闭环摘要

日期：2026-05-19

## 范围

部门接口：

- `GET /departments`
- `GET /departments/:id`
- `POST /departments`
- `PATCH /departments/:id`
- `PUT /departments/:id`
- `POST /departments/enable-batch`

部门岗位规则接口：

- `GET /department-post-rules`
- `PUT /department-post-rules/:department_code`
- `PATCH /department-post-rules/:department_code/posts/:post_code/alias`

## 本次调整

- 新增 `departmentRepository`，集中处理 `department_templates`、`tenant_departments`、兼容 `departments` 表访问。
- 新增 `departmentService`，集中处理租户部门序列化、模板校验、兼容部门创建、租户部门启用、批量启用和更新。
- `DepartmentController` 移除 Supabase 直连，只保留租户上下文、schema 校验、调用 service 和响应包装。
- `department-post-rules` 维持既有 service/repository 边界，controller 只处理租户上下文、权限点、schema 校验和响应包装。

## 部门模型口径

- 租户组织架构主模型是 `tenant_departments`。
- 平台标准部门来自 `department_templates`。
- 旧 `departments` 表仅作为兼容层，通过 `legacy_department_id` 与 `tenant_departments` 关联。
- 租户启用部门时：
  - 必须从启用状态的标准模板中选择。
  - `tenant_id` 来自当前租户上下文。
  - 如果兼容部门不存在，后端自动创建旧表兼容记录。
  - 返回结构继续兼容旧 `id = legacy_department_id`，并额外返回 `tenant_department_id`。

## 权限口径

- 部门 CRUD 和批量启用统一要求租户上下文。
- 部门岗位规则读取要求 `employee.read`。
- 部门岗位规则修改和岗位别名修改要求 `employee.update`。
- 部门岗位规则只读取当前租户启用的 `tenant_departments` 和当前租户岗位 `posts`。
- 员工部门岗位校验继续优先使用 `tenant_department_id`，兼容 `legacy_department_id`。

## 小程序与 Admin 对接

本轮是后端边界重构，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。

## 验收

- `apps/api/src/controllers/departments/index.ts` 无 `SupabaseDB`、`getAdminClient`、`from(`、`rpc(`、`accessPolicyService`、`authorizationService` 直接访问。
- `apps/api/src/controllers/department-post-rules/index.ts` 无 `SupabaseDB`、`getAdminClient`、`from(`、`rpc(`、`accessPolicyService`、`authorizationService` 直接访问。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
