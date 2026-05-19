# Employee 权限边界重构闭环摘要

日期：2026-05-19

## 背景

本轮 Employee 模块整改目标是把员工接口的租户边界、权限判断和 Supabase 访问路径系统化，避免 controller 继续同时承担 HTTP、权限、查询、领域校验和响应组装职责。

整改前主要问题：

- `EmployeeController` 仍继承通用 `BaseController`。
- Controller 内自行获取登录上下文，租户上下文没有统一强制。
- 员工主 CRUD、租户部门校验、岗位规则校验、登录绑定 RPC、兼容查询都直接写在 controller。
- 创建员工时存在 `tenant_id` 可空写入口径。

## 当前结论

Employee 模块第一轮权限边界整改已闭环。

当前 `EmployeeController` 中已无以下直连访问：

- `SupabaseDB`
- `SupabaseDB.getAdminClient()`
- `from("employees")`
- `from("tenant_departments")`
- `list_employee_login_bindings` RPC

Controller 当前保留职责：

- 读取 request。
- 执行 Zod 参数校验。
- 调用 service。
- 包装 `ResponseHandler.success()`。
- 保留员工展示层归一化：头像 URL、部门展示字段、登录绑定展示字段。

## 已拆分的 Service / Repository

### employee-core

文件：

- `apps/api/src/services/employee-core.ts`
- `apps/api/src/repositories/employee-core.ts`

职责：

- 员工列表查询。
- 员工详情查询。
- 员工创建。
- 员工更新。
- 员工软删除为离职。
- 员工登录绑定 RPC 查询。
- `withdepartment` / `withpost` 兼容查询。
- 租户启用部门校验。
- 部门岗位规则校验。

边界：

- 所有 `employees` 查询和写入强制 `tenant_id = authContext.tenantId`。
- 所有员工读写按 `employee.read` / `employee.create` / `employee.update` 校验。
- 员工可见范围统一按 `self / department / assigned / all` 计算。
- 创建员工时 `tenant_id` 固定来自租户上下文，不再允许空租户。
- 部门写入只允许当前租户已启用的 `tenant_departments`。

## Phase 汇总

| Phase | 主要内容 |
| --- | --- |
| Phase 1 | Employee controller 迁到 `TenantBaseController`，统一强制租户上下文，路由改为独立 CRUD 配置。 |
| Phase 2 | 员工主 CRUD、租户部门写入校验下沉到 `employee-core` service / repository。 |
| Phase 3 | 员工登录绑定 RPC 下沉到 repository，controller 删除 RPC 直连。 |
| Phase 4 | `withdepartment` / `withpost` 兼容查询下沉，Employee controller 清空 Supabase 直连。 |

## 验收命令

本轮闭环验收执行：

```bash
bun run api:typecheck
bun run check:permission-boundaries
git diff --check
rg -n "SupabaseDB\\.getAdminClient\\(\\)|SupabaseDB|getClient\\(|from\\(this\\.tableName\\)|from\\(\"employees\"\\)|from\\(\"tenant_departments\"\\)|list_employee_login_bindings|applyEmployeeListFilters|employeeSelectWithDepartment|normalizeDepartmentForWrite" apps/api/src/controllers/employee/index.ts
```

验收结果：

- TypeScript 类型检查通过。
- 权限边界检查通过。
- diff 空白检查通过。
- Employee controller 直连 Supabase / 员工主表 / 租户部门 / 登录绑定 RPC 扫描无结果。

## Admin / 小程序对接

本轮不需要 admin 或微信小程序改代码。

原因：

- 未改变接口路径。
- 未主动改变请求参数。
- 未主动改变响应结构。
- 改动集中在后端 controller/service/repository 分层和权限边界。

建议前端只做回归验证：

- 员工列表。
- 员工详情。
- 新增员工。
- 编辑员工。
- 停用员工。
- 员工部门/岗位选择校验。
- 带部门员工接口。
- 带职位员工接口。

## 后续建议

下一组更有价值的整改对象：

1. `projects`：项目主表、客户、员工、成员关系、项目日志和验收链路聚合度高，租户边界价值最高。
2. `project-members`：与当前员工身份模型、项目成员模型清理关系紧密。
3. `project-logs`：员工/客户/公开分享入口混合，适合继续梳理权限入口。

推荐下一步先做 `projects`，因为它是员工、客户、项目成员和验收链路的核心汇合点。
