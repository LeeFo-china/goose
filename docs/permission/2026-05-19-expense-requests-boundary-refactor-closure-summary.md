# Expense Requests 权限边界重构闭环摘要

日期：2026-05-19

## 范围

- `GET /expense-requests`
- `GET /expense-requests/:id`
- `POST /expense-requests`
- `PATCH /expense-requests/:id`
- `PUT /expense-requests/:id`
- `GET /expense-requests/approval-template`
- `GET /expense-requests/approval-candidates`
- `GET /expense-requests/todo`
- `GET /expense-requests/stats/summary`
- `POST /expense-requests/:id/submit`
- `POST /expense-requests/:id/approve`
- `POST /expense-requests/:id/reject`
- `POST /expense-requests/:id/cancel`
- `POST /expense-requests/:id/pay`

## 本次调整

- 将 `expenseRequestService` 内的员工存在性查询下沉到 `expenseRequestRepository.employeeExists()`。
- 将 `expenseRequestService` 内的项目存在性查询下沉到 `expenseRequestRepository.projectExists()`。
- `expenseRequestService` 删除 `SupabaseDB` 直接依赖。
- 补充费用审批权限边界闭环摘要。

## 权限口径

`expense-requests` 是租户后台费用审批能力，不复用平台超管接口。

- 所有费用审批接口统一要求租户上下文。
- 列表、详情、统计、待办使用 `expense_request.read` 控制可见范围。
- 创建和修改草稿使用 `expense_request.create`。
- 提交、重新提交、撤回使用 `expense_request.submit`。
- 经理审批使用 `expense_request.approve_manager`。
- 财务审批使用 `expense_request.approve_finance`。
- 登记打款使用 `expense_request.pay`。
- 审批候选人必须属于当前租户，并按审批权限和 scope 过滤。

## 租户边界

- Controller 继承 `TenantBaseController`，所有入口使用 `getRequiredTenantContext()`。
- Service 通过 `requireTenantId()` 强制费用审批业务必须有租户上下文。
- 查询费用申请、审批链、审批记录、打款记录、费用明细、员工、项目时均传入当前租户 ID。
- 创建费用申请写入当前租户 `tenant_id`。
- 明细、审批链、审批日志和打款记录写入当前租户 `tenant_id`。
- 项目和员工存在性校验通过 repository 执行，并强制当前租户过滤。

## 审批链边界

- 审批通过和驳回前会校验费用申请处于可操作状态。
- 当前审批节点必须是 `current`。
- 当前节点 assignee 必须等于实际审批员工。
- 当前节点 step 必须与费用申请 `current_step` 一致。
- 审批操作员工必须属于当前租户。
- 登记打款前必须校验费用申请已通过且没有重复打款记录。

## 平台接口边界

平台超管如果后续需要跨租户查看费用审批，应新增显式平台接口，例如：

- `GET /platform/expense-requests`
- `GET /platform/expense-requests/:id`

平台接口必须显式声明：

- 平台管理员权限点。
- 租户筛选条件。
- 审计记录。
- 打款凭证、收款账号等敏感信息脱敏规则。

不能复用当前租户费用审批接口绕过租户上下文。

## 小程序与 Admin 对接

本轮是后端边界重构，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。

## 验收

- `apps/api/src/controllers/expense-requests/index.ts` 无 `SupabaseDB`、`getAdminClient`、`from(`、`rpc(`、`accessPolicyService`、`authorizationService` 直接访问。
- `apps/api/src/services/expense-requests.ts` 无 `SupabaseDB`、`getAdminClient`、`from(`、`rpc(` 直接访问。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
