# Expense Requests 权限边界核查

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/expense-requests/index.ts`
- `apps/api/src/services/expense-requests.ts`
- `apps/api/src/repositories/expense-requests.ts`
- `apps/api/src/schema/expense-requests.ts`

## 接口口径

`expense-requests` 属于租户后台费用审批能力，不属于平台超管跨租户管理接口。

因此第一版统一按租户上下文处理：

- 列表、详情、统计、待办：必须有租户上下文。
- 创建、修改、提交、撤回：必须有租户上下文，并继续按申请人/操作人和权限 scope 校验。
- 审批、驳回、登记打款：必须有租户上下文，并继续按当前审批链节点、经办人、权限点和可见范围校验。
- 审批模板：虽然当前为静态模板，也要求租户上下文，避免平台登录态直接访问租户业务入口。
- 审批候选人：必须在当前租户内筛选员工，并按审批权限和 scope 过滤。

## 已有边界

service 层已包含以下关键校验：

- `expense_request.read` 控制费用申请列表、详情、统计可见范围。
- `expense_request.create` 控制创建和修改草稿。
- `expense_request.submit` 控制提交、重新提交、撤回。
- `expense_request.approve_manager` 控制经理审批。
- `expense_request.approve_finance` 控制财务审批。
- `expense_request.pay` 控制登记打款。
- 审批链要求当前节点 assignee 与实际操作员工一致。
- 创建、修改、提交、审批、打款均按 `tenantId` 查询费用申请、员工、项目、审批链、打款记录。

## 本次调整

- controller 从 `BaseController` 迁移到 `TenantBaseController`。
- 删除 controller 内重复的 `authorizationService` 依赖。
- 所有费用申请接口统一使用 `getRequiredTenantContext()`。
- service 新增 `requireTenantId()`，内部使用 `accessPolicyService.assertTenantContext()`。
- service 不再使用 `assertTenantId()` 兼容平台管理员无租户访问费用申请。

## 重要结论

平台超管如果后续需要跨租户查看费用审批数据，应新增独立平台接口，例如：

- `/platform/expense-requests`
- `/platform/expense-requests/:id`

平台接口应显式声明平台管理员权限、租户筛选条件、审计记录和脱敏规则，不能复用租户费用审批接口。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
