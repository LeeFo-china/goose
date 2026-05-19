# Employee 权限边界核查 Phase 1

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/employee/index.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/schema/employee.ts`

本阶段聚焦 Employee controller 的基础边界形态：基类、租户上下文、默认 CRUD 暴露和当前直接查询风险。

## 当前发现

### 1. Controller 仍继承 BaseController

`EmployeeController` 当前仍继承 `BaseController`，并在 controller 内自行实现 `getRequiredAuthContext()`。

风险：

- 租户侧员工接口应明确使用 `TenantBaseController`。
- 当前接口需要每个方法自己记得校验租户上下文。
- 后续新增接口容易误用只有登录态、没有租户上下文的 `AuthContext`。

### 2. 路由仍注册 fullCrudRoutes

`routes/index.ts` 当前对 `employees` 使用：

```ts
app.register(createResourceRoutes("employees", EmployeeController, fullCrudRoutes));
```

现状：

- `list/getById/create/update` 已在 `EmployeeController` 中显式 override。
- 因此当前不会直接落到禁用后的 BaseController 默认 CRUD。

风险：

- 语义上仍不如单独声明 `employeeCrudRoutes` 清晰。
- 后续维护时不容易看出员工模块的 CRUD 暴露是经过审计的。

### 3. Controller 仍直接访问 Supabase

当前 controller 直接访问：

- `employees`
- `tenant_departments`
- `list_employee_login_bindings` RPC
- `posts` 关联查询
- `departments` / `tenant_departments` 关联查询

风险：

- 员工主表查询和部门归属查询分散在 controller。
- 列表、详情、创建、更新、停用都有直接 SQL。
- 租户 ID 过滤目前多数存在，但仍有 `tenantId` 可空分支。

### 4. 租户上下文仍可空

`EmployeeDepartmentWriteInput.tenantId` 当前为 `string | null`，创建员工时写入：

```ts
tenant_id: authContext.tenantId ?? null
```

风险：

- 租户侧员工写入不应允许空租户。
- 后续如果登录态异常或上下文缺失，容易产生无租户员工数据。

## Phase 1 调整目标

本阶段只做基础边界整改，不迁移 service/repository：

- `EmployeeController` 迁到 `TenantBaseController`。
- 所有租户侧接口改用 `getRequiredTenantContext()`。
- `EmployeeDepartmentWriteInput.tenantId` 改为必填 `string`。
- 员工创建写入 `tenant_id` 固定使用 `authContext.tenantId`。
- `routes/index.ts` 增加独立 `employeeCrudRoutes`，明确员工 CRUD 已审计暴露。

## 后续阶段建议

Phase 2：

- 抽 `employee-core` service/repository。
- 先迁列表、详情、创建、更新、停用。

Phase 3：

- 抽部门归属和岗位规则相关 helper。
- 统一处理 `tenant_departments`、`department_post_rules`、`posts`。

Phase 4：

- 抽登录绑定展示能力。
- RPC `list_employee_login_bindings` 下沉到 repository。

Phase 5：

- 清理兼容接口 `withdepartment` / `withpost`，或至少下沉查询。

## 本阶段验收

- `bun run api:typecheck`
- `bun run check:permission-boundaries`
- `git diff --check`

## Admin / 小程序对接

本阶段不需要 admin 或微信小程序改代码。

原因：

- 不改变接口路径。
- 不改变请求参数。
- 不改变响应结构。
- 只强化后端租户上下文和代码分层边界。
