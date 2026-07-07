# 小程序财务应收 Complete Smoke 归档

日期：2026-07-07

分支：`docs/miniprogram-finance-complete-smoke`

worktree：`/Users/leefo/Public/work/gooes/.worktrees/docs-miniprogram-finance-complete-smoke`

## 结论

orange 小程序财务工作台应收联调已完成 read-only、project bootstrap、
workflow action、`receivable_context` 和 complete 写入链路验证。

后端只读复核确认：

- 收款确认成功。
- 应收计划已核销。
- `project_receivable_allocations` 已写入。
- `finance_ledger_entries` 已写入。
- workflow 已推进到 `end`。
- 被消费 task 已不再出现在小龙女可见的 pending project task 列表。
- 重复 complete 返回 409，无收款权限员工 complete 返回 403。

本轮没有修改 orange 仓库。当前 sample task 已消费，不能再作为
read-only 候选样本复用。

## 联调环境

- API base URL：`http://192.168.1.19:3000`
- 租户：`固始晴天装饰工程有限公司`
- 员工：`小龙女`
- 小程序侧仓库：`/Users/leefo/Public/work/orange`，只读交接，不由后端修改。

本轮样本：

| 对象 | ID |
| --- | --- |
| workflow task | `98193cf7-ff1f-44d1-ba35-7fdcb4585686` |
| project | `407537b4-2adc-4a0f-ac83-bdaecf70e559` |
| workflow instance | `3077a567-d1c1-4d68-a4e7-32000d7d0189` |
| workflow node | `payment_stage_2` |
| receivable plan | `fc12222c-d244-459d-a92b-e76aa50333f9` |

## 样本准备

初始阻塞点不是网络或接口契约，而是当前小龙女账号可见 pending
workflow task 中没有处于 `payment_collection` 且开启应收计划的节点。

后端用既有 workflow runtime RPC 准备受控样本：

- 使用旧的独立 smoke workflow definition：
  `64575a74-e932-458c-ba9f-3278d8575491`
- active version：
  `6c6abeeb-a81b-47d8-b373-331ed77cb92a`
- 图结构：`start -> payment_stage_2 -> end`
- 节点配置：
  - `business_kind=payment_collection`
  - `payment_type=stage_2`
  - `receivable_plan_enabled=true`
  - `receivable_amount_mode=fixed_amount`
  - `receivable_fixed_amount=10000`
  - `receivable_due_offset_days=0`
  - `required_permissions=["finance.payment.confirm"]`

为避免重新启用测试 definition 留下状态变化，准备时在同一数据库事务中：

1. 临时把 smoke definition 从 `archived` 置为 `active`。
2. 调用 `start_workflow_instance` 生成 pending 收款 task。
3. 立即恢复 smoke definition 为 `archived`。

准备后的 task：

```json
{
  "task_id": "98193cf7-ff1f-44d1-ba35-7fdcb4585686",
  "workflow_instance_id": "3077a567-d1c1-4d68-a4e7-32000d7d0189",
  "workflow_instance_node_id": "a15f8b6c-4e45-4be0-b692-b8f7348216a2",
  "node_key": "payment_stage_2",
  "assignee_permission_code": "finance.payment.confirm",
  "current_business_kind": "payment_collection"
}
```

后端随后通过 `buildWorkflowTaskActionsForTask` 触发并确认
`receivable_context` 已生成，对应应收计划：

```json
{
  "receivable_plan_id": "fc12222c-d244-459d-a92b-e76aa50333f9",
  "receivable_amount": 10000,
  "receivable_paid_amount": 0,
  "receivable_remaining_amount": 10000,
  "receivable_status": "pending",
  "receivable_due_date": "2026-07-07"
}
```

## Read-only Smoke

orange 使用参数：

```bash
ORANGE_RECEIVABLES_SMOKE_BASE_URL=http://192.168.1.19:3000
ORANGE_RECEIVABLES_SMOKE_TASK_ID=98193cf7-ff1f-44d1-ba35-7fdcb4585686
ORANGE_RECEIVABLES_SMOKE_PROJECT_ID=407537b4-2adc-4a0f-ac83-bdaecf70e559
```

结果：

```json
{
  "ok": true,
  "mode": "read_only",
  "status": "candidate_found",
  "candidate": {
    "task": "98193cf7-ff1f-44d1-ba35-7fdcb4585686",
    "workflow_instance": "3077a567-d1c1-4d68-a4e7-32000d7d0189",
    "node": "payment_stage_2",
    "action_key": "complete",
    "receivable_plan_id": "fc12222c-d244-459d-a92b-e76aa50333f9",
    "receivable_amount": 10000,
    "receivable_remaining_amount": 10000,
    "receivable_status": "pending",
    "due_date": "2026-07-07"
  }
}
```

project bootstrap 也确认：

- `current_node_key=payment_stage_2`
- `business_kind=payment_collection`
- `action.business_action=confirm_payment`
- `output_fields` 包含 `receivable_context` / `receivable_summary`

`pnpm run smoke:finance-workbench:miniprogram` 通过。

## Complete 写入 Smoke

orange 本次消费同一条 task 跑 complete 写入链路。小程序只回传 payment
fields，没有回传只读 `receivable_context`。

orange 实际写入开关：

```bash
ORANGE_RECEIVABLES_SMOKE_ALLOW_COMPLETE=true
```

complete output：

```json
{
  "payment_status": "confirmed",
  "amount": 10000,
  "paid_at": "2026-07-07T02:00:00.000Z",
  "evidence_images": ["orange-complete-smoke"],
  "remark": "orange complete smoke"
}
```

写入前：

