# 小程序财务人员页面设计建议

日期：2026-07-05

## 1. 结论

建议小程序首期做“财务工作台”，不要把 Admin 财务模块完整搬到移动端。

首期目标是让财务人员在手机上处理高频、时效性强的事项：

- 项目收款确认。
- 费用申请财务审核。
- 费用申请出纳打款。
- 逾期应收和跟进提醒。
- 月度经营关键数只读查看。

不建议首期在小程序实现：

- 成本分类、预算配置、月结、反结账。
- 对账异常补账、台账修复、历史流水标记。
- 报表导出。
- 人工创建/调整/取消应收计划和人工核销。

这些能力已有后端接口，但更适合 Admin，因为操作风险高、字段多、需要横向对比和审计上下文。

## 2. 本次核对范围

gooes 后端/API：

- `apps/api/src/controllers/finance/index.ts`
- `apps/api/src/controllers/finance/receivables-controller.ts`
- `apps/api/src/controllers/finance/reports-controller.ts`
- `apps/api/src/controllers/payment/index.ts`
- `apps/api/src/controllers/expense-requests/index.ts`
- `apps/api/src/controllers/workflow-tasks/index.ts`
- `apps/api/src/controllers/task-center/index.ts`
- `apps/api/src/services/payments.ts`
- `apps/api/src/services/finance-ledger.ts`
- `apps/api/src/services/project-receivables.ts`
- `apps/api/src/services/project-receivables-operations.ts`
- `apps/api/src/services/project-receivable-allocations.ts`
- `apps/api/src/services/finance-reconciliation.ts`
- `apps/api/src/services/finance-project-summary.ts`
- `apps/api/src/services/finance-monthly-overview.ts`
- `apps/api/src/services/expense-requests/legacy/*`
- `apps/api/src/schema/finance*.ts`
- `apps/api/src/schema/payment.ts`
- `apps/api/src/schema/expense-requests.ts`
- `apps/api/src/schema/workflow-subjects.ts`
- `packages/domain/src/permission.ts`

orange 小程序只读核对：

- `/Users/leefo/Public/work/orange/src/app.config.ts`
- `/Users/leefo/Public/work/orange/src/services/task_center.ts`
- `/Users/leefo/Public/work/orange/src/services/workflow_task.ts`
- `/Users/leefo/Public/work/orange/src/services/expense_request.ts`
- `/Users/leefo/Public/work/orange/src/services/project_payment.ts`
- `/Users/leefo/Public/work/orange/src/services/permission.ts`
- `/Users/leefo/Public/work/orange/src/types/api/task_center.d.ts`
- `/Users/leefo/Public/work/orange/src/types/api/permission.d.ts`
- `/Users/leefo/Public/work/orange/src/packageEmployees/pages/expenseDetail/*`
- `/Users/leefo/Public/work/orange/src/packageEmployees/pages/expenseAction/*`
- `/Users/leefo/Public/work/orange/src/packageProjects/pages/detail/*`

本次没有修改 orange 仓库。

## 3. 页面信息架构

### 3.1 推荐入口

首期建议放在现有员工分包：

```text
packageEmployees/pages/finance/index
```

原因：

- 当前 `packageEmployees` 已包含费用详情、费用操作、充值、订阅等内部员工工具。
- 首期只是聚合页，不需要单独拆 `packageFinance`。
- 后续如果财务页面超过 3 个，再迁到独立 `packageFinance`。

入口展示条件建议用 `/auth/me/permissions` 返回的权限判断。只要命中以下任一权限，就展示“财务工作台”：

```text
finance.payment.confirm
expense_request.approve_finance
expense_request.pay
finance.receivable.view
finance.receivable.manage
finance.ledger.view
finance.dashboard.view
finance.reports.read
finance.view
```

不要用部门名、角色名、岗位名硬推导财务身份。后端 workflow task 已按 assignee 和 permission 做最终过滤。

### 3.2 首屏结构

建议首屏是一个密度适中的工作台：

1. 顶部摘要
   - 待确认收款数量。
   - 待财务审核数量。
   - 待出纳打款数量。
   - 逾期应收金额。
2. 分段 tab
   - `待办`
   - `应收`
   - `概览`
