# Employee 权限边界核查 Phase 4

日期：2026-05-19

## 本阶段目标

处理 Employee controller 中剩余的兼容查询接口，使 controller 不再直接访问 Supabase。

涉及接口：

- `GET /employees/withdepartment`
- `GET /employees/withdepartment/:id`
- `GET /employees/withpost`

## 已落地文件

- `apps/api/src/repositories/employee-core.ts`
- `apps/api/src/services/employee-core.ts`
- `apps/api/src/controllers/employee/index.ts`

## 调整内容

### Repository

新增：

- `listWithDepartment()`
- `findWithDepartmentById()`
- `listWithPost()`

所有查询继续强制：

- `employees.tenant_id = authContext.tenantId`
- 按 `employee.read` 的 scope 做可见范围过滤

### Service

新增：

- `listEmployeesWithDepartment()`
- `getEmployeeWithDepartment()`
- `listEmployeesWithPost()`

职责：

- 校验租户上下文。
- 校验 `employee.read` 权限。
- 计算 `self / department / assigned / all` 可见范围。
- 详情接口二次校验 `canAccessEmployee()`。

### Controller

当前 Employee controller 已无 Supabase 直连。

保留职责：

- 参数校验。
- 调用 service。
- 响应组装。
- 部门展示字段和头像 URL 展示归一化。

## 当前结论

Employee 模块核心权限边界已完成第一轮闭环：

- 主 CRUD 已迁到 service / repository。
- 登录绑定 RPC 已迁到 repository。
- 兼容查询接口已迁到 service / repository。
- Controller 不再直接访问 Supabase。

## 验收

已执行：

```bash
bun run api:typecheck
bun run check:permission-boundaries
git diff --check
rg -n "SupabaseDB|getAdminClient|from\\(this\\.tableName\\)" apps/api/src/controllers/employee/index.ts
```

验收结果：

- TypeScript 类型检查通过。
- 权限边界检查通过。
- diff 空白检查通过。
- Employee controller Supabase 直连扫描无结果。

## Admin / 小程序对接

本阶段不需要 admin 或微信小程序改代码。

原因：

- 不改变接口路径。
- 不改变请求参数。
- 不改变响应结构。
- 只调整后端分层和权限边界实现。

建议前端回归验证：

- 员工列表。
- 员工详情。
- 新增员工。
- 编辑员工。
- 停用员工。
- 带部门员工接口。
- 带职位员工接口。
