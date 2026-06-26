# 费用审批当前处理对象展示对接

日期：2026-06-26

## 背景

费用审批 workflow v7 支持两类处理对象：

- 指定员工：`workflow_tasks.assignee_employee_id`
- 角色 + 权限点：`workflow_tasks.assignee_role_code` + `assignee_permission_code`

小程序原先在费用审批列表里只读旧费用申请 `assignee` 和 `current_step`，当后端使用角色 + 权限点时没有具体员工，页面只能显示“等待当前处理人操作”。这会让用户无法判断当前卡在经理、财务还是出纳。

## 后端返回字段

以下接口会返回统一展示字段：

- `GET /expense-requests`
- `GET /expense-requests/:id`
- `GET /workflow-tasks?...subject_type=expense_request`
- `GET /workflow-subjects/expense_request/:id/state`

字段为兼容新增：

```ts
assignee_type:
  | 'employee'
  | 'role_permission'
  | 'role'
  | 'permission'
  | 'unassigned';

assignee_display_name: string | null;
assignee_display_hint?: string | null;
current_handler_label: string;
next_action_label?: string;

assignee_employee_id?: string | null;
assignee_employee_name?: string | null;
assignee_employee?: {
  id: string;
  name: string | null;
  avatar: string | null;
} | null;

assignee_role_code?: string | null;
assignee_role_name?: string | null;
assignee_permission_code?: string | null;
assignee_permission_name?: string | null;
```

## 展示规则

小程序不要本地解析 `finance_base`、`expense_request.approve_finance` 等编码。
展示优先级建议：

1. 费用申请卡片主处理人：优先使用 `record.current_handler_label`。
2. 费用申请卡片下一步：优先使用 `record.next_action_label`。
3. workflow task/action：优先使用 `current_handler_label`。
4. 兼容旧接口时，再 fallback 到旧的 `assignee.name` 和 `current_step` 映射。

当前后端内置文案：

| 场景 | 文案 |
| --- | --- |
| 指定员工 | `等待{name}处理` |
| 经理审批 | `等待部门经理审批` |
| 财务审批 | `等待财务人员审核` |
| 出纳打款 | `等待出纳打款` |
| 项目收款确认 | `等待财务人员确认收款` |
| 草稿 | `等待申请人提交` |
| 已驳回 | `等待申请人修改` |
| 已撤回 | `流程已撤回` |
| 已完成/已打款 | `流程完成` |

## 小程序建议修改点

只读核查到当前小程序文件：

- `src/packageEmployees/pages/expenseAction/model.ts`
- `src/packageEmployees/pages/expenseAction/components/ExpenseActionContent.tsx`
- `src/types/api/expense_request.d.ts`
- `src/types/api/workflow_task.d.ts`

建议：

- `ExpenseRequestRecord` 增加 `current_handler_label`、`next_action_label` 和 assignee display 字段。
- `WorkflowAction`、`WorkflowTaskRecord` 增加 assignee display 字段。
- `getCurrentHandlerLabel(record)` 先读 `record.current_handler_label`。
- `getExpenseNextActionLabel(record)` 先读 `record.next_action_label`。
- workflow action/task UI 先读 `current_handler_label`，不要本地拼 role/permission 文案。

## 验收清单

1. 费用申请处于 `finance_review` 且 task 为 `finance_base + expense_request.approve_finance` 时，卡片显示“等待财务人员审核”。
2. 费用申请处于 `payment` 且 task 为 `finance_base + expense_request.pay` 时，卡片显示“等待出纳打款”。
3. 如果 workflow 节点配置为指定员工，卡片显示“等待{name}处理”。
4. 当前登录员工无 action 时，不展示可操作按钮，只展示等待文案。
5. 当前登录员工有 action 时，操作仍以 `workflow_state.actions` 或 `/workflow-tasks.actions` 为准。

## 责任边界

gooes 后端负责返回稳定展示字段和 action/task 权限过滤。
orange 小程序只消费字段，不本地推导角色和权限点含义。
