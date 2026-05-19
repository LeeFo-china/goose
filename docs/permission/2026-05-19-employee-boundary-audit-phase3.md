# Employee 权限边界核查 Phase 3

日期：2026-05-19

## 本阶段目标

把员工列表中的登录绑定补充查询从 controller 下沉到 service / repository。

涉及能力：

- `list_employee_login_bindings` RPC
- 员工列表中的 `login_bindings` 展示数据

## 已落地文件

- `apps/api/src/repositories/employee-core.ts`
- `apps/api/src/services/employee-core.ts`
- `apps/api/src/controllers/employee/index.ts`

## 调整内容

### Repository

新增：

- `employeeCoreRepository.listLoginBindingRows(employeeIds)`

职责：

- 调用 `list_employee_login_bindings` RPC。
- 统一包装数据库错误。
- 返回结构化 `EmployeeLoginBindingRow[]`。

### Service

新增：

- `employeeCoreService.listEmployeeLoginBindingMap(employeeIds)`

职责：

- 调用 repository。
- 转为 `Map<employee_id, bindingRow>`，便于 controller 做响应组装。

### Controller

删除 controller 内的 RPC 直连方法。

保留：

- `buildEmployeeLoginBindings()` 展示层逻辑。

原因：

- 该方法只负责把登录绑定状态转换为前端展示字段，没有直接访问数据库。
- 暂时保留在 controller 内可避免响应结构变化。

## 当前遗留

Employee controller 中仍保留的 Supabase 直连只剩兼容查询：

- `GET /employees/withdepartment`
- `GET /employees/withdepartment/:id`
- `GET /employees/withpost`

这些接口下一阶段单独处理。

## 验收

应执行：

```bash
bun run api:typecheck
bun run check:permission-boundaries
git diff --check
```

## Admin / 小程序对接

本阶段不需要 admin 或微信小程序改代码。

原因：

- 不改变接口路径。
- 不改变请求参数。
- 不改变响应结构。
