# Employee 权限边界核查 Phase 2

日期：2026-05-19

## 本阶段目标

在 Phase 1 已完成租户上下文强制化后，本阶段把 Employee 主表核心链路从 controller 下沉到 service / repository。

范围：

- `GET /employees`
- `GET /employees/:id`
- `POST /employees`
- `PUT/PATCH /employees/:id`
- `DELETE /employees/:id`（软删除为离职）
- 员工创建/更新时的租户部门写入校验

## 已落地文件

- `apps/api/src/services/employee-core.ts`
- `apps/api/src/repositories/employee-core.ts`
- `apps/api/src/controllers/employee/index.ts`

## 当前职责划分

### Controller

保留职责：

- 读取 request。
- 执行 Zod 参数校验。
- 调用 `employeeCoreService`。
- 包装 `ResponseHandler.success()`。
- 保留员工展示层归一化：头像 URL、部门展示字段、登录绑定展示字段。

### Service

`employeeCoreService` 负责：

- 强制租户上下文：`accessPolicyService.assertTenantContext()`。
- 权限点校验：`employee.read`、`employee.create`、`employee.update`。
- 员工可见范围计算：`self / department / assigned / all`。
- 创建/更新时校验租户启用部门。
- 创建/更新时校验部门岗位规则。
- 停用员工后返回需要失效的登录上下文。

### Repository

`employeeCoreRepository` 负责：

- `employees` 主表列表、计数、详情、按 `user_id` 兜底查询。
- `employees` 主表创建、更新、软删除。
- `tenant_departments` 启用部门查询。
- 所有主表查询和写入强制带 `tenant_id`。

## 保留的遗留直连

本阶段没有处理以下 controller 直连：

- `list_employee_login_bindings` RPC
- `GET /employees/withdepartment`
- `GET /employees/withdepartment/:id`
- `GET /employees/withpost`

原因：

- 这些属于兼容查询或展示补充链路。
- 与主 CRUD 相比风险较低。
- 单独拆分可以降低响应结构回归风险。

## 验收

已执行：

```bash
bun run api:typecheck
bun run check:permission-boundaries
```

验收结果：

- TypeScript 类型检查通过。
- 权限边界检查通过。

## Admin / 小程序对接

本阶段不需要 admin 或微信小程序改代码。

原因：

- 不改变接口路径。
- 不改变请求参数。
- 不改变响应结构。
- 只调整后端分层和租户边界实现。

建议前端回归验证：

- 员工列表。
- 员工详情。
- 新增员工。
- 编辑员工。
- 停用员工。
- 员工部门/岗位选择校验。

## 下一阶段建议

Phase 3：

- 把 `list_employee_login_bindings` RPC 下沉到 repository。
- 把员工登录绑定展示补充逻辑收敛到 service。

Phase 4：

- 处理 `withdepartment` / `withpost` 兼容查询。
- 评估 admin 是否仍在使用这些兼容接口。
- 如仍使用，先下沉查询；如不再使用，形成接口退役计划。