3. 待办列表
   - 默认展示 `project_payment`、`expense_request` 两类高优先级任务。
   - 点击卡片进入已有项目详情或费用详情页面。
4. 应收列表
   - 默认筛选 `overdue_only=true` 或 `follow_up_due_only=true`。
   - 首期只做查看和登记跟进。
5. 概览
   - 月度收入、支出、毛利、未收、逾期、对账异常数。
   - 点击“查看项目风险”进入项目财务摘要列表。

## 4. 后端接口使用建议

### 4.1 工作台待办

优先使用现有 workflow task 接口，而不是直接扫业务表：

```http
GET /workflow-tasks?page=1&pageSize=20&status=pending
GET /workflow-tasks?page=1&pageSize=20&status=pending&subject_type=project
GET /workflow-tasks?page=1&pageSize=20&status=pending&subject_type=expense_request
```

后端已按以下规则过滤：

- `assignee_employee_id` 命中当前员工。
- 或命中 `assignee_role_code`。
- 或命中 `assignee_permission_code`。
- 指定给其他员工的 task 不返回。

小程序卡片字段优先级：

| UI 字段 | 优先读取 |
| --- | --- |
| 标题 | `card_context.title` -> `title` -> `node_title` |
| 副标题 | `card_context.subtitle` -> `card_context.primary_meta` -> 业务 fallback |
| 金额 | `card_context.amount_text` |
| 人员 | `card_context.people_text` 或 `current_handler_label` |
| 时间 | `card_context.time_text` -> `due_at` -> `created_at` |
| 操作按钮 | `actions[0].label`，收款任务可显示“确认收款” |
| 跳转 | `target_url` 或本地按 subject 兜底 |

已有 `orange/src/services/task_center.ts` 已完成大部分映射，建议复用。

### 4.2 项目收款确认

列表来源：

```http
GET /workflow-tasks?page=1&pageSize=20&status=pending&subject_type=project
```

识别条件：

```text
type = project_payment
或 actions[].business_domain = payment_collection
或 actions[].business_action = confirm_payment
或 actions[].output_fields[].type = payment_collection
```

提交仍走 workflow task：

```http
POST /workflow-tasks/:taskId/complete
```