```json
{
  "receivable_plan_id": "fc12222c-d244-459d-a92b-e76aa50333f9",
  "status": "pending",
  "paid_amount": 0,
  "remaining_amount": 10000
}
```

写入后：

```json
{
  "receivable_plan_id": "fc12222c-d244-459d-a92b-e76aa50333f9",
  "status": "paid",
  "paid_amount": 10000,
  "remaining_amount": 0
}
```

complete 响应关键结果：

```json
{
  "result": {
    "ok": true,
    "bridged": true,
    "operation": "confirm_payment"
  },
  "payment": {
    "id": "9dc57b67-a571-49db-a68c-60da2bc6ab1d",
    "project_id": "407537b4-2adc-4a0f-ac83-bdaecf70e559",
    "amount": 10000,
    "type": "stage_2",
    "status": "confirmed",
    "workflow_task_id": "98193cf7-ff1f-44d1-ba35-7fdcb4585686",
    "source_type": "workflow_task",
    "source_id": "98193cf7-ff1f-44d1-ba35-7fdcb4585686",
    "remark": "orange complete smoke"
  },
  "receivable_allocation": {
    "id": "eff5720a-a16c-472f-bf55-cf53fecc7ed1",
    "receivable_plan_id": "fc12222c-d244-459d-a92b-e76aa50333f9",
    "payment_id": "9dc57b67-a571-49db-a68c-60da2bc6ab1d",
    "amount": 10000
  },
  "workflow_state": {
    "instance_id": "3077a567-d1c1-4d68-a4e7-32000d7d0189",
    "instance_status": "completed",
    "current_node_key": "end",
    "pending_task_count": 0
  }
}
```

前端刷新后：

- pending task 从 2 条变 1 条。
- 被消费 task `98193cf7-ff1f-44d1-ba35-7fdcb4585686` 不再出现在
  pending 列表。
- 当前只剩 `tile_work` 样本。
- project bootstrap 返回 `instance_status=completed`、
  `current_node_key=end`、`current_node=null`。

项目应收 summary：

```json
{
  "paid_amount": 20000,
  "remaining_amount": 3000
}
```

## 后端复核

后端用只读查询复核 orange 回传结果和数据库状态一致：

| 检查项 | 结果 |
| --- | --- |
| task completed | 通过 |
| workflow instance completed 且 current node 为 end | 通过 |
| workflow subject state completed 且 pending_task_count=0 | 通过 |
| receivable plan paid 且 paid_amount=10000 | 通过 |
| payment confirmed 且 amount=10000 | 通过 |
| allocation 匹配 plan/payment/task | 通过 |
| ledger 写入且 amount=10000 | 通过 |
| 当前 workflow instance 无 pending task | 通过 |
| 小龙女 pending project task 不再包含被消费 task | 通过 |

复核到的最终状态：

```json
{
  "task": {
    "id": "98193cf7-ff1f-44d1-ba35-7fdcb4585686",
    "status": "completed",
    "completed_by": "bbab0193-43ae-4b7a-a7f3-24314e0f2e0d"
  },
  "workflow_instance": {
    "id": "3077a567-d1c1-4d68-a4e7-32000d7d0189",
    "status": "completed",
    "current_node_key": "end"
  },
  "workflow_subject_state": {
    "instance_status": "completed",
    "current_node_key": "end",
    "current_business_kind": null,
    "pending_task_count": 0
  },
  "receivable_plan": {
    "id": "fc12222c-d244-459d-a92b-e76aa50333f9",
    "amount": 10000,
    "paid_amount": 10000,
    "status": "paid"
  },
  "payment": {
    "id": "9dc57b67-a571-49db-a68c-60da2bc6ab1d",
    "status": "confirmed",
    "payment_channel": "manual"
  },
  "allocation": {
    "id": "eff5720a-a16c-472f-bf55-cf53fecc7ed1",
    "amount": 10000,
    "source_type": "workflow_task"
  },
  "ledger": {
    "id": "cec06dc5-cfeb-4c88-8585-e2d31b0785a0",
    "direction": "in",
    "entry_type": "project_payment",
    "amount": 10000,
    "summary": "项目收款入账"
  }
}
```

## 403 / 409 状态

orange 本轮 complete 链路没有在小程序 UI 内实际触发 403 / 409。
后端在 complete 归档后补跑服务层错误场景，验证结果如下：

| 场景 | 操作 | 结果 |
| --- | --- | --- |
| 409 | 小龙女对已消费 task 再次 complete | `409 WORKFLOW_TASK_NOT_PENDING`，消息 `流程待办已处理` |
| 403 | 无 `finance.payment.confirm` 权限员工 complete 同一 task | `403 FORBIDDEN`，消息 `无权限` |

补验后复核：

- task 仍为 `completed`。
- payment 数量仍为 1，未重复写入。
- 409 / 403 的后端行为与小程序 contract smoke 的刷新处理预期一致。

如果后续产品验收要求在小程序 UI 内实际点出 403 / 409，需要另准备独立样本
或指定账号/数据，不再复用新的 read-only 候选样本。

## 后续事项

1. 如需反复验证 read-only 或 complete，后端按同样方式准备新的
   `payment_collection` workflow 样本。
2. 如需验证 `overdue_only=true`、`follow_up_due_only=true` 和
   `next_follow_up_at` 保存，需要准备独立应收样本，避免污染已归档
   complete 样本。
3. 如果产品要求财务工作台顶部展示全量精确数量，后端需要补统计字段
   或统计接口，小程序不能用当前页数量冒充全量。
4. 小程序财务首期归档后，继续推进 Supabase RLS disabled 的多租户
   安全整改评估。
