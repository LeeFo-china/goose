# 阶段 2.1：应收核销 Allocation ID 响应补丁

日期：2026-06-24

## 结论

阶段 2.1 只补齐应收核销的验收和审计可观测性。

收款 workflow complete 成功后，后端在响应里返回本次应收核销记录的只读摘要：

```json
{
  "receivable_allocation": {
    "id": "allocation-id",
    "receivable_plan_id": "plan-id",
    "payment_id": "payment-id",
    "amount": 10000
  }
}
```

小程序不需要提交 allocation ID，也不需要调用核销接口。核销仍由 gooes 后端在
`POST /workflow-tasks/:taskId/complete` 内部完成并保证幂等。

## 范围

本补丁包含：

- `projectReceivablesService.allocateWorkflowPayment()` 返回创建或复用的 allocation 记录。
- `workflowTaskPaymentBridge.complete()` 在开启应收计划的收款节点完成后返回 `receivable_allocation`。
- 小程序 smoke 可以从 complete 响应直接回填 allocation ID。

本补丁不包含：

- 新增 allocation 列表查询接口。
- 改变小程序 complete payload。
- 改变 workflow v2 timeline、actions 或 `receivable_context` 契约。
- 改变 Admin 页面。

## API 契约

接口：

```http
POST /workflow-tasks/:taskId/complete
```

收款节点请求体保持不变：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "amount": 10000,
    "paid_at": "2026-06-24T10:00:00.000Z",
    "evidence_images": ["<project_payment object key>"],
    "remark": "收款已确认"
  }
}
```

当当前 task 是开启应收计划的 `payment_collection` 节点时，响应新增：

```json
{
  "result": {
    "ok": true,
    "bridged": true,
    "operation": "confirm_payment"
  },
  "payment": {
    "id": "payment-id"
  },
  "receivable_allocation": {
    "id": "allocation-id",
    "receivable_plan_id": "plan-id",
    "payment_id": "payment-id",
    "amount": 10000
  },
  "workflow_state": {}
}
```

如果当前收款节点未启用应收计划，响应不包含 `receivable_allocation`。

## 小程序对接口径

orange 侧无需改提交逻辑：

- 继续只提交 `amount`、`paid_at`、`evidence_images`、`remark`。
- 不提交 `receivable_context`。
- 不提交或保存 allocation ID 作为后续业务输入。
- 如果 complete 响应包含 `receivable_allocation.id`，只在 smoke 记录中回填。

## 验收

最小验证：

```bash
cd apps/api
bun test ./src/services/project-receivables.test.ts ./src/services/workflow-task-payment-bridge.test.ts
```

验收点：

- enabled receivable plan 的 payment task complete 后返回 `receivable_allocation.id`。
- 同一个 task 重试仍复用后端幂等逻辑，不要求小程序参与核销。
- 未启用应收计划的收款节点不返回 `receivable_allocation`。
