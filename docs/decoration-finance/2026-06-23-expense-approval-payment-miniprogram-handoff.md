# 费用审批与支出付款小程序影响说明

日期：2026-06-23

关联记录：

- [2026-06-23-expense-approval-payment-task1-5-smoke.md](./2026-06-23-expense-approval-payment-task1-5-smoke.md)

## 结论

本阶段小程序端暂不需要修改代码。

原因：

- 本轮完成的是 Admin/API 侧费用审批与支出付款闭环。
- 本轮不新增、不调整小程序现有费用中心、费用申请详情和打款页面入口。
- orange 已有费用入口的推进口径已按 workflow v2/actions 运行，本轮不需要配合代码改动。
- 小程序现有项目 workflow、收款、施工节点和费用审批入口契约不受影响。

orange 仓库保持只读，本次没有修改 `/Users/leefo/Public/work/orange`。

## 当前已验证的后端口径

费用审批运行态：

- subject type：`expense_request`
- workflow nodes：
  - `manager_review`
  - `finance_review`
  - `payment`
  - `done`
- 待办入口：
  - `GET /workflow-tasks?page=1&pageSize=20&status=pending&subject_type=expense_request`
- 推进入口：
  - `POST /workflow-tasks/:taskId/complete`

付款节点 action：

```json
{
  "key": "pay",
  "business_domain": "expense_request",
  "business_action": "pay",
  "output_fields": [
    { "name": "payee_name", "type": "string", "required": true },
    { "name": "payee_bank", "type": "string", "required": false },
    { "name": "payee_account", "type": "string", "required": false },
    { "name": "method", "type": "settlement_method", "required": true },
    { "name": "paid_amount", "type": "number", "required": true },
    { "name": "paid_at", "type": "datetime", "required": false },
    { "name": "evidence_images", "type": "image_list", "required": true },
    { "name": "remark", "type": "string", "required": false }
  ]
}
```

幂等和错误：

- 重复 complete 已完成 task 返回 `409 WORKFLOW_TASK_NOT_PENDING`。
- 支出台账不重复写入。
- 有权限码但没有业务范围时，后端会返回 `403 FORBIDDEN`。

## 如果后续小程序要新增或调整费用审批能力

建议继续按现有入口分层演进，不要一次性把 Admin 全部搬到小程序。

### 1. 员工费用申请

适用：员工在小程序发起报销或项目费用申请。

接口：

- `POST /expense-requests`
- `POST /expense-requests/:id/submit`
- `GET /expense-requests/:id`
- `GET /expense-request-categories?page=1&pageSize=100&status=active&mode=reimbursement`
- 凭证上传使用 `scene=expense_request`

创建和提交是业务表入口；提交后进入 workflow runtime。

### 2. 审批待办

适用：经理或财务人员在小程序处理审批。

接口：

- `GET /workflow-tasks?page=1&pageSize=20&status=pending&subject_type=expense_request`
- `POST /workflow-tasks/:taskId/complete`

审批节点 payload：

```json
{
  "action": "approve",
  "output": {
    "comment": "审批意见"
  }
}
```

驳回 payload：

```json
{
  "action": "reject",
  "reason": "驳回原因",
  "output": {
    "comment": "审批意见"
  }
}
```

小程序必须从 `actions[].key` 取动作，不能本地推导。

### 3. 财务付款

适用：财务人员在小程序确认费用打款。

接口：

- `GET /workflow-tasks?page=1&pageSize=20&status=pending&subject_type=expense_request`
- `POST /workflow-tasks/:taskId/complete`

付款 payload：

```json
{
  "action": "pay",
  "output": {
    "payee_name": "收款人",
    "payee_bank": "收款银行",
    "payee_account": "收款账号",
    "method": "bank_transfer",
    "paid_amount": 1000,
    "paid_at": "2026-06-23T14:25:44.324Z",
    "evidence_images": ["expense_request/smoke/example.jpg"],
    "remark": "付款备注"
  }
}
```

完成后后端负责：

- 写入 `expense_request_settlements`。
- 写入 `finance_ledger_entries`，`direction=out`，`entry_type=expense_settlement`。
- 推进 workflow 到 `done`。

小程序不直接写 settlement，不直接写 ledger。

## 小程序需要遵守的通用规则

- 列表必须分页，请使用 `page/pageSize`。
- 待办和按钮只读 `/workflow-tasks.actions[]` 或详情里的 `workflow_state.actions[]`。
- 展示流程只读 `workflow_state.timeline_nodes`、`node.display`、`node.attributes`。
- 不根据节点名、职位名、权限码或旧状态字段本地推导是否可审批或付款。
- 不直接调用旧的审批推进接口来绕过 workflow task。
- 重复点击需要按 task 状态和 409 返回做前端防重提示。

## 给小程序团队的话

可以这样同步：

> 本轮 gooes 完成的是 Admin/API 侧费用审批与支出付款闭环，小程序当前不需要改代码，也不需要新增或调整现有费用中心、费用申请详情和打款页面入口。
>
> 后端已经验证费用申请从提交、主管审批、财务审批到登记打款都可以通过 workflow task/action 推进，付款后会写入 settlement 和支出方向 finance ledger，重复 complete 不会重复入账。orange 现有审批、驳回、撤回、打款动作继续从 workflow_state.actions 取 action key，并统一走 `POST /workflow-tasks/:taskId/complete` 即可。
>
> 如果后续要新增或调整小程序费用能力，我们会按 workflow v2 单独开 handoff。届时小程序仍只消费 `/workflow-tasks`、`workflow_state.timeline_nodes`、`node.display`、`node.attributes`、`actions[]`，所有审批和付款推进只调用 `POST /workflow-tasks/:taskId/complete`，凭证上传使用 `scene=expense_request`，不在小程序本地推导审批节点、付款权限或台账规则。
