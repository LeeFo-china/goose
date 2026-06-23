# 费用审批与支出付款 Task 1-5 验收记录

日期：2026-06-23

关联计划：

- [2026-06-23-expense-approval-payment-phase-plan.md](./2026-06-23-expense-approval-payment-phase-plan.md)
- [2026-06-23-expense-approval-payment-task0-baseline.md](./2026-06-23-expense-approval-payment-task0-baseline.md)

## 结论

Task 1-3 已完成后端契约修复、受控费用 E2E smoke 和 Admin 只读可见性 smoke。

本次确认：

- 费用申请、主管审批、财务审批、登记打款均通过 workflow runtime/task 推进。
- 费用付款后会写入 `expense_request_settlements`。
- 费用付款后会写入 `finance_ledger_entries`，方向为 `out`，类型为 `expense_settlement`。
- 重复 complete 已完成的付款 task 返回 409，不新增重复支出台账。
- Admin `/expenses` 和 `/finance/ledger` 能看见本次费用申请和支出流水。

## Task 1：后端契约修复

### 根因

历史 migration 只对既有 `expense_request_settlements` 回填过 `finance_ledger_entries`，但运行时 `payExpenseRequest()` 新建 settlement 后没有稳定写入支出台账。

同时，付款重试路径在检测到费用已付款或已有 settlement 后会直接返回最新费用申请，没有对缺失的支出台账做幂等补偿。

### 修复内容

- `expenseRequestRepository.createSettlement()` 改为返回插入后的 settlement row。
- 新增 `expenseRequestRepository.findSettlementByExpenseRequest()`。
- `financeLedgerService` 新增 `createExpenseSettlementLedger()`，复用 repository 的幂等 upsert。
- `payExpenseRequest()` 在新登记打款和已有 settlement 的重试/补偿路径中都按 settlement id 幂等写入支出台账。

### 验证命令

```bash
bun test ./src/services/finance-ledger.test.ts ./src/services/workflow-task-payment-bridge.test.ts ./src/services/expense-requests/legacy/payment.test.ts
bun run typecheck
```

结果：

- `12 pass`
- `tsc -p tsconfig.json --noEmit` 退出码 0

## Task 2-3：受控 E2E smoke

### 样本

| 字段 | 值 |
| --- | --- |
| API | `http://127.0.0.1:3000` |
| Admin | `http://127.0.0.1:3010` |
| expense request ID | `09af78eb-737d-41c7-a5bc-3ca0decc58d9` |
| title | `费用审批支出 smoke 20260623142129` |
| project ID | `c20e4693-e3a8-47b8-840f-4fb3639d6420` |
| workflow instance ID | `419a99c0-1a48-41a3-b34b-084640902fe4` |
| amount | `1000.00` |
| category | `material / 材料费` |
| evidence object key | `expense_request/smoke/phase2-expense-09af78eb-737d-41c7-a5bc-3ca0decc58d9.jpg` |

### 执行账号

| 环节 | 账号 | 员工 |
| --- | --- | --- |
| 申请/提交 | `18800001002` | `珠珠 / 80a9c2ff-9bbb-444b-af9c-0594f5116ff7` |
| 主管审批 | `18800001001` | `萧峰 / cc086608-c436-4753-a8f2-a6b6660056f8` |
| 财务审批/登记打款 | `18800005001` | `小龙女 / bbab0193-43ae-4b7a-a7f3-24314e0f2e0d` |

说明：Task 0 建议的 `18800003001 / 欧阳锋` 具备 `expense_request.approve_manager` 权限码，但对本次费用申请没有审批范围。真实候选接口返回的主管审批人是 `18800001001 / 萧峰`，因此本次 smoke 使用候选接口返回的实际审批人继续推进。

### workflow task

| 节点 | task ID | action key | 结果 |
| --- | --- | --- | --- |
| `manager_review` / 主管审批 | `60895d62-99dd-4d3a-926b-2732edc25861` | `approve` | completed |
| `finance_review` / 财务审批 | `7dbfe3cd-dca7-4d7c-a4e3-93ecc38f4922` | `approve` | completed |
| `payment` / 登记打款 | `ff28a944-151d-4734-a7b4-4adc3f650230` | `pay` | completed |

付款 complete payload 摘要：

```json
{
  "action": "pay",
  "output": {
    "payee_name": "费用 smoke 供应商",
    "payee_bank": "测试银行",
    "payee_account": "6222000000000000",
    "method": "bank_transfer",
    "paid_amount": 1000,
    "evidence_images": [
      "expense_request/smoke/phase2-expense-09af78eb-737d-41c7-a5bc-3ca0decc58d9.jpg"
    ],
    "remark": "费用付款 smoke 单独重试"
  }
}
```

complete 返回摘要：

```json
{
  "result": {
    "ok": true,
    "bridged": true,
    "operation": "pay"
  },
  "expense_request": {
    "status": "paid"
  },
  "workflow_state": {
    "current_node_key": "done",
    "instance_status": "completed",
    "pending_task_count": 0
  }
}
```

### 结算和台账

| 字段 | 值 |
| --- | --- |
| settlement ID | `20b4980e-5517-4f77-9469-0b648a5d9f6c` |
| ledger ID | `d5b60241-ad52-4890-8f03-28a5bee1bbbd` |
| ledger direction | `out` |
| ledger entry_type | `expense_settlement` |
| ledger source_type | `expense_settlement` |
| ledger source_id | `20b4980e-5517-4f77-9469-0b648a5d9f6c` |
| ledger expense_request_id | `09af78eb-737d-41c7-a5bc-3ca0decc58d9` |
| ledger expense_settlement_id | `20b4980e-5517-4f77-9469-0b648a5d9f6c` |
| handled_by | `bbab0193-43ae-4b7a-a7f3-24314e0f2e0d` |
| summary | `费用付款：费用 smoke 供应商` |

### 幂等验证

重复提交已完成的 payment task：

```json
{
  "duplicate_status": 409,
  "duplicate_success": false,
  "duplicate_message": "流程待办已处理",
  "duplicate_code": "WORKFLOW_TASK_NOT_PENDING",
  "ledger_before_count": 1,
  "ledger_after_count": 1
}
```

结论：重复 complete 不会新增重复支出台账。

## Admin 只读 smoke

执行账号：

- `18800000001 / 风清扬`

核验页面：

- `/expenses`
- `/finance/ledger?page=1`

核验结果：

- `/expenses` 可见 `费用审批支出 smoke 20260623142129`。
- `/expenses` 中该申请状态显示为已完成，当前节点显示为已完成。
- `/finance/ledger?page=1` 可见 `费用付款：费用 smoke 供应商`。
- 台账方向显示为支出。
- 台账金额显示为 `¥1,000.00`。
- 未发现前端 console error。
- 未发现相关接口 4xx/5xx。

截图路径：

- `/tmp/gooes-expense-smoke-admin-expenses.png`
- `/tmp/gooes-expense-smoke-admin-ledger.png`

## 注意事项

- 本次 API smoke 使用测试 object key 填充 `evidence_images`，没有执行真实 COS PUT。Task 0 已确认 `scene=expense_request` 的 direct upload 链路存在。
- 费用审批人必须以候选接口和后端权限范围为准，不能仅按权限码判断。
- 费用审批、财务复核、登记打款的业务推进应继续以 workflow task/action 为准。
