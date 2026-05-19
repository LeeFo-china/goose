# Departments / Department Post Rules 权限边界核查

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/departments/index.ts`
- `apps/api/src/controllers/department-post-rules/index.ts`
- `apps/api/src/services/department-post-rules.ts`
- `apps/api/src/repositories/department-post-rules.ts`
- `apps/api/src/schema/departments.ts`
- `apps/api/src/schema/department-post-rules.ts`

## 接口口径

组织架构是租户侧基础数据，所有后台接口必须在租户上下文中执行。

部门接口：

- `GET /departments`
- `GET /departments/:id`
- `POST /departments`
- `PATCH /departments/:id`
- `POST /departments/enable-batch`

部门岗位规则接口：

- `GET /department-post-rules`
- `PUT /department-post-rules/:department_code`
- `PATCH /department-post-rules/:department_code/posts/:post_code/alias`

## 已有边界

- 部门列表、详情、创建、更新、批量启用都使用 `tenant_departments`，并按 `tenant_id` 过滤。
- 租户启用部门时会从平台 `department_templates` 中选择模板，并写入当前租户的 `tenant_departments`。
- 旧 `departments` 表只作为兼容层，通过 `legacy_department_id` 与租户部门配置关联。
- 部门岗位规则只读取当前租户启用的 `tenant_departments` 和当前租户的 `posts`。
- 部门岗位规则更新前会校验部门已启用、岗位存在。
- 员工部门岗位校验使用 `tenant_department_id` 优先，兼容 `legacy_department_id`。

## 本次调整

- `departments` controller 从 `BaseController` 迁移到 `TenantBaseController`。
- `department-post-rules` controller 从 `BaseController` 迁移到 `TenantBaseController`。
- 删除两个 controller 内重复的 `authorizationService` 依赖。
- 部门 CRUD 和批量启用统一使用 `getRequiredTenantContext()`。
- 部门岗位规则接口统一使用 `getRequiredTenantContext()`。
- 部门岗位规则读取保留 `employee.read` 权限点。
- 部门岗位规则修改和岗位别名修改保留 `employee.update` 权限点。

## 后续注意

- `departments` controller 当前仍直接访问 Supabase，后续可以拆成 repository / service，但本次只收紧权限边界。
- 旧 `departments` 表仍是兼容层，不应重新作为租户部门主模型。
- 后续清理兼容层前，需要先确认员工、项目成员、审批、统计等所有链路都已稳定使用 `tenant_department_id`。
- 本次不需要小程序端改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