请求体使用后端 action key：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "payment_status": "success",
    "amount": 10000,
    "paid_at": "2026-07-05T10:00:00.000Z",
    "evidence_images": ["project_payment/example.jpg"],
    "remark": "已入账"
  }
}
```

凭证上传继续使用现有 `ProjectPaymentService.uploadCollectionEvidence(filePaths, projectId)`，scene 为 `project_payment`。

不要在小程序直接调用 `POST /payments` 创建流程收款。流程收款由 `workflow-task-payment-bridge` 创建 confirmed payment、写入 `finance_ledger_entries` 并推进 workflow。

### 4.3 费用财务审核和出纳打款

列表来源：

```http
GET /workflow-tasks?page=1&pageSize=20&status=pending&subject_type=expense_request
```

财务审核 action：

```json
{
  "action": "approve",
  "output": {
    "comment": "审核通过"
  }
}
```

驳回 action：

```json
{
  "action": "reject",
  "reason": "票据不完整",
  "output": {
    "comment": "请补充发票"
  }
}
```

出纳打款 action：

```json
{
  "action": "pay",
  "output": {
    "payee_name": "张三",
    "payee_bank": "招商银行",
    "payee_account": "6222...",
    "method": "bank_transfer",
    "paid_amount": 1000,
    "paid_at": "2026-07-05T10:00:00.000Z",
    "evidence_images": ["expense_request/example.jpg"],
    "remark": "已打款"
  }
}
```

后端完成后会：

- 写入 `expense_request_settlements`。
- 写入支出方向 `finance_ledger_entries`。
- 推进 expense workflow。

小程序不直接写 settlement，不直接写 ledger。

### 4.4 应收查看和跟进

首期推荐只做列表、详情、跟进记录：

```http
GET /finance/receivables?page=1&pageSize=20&overdue_only=true
GET /finance/receivables?page=1&pageSize=20&follow_up_due_only=true
GET /finance/receivables/:id/events?page=1&pageSize=20
POST /finance/receivables/:id/follow-ups
```

跟进请求：

```json
{
  "note": "已电话提醒客户本周付款",
  "next_follow_up_at": "2026-07-08T09:00:00.000Z"
}
```

权限注意：

- 查看列表：`finance.receivable.view`、`finance.receivable.manage` 或 `finance.view`。
- 登记跟进当前后端要求 `finance.receivable.manage`。

不建议首期暴露以下接口：

```http
POST /finance/receivables
PATCH /finance/receivables/:id
PATCH /finance/receivables/:id/due-date
POST /finance/receivables/:id/cancel
POST /finance/receivables/:id/allocations
PATCH /finance/receivables/:id/allocations/:allocationId
POST /finance/receivables/:id/allocations/:allocationId/reverse
```

这些动作影响财务事实和核销关系，建议留在 Admin。

### 4.5 只读经营概览

月度概览：

```http
GET /finance/reports/monthly-overview?month=2026-07
```

可展示字段：

- `summary.income_amount`
- `summary.expense_amount`
- `summary.gross_profit_amount`
- `summary.gross_profit_rate`
- `summary.receivable_remaining_amount`
- `summary.overdue_receivable_amount`
- `summary.reconciliation_exception_count`
- `summary.unallocated_expense_amount`
- `closing.status`

项目财务摘要：

```http
GET /finance/project-summary?page=1&pageSize=20&risk_level=danger
GET /finance/project-summary?page=1&pageSize=20&overdue=true
GET /projects/:id/finance-summary
```

可展示字段：

- `contract_amount`
- `receivable_amount`
- `received_amount`
- `receivable_remaining_amount`
- `overdue_amount`
- `expense_paid_amount`
- `actual_profit_amount`
- `projected_profit_amount`
- `budget_usage_ratio`
- `risk_level`
- `risk_reasons`

`GET /finance/project-summary` 默认可能返回 `analytics`。如果 `analytics.scope.truncated = true`，小程序必须提示“排行基于前 100 个匹配项目”，不要宣称全量排行。

## 5. 权限映射

| 页面/操作 | 后端权限 |
| --- | --- |
| 财务工作台入口 | 命中任一财务/费用财务权限即可展示 |
| 收款确认待办 | workflow task 命中 `finance.payment.confirm` 或指定员工 |
| 收款确认提交 | `POST /workflow-tasks/:id/complete` 再次校验 task assignee |
| 费用财务审核 | `expense_request.approve_finance`，按费用可见范围过滤 |
| 出纳打款 | `expense_request.pay`，按费用可见范围过滤 |
| 费用列表/详情 | `expense_request.read`，支持 self/assigned/department/all |
| 应收查看 | `finance.receivable.view`、`finance.receivable.manage` 或 `finance.view` |
| 应收跟进/调整/核销 | `finance.receivable.manage` |
| 台账查看 | `finance.ledger.view` 或 `finance.view` |
| 台账成本归集 | `finance.cost-allocation.manage` |
| 台账修复/历史标记 | `finance.reconciliation.manage` |
| 项目财务摘要 | `finance.view`、`finance.ledger.view`、`finance.receivable.view/manage`；否则按 `project.read` 项目范围 |
| 成本预算查看 | `finance.view`、`finance.budget.view/manage`；否则按 `project.read` 项目范围 |
| 成本预算保存 | `finance.budget.manage` |
| 对账异常查看 | `finance.view`、`finance.ledger.view`、`finance.receivable.view/manage` |
| 对账异常处理 | `finance.reconciliation.manage` |
| 报表查看 | `finance.reports.read`、`finance.view`、`finance.ledger.view` 或 `finance.dashboard.view` |
| 报表导出 | `finance.reports.export` |
| 月结查看 | `finance.closing.read`、`finance.closing.manage`、`finance.reports.read` 或 `finance.view` |
| 月结/反结账 | `finance.closing.manage` |

前端只负责根据权限控制入口和按钮显隐；真正可操作性以后端返回的 task/action 和接口 403/409 为准。

## 6. 交互和错误处理

### 6.1 防重复点击

所有提交按钮都应有本地 loading 锁。服务端仍会兜底：

- 已处理 workflow task：`409 WORKFLOW_TASK_NOT_PENDING`。
- 当前节点变化：`409 WORKFLOW_NODE_NOT_CURRENT`。
- 费用审批状态变化：`409 EXPENSE_REQUEST_STATE_CHANGED`。
- 已有收款台账：`409 PAYMENT_LEDGER_ALREADY_EXISTS`。

小程序遇到 409 时建议提示“状态已更新，请刷新后查看”，并刷新当前列表或详情。

### 6.2 403 处理

403 代表后端权限或数据范围不允许。不要在前端绕过。

建议提示：

```text
当前账号无权处理该事项，已为你刷新列表
```

然后刷新待办列表。

### 6.3 表单校验

收款确认：

- 金额必须大于 0。
- 凭证至少 1 张。
- 备注按 action metadata 判断是否必填；历史文档建议继续传。

费用打款：

- `paid_amount` 必须等于费用申请总金额，后端会校验。
- 凭证至少 1 张。
- `paid_by` 不需要前端手填，优先用当前员工；通过 workflow task complete 时由后端桥接。

应收跟进：

- `note` 必填，最多 500 字。
- `next_follow_up_at` 可选。

## 7. 小程序改造落点

建议新增：

```text
src/packageEmployees/pages/finance/index.tsx
src/packageEmployees/pages/finance/index.scss
src/packageEmployees/pages/finance/index.config.ts
src/services/finance.ts
src/types/api/finance.d.ts
```

建议复用：

```text
src/services/task_center.ts
src/services/workflow_task.ts
src/services/permission.ts
src/services/project_payment.ts
src/services/expense_request.ts
src/packageProjects/pages/detail/index.tsx
src/packageEmployees/pages/expenseDetail/index.tsx
src/packageEmployees/pages/expenseAction/index.tsx
```

首期服务封装只需要：

```ts
FinanceService.monthlyOverview({ month })
FinanceService.projectSummary(params)
FinanceService.receivables(params)
FinanceService.receivableEvents(id, params)
FinanceService.createReceivableFollowUp(id, payload)
```

不建议首期封装所有 Admin 财务写接口，避免移动端误用。

## 8. 验收清单

1. 财务账号只有 `finance.payment.confirm` 时：
   - 能看到收款确认待办。
   - 不能看到应收管理写操作。
   - 点击待办进入项目详情并打开确认收款。
2. 财务审核账号有 `expense_request.approve_finance` 时：
   - 能看到费用财务审核待办。
   - 审批通过和驳回都使用后端 `actions[].key`。
3. 出纳账号有 `expense_request.pay` 时：
   - 能看到待打款费用。
   - 上传凭证后可提交打款。
   - 打款完成后待办消失，费用详情刷新为已打款。
4. 应收查看账号只有 `finance.receivable.view` 时：
   - 能查看应收列表。
   - 不显示登记跟进、调整、核销按钮。
5. 应收管理账号有 `finance.receivable.manage` 时：
   - 能登记跟进。
   - 409/403 后能刷新页面并给出明确提示。
6. 无任何财务权限的员工：
   - 不展示财务工作台入口。
   - 直接访问页面时显示无权限状态。
7. 所有列表请求都带 `page/pageSize`，`pageSize <= 100`。
8. 小程序没有修改 orange 以外仓库，也没有本地推导财务审批、收款和台账规则。

## 9. 给小程序团队的同步口径

本期建议新增一个小程序“财务工作台”聚合页，复用现有任务中心、项目详情收款确认和费用详情/操作页。收款确认、费用审核、费用打款都继续以后端 workflow task/action 为唯一事实来源，小程序不要根据角色、岗位、节点名或旧状态本地推导按钮。

移动端首期只处理高频事项：收款确认、费用财务审核、出纳打款、逾期应收查看和跟进、月度关键指标只读查看。成本配置、预算配置、台账修复、对账补账、月结、报表导出仍留在 Admin。

orange 需要改的主要是新增财务工作台页面和轻量 `FinanceService`，复用现有 `TaskCenterService`、`WorkflowTaskService`、`ProjectPaymentService`、`ExpenseRequestService`。gooes 本次没有改后端接口，也没有改 orange。
