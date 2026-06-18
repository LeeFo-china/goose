# 装修 Workflow 后续联调后端回执

日期：2026-06-18

来源：orange 只读对接文档
`/Users/leefo/Public/work/orange/docs/state_machine_migrate/2026-06-18-decoration-workflow-next-smoke-backend-handoff.md`

本回执只确认当前可用于联调的后端样本和取证口径，不执行 workflow
complete，不执行 legacy rebuild apply，也不修改 orange 仓库。

## 1. `payment_stage_2` 收款节点

当前可以继续 smoke。后端只读核对时间：`2026-06-18T15:10:33+08:00`。

| 字段 | 值 |
| --- | --- |
| tenant ID | `3eebca47-961f-4899-b976-a3d3208d326b` |
| project ID | `54f11aa5-09a8-4410-a9c5-604a7fe9e09c` |
| workflow instance ID | `0b2a033f-504a-49d6-b196-fe9200761adf` |
| workflow definition | `construction_custom_mq7hqqgl_1_d0c5a149` / `工程施工` |
| definition ID | `2c0e27d5-f296-41de-9653-16c5a4f961d8` |
| version ID | `d7d26ee1-9618-4995-8633-0a73ec3a97c7` |
| current node | `payment_stage_2` / `中期进度款` |
| business kind | `payment_collection` |
| pending task ID | `8cb1b3ac-69e5-42e5-8496-787e3897878c` |
| task action key | `complete` |
| 财务账号 | `18800005001` / `小龙女` |
| employee ID | `bbab0193-43ae-4b7a-a7f3-24314e0f2e0d` |

当前 task action metadata：

```json
{
  "key": "complete",
  "label": "中期进度款",
  "business_domain": "payment_collection",
  "business_action": "confirm_payment",
  "requires_reason": false,
  "output_fields": [
    {
      "name": "payment_status",
      "type": "payment_collection",
      "required": true,
      "payment_type": "stage_2",
      "payment_label": "中期进度款",
      "requirement_mode": "any_confirmed"
    },
    {
      "name": "amount",
      "type": "number",
      "required": true,
      "payment_type": "stage_2",
      "payment_label": "中期进度款",
      "requirement_mode": "any_confirmed"
    },
    {
      "name": "paid_at",
      "type": "datetime",
      "required": false
    },
    {
      "name": "evidence_images",
      "type": "image_list",
      "required": true,
      "min_image_count": 1
    },
    {
      "name": "remark",
      "type": "string",
      "required": false
    }
  ]
}
```

凭证直传口径：

```json
{
  "scene": "project_payment",
  "project_id": "54f11aa5-09a8-4410-a9c5-604a7fe9e09c"
}
```

`project_payment` direct upload 使用员工登录态，后端会校验当前员工是否具备
`finance.payment.confirm` 对该项目的访问能力。当前样本的财务 reviewer 和 task
assignee 均为 `18800005001 / 小龙女`，请用该员工账号执行收款 smoke。

complete 请求：

```http
POST /workflow-tasks/8cb1b3ac-69e5-42e5-8496-787e3897878c/complete
```

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "payment_status": "success",
    "amount": 10000,
    "paid_at": "2026-06-18T10:00:00.000Z",
    "evidence_images": ["<project_payment object key>"],
    "remark": "payment_stage_2 smoke"
  }
}
```

后端执行顺序：创建或复用 `status=confirmed` 的 payment，写入
`finance_ledger_entries`，再 complete workflow task。

完成后期望：

- `payment_stage_2 = done`
- `procedure_tiling = current`
- task `8cb1b3ac-69e5-42e5-8496-787e3897878c` 从 pending 列表消失
- Admin 财务台账出现 `entry_type=project_payment`、`direction=in` 的入账流水

## 2. `project_signing_workflow`

当前不要执行旧 task，也不要让 orange 重试旧 complete。

后端只读核对结果：

| 字段 | 当前值 |
| --- | --- |
| project/customer ID | `1a8589fb-8f3f-4900-a759-6d15438ffcc2` |
| current instance ID | `b58acf8e-4f18-4b40-b5c7-919600e5e636` |
| current workflow | `construction_main` / `项目施工主流程` |
| current node | `designing` / `设计中` |
| old pending task ID | `aa6d93f8-f825-4f9a-bd04-f346ba3e2d5f` |
| old task action key | `complete` |

该实例仍是旧 `construction_main` running 实例。正式重建仍受
`docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-manual-gates.json`
中的 `legacy_instance_apply_gates.project_signing_rebuild.confirmed=false`
控制，后端本次未执行 `--apply`。

目标模板已存在：

| 字段 | 值 |
| --- | --- |
| target workflow key | `project_signing` |
| target workflow name | `项目签约主流程` |
| target definition ID | `dd559d20-58b2-4d38-996e-34d82cbe68ea` |
| target active version ID | `ea45f1fb-45f0-4ea0-8d22-a0149aabe903` |
| expected rebuild node | `designing` |

受控 rebuild 完成后，后端需要重新查询并回传新的：

- workflow instance ID
- pending task ID
- current node
- `actions[].key`
- complete payload 要求

预期推进路径为：

```text
designing -> proposal_confirmed -> signed -> design_finalized -> pending_start -> end
```

已知 project signing 节点输出字段规则：

- `designing`：`action=complete`，`output={}`
- `proposal_confirmed`：`action=complete`，`output.signed_amount` 必填
- `signed`：`action=complete`，`output={}`
- `design_finalized`：`action=complete`，`output.start_date` 与
  `output.construction_manager_employee_id` 必填
- `pending_start`：`action=complete`，`output={}`

orange 在后端明确“rebuild 已完成”前，不应重复提交旧 task
`aa6d93f8-f825-4f9a-bd04-f346ba3e2d5f`。

## 3. Admin 可见性取证口径

建议和 `payment_stage_2` 新样本一起验收。

### 接口取证

1. workflow 状态：

```http
GET /workflow-subjects/project/54f11aa5-09a8-4410-a9c5-604a7fe9e09c/state
```

验收点：

- complete 前：`current_node_key=payment_stage_2`
- complete 后：`payment_stage_2=done`，`procedure_tiling=current`
- `actions` 不再返回已完成的 payment task action

2. 待办列表：

```http
GET /workflow-tasks?page=1&pageSize=20&status=pending
```

验收点：task `8cb1b3ac-69e5-42e5-8496-787e3897878c` 消失。

3. 财务台账：

```http
GET /finance/ledger?page=1&pageSize=20&project_id=54f11aa5-09a8-4410-a9c5-604a7fe9e09c&entry_type=project_payment&direction=in
```

验收点：

- 返回新增 ledger ID
- `entry_type=project_payment`
- `direction=in`
- `workflow_task_id=8cb1b3ac-69e5-42e5-8496-787e3897878c`
- `payment_id` 与 complete 响应或后续查询一致

### Admin 页面取证

1. 项目详情：

```text
/projects/54f11aa5-09a8-4410-a9c5-604a7fe9e09c
```

重点截图：项目 workflow 状态面板显示已从“中期进度款”推进到“瓦工”。

2. 财务台账：

```text
/finance/ledger
```

重点截图：能看到该项目对应的 `project_payment` 入账流水。

### manual gate 回填字段

回填到
`docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-manual-gates.json`
里的 `admin_finance_and_workflow_visibility` 场景时，建议至少包含：

- `status`
- `project_id`
- `workflow_instance_id`
- `task_id`
- `payment_id`
- `ledger_id`
- `admin_project_workflow_evidence`
- `admin_finance_ledger_evidence`
- `completed_at`

## 给 orange 的回复建议

可以直接回复：

```text
后端已重新核对实时数据。

payment_stage_2 可以继续 smoke：
- project ID: 54f11aa5-09a8-4410-a9c5-604a7fe9e09c
- workflow instance ID: 0b2a033f-504a-49d6-b196-fe9200761adf
- current node: payment_stage_2 / 中期进度款
- pending task ID: 8cb1b3ac-69e5-42e5-8496-787e3897878c
- actions[].key: complete
- 财务账号: 18800005001 / 小龙女
- employee ID: bbab0193-43ae-4b7a-a7f3-24314e0f2e0d

凭证 direct upload 继续使用：
scene=project_payment
project_id=54f11aa5-09a8-4410-a9c5-604a7fe9e09c

complete 仍只调用：
POST /workflow-tasks/8cb1b3ac-69e5-42e5-8496-787e3897878c/complete

output 需要携带 amount、paid_at、evidence_images，至少 1 张凭证。
完成后预期 payment_stage_2=done，procedure_tiling=current，并生成 payment ID 和
ledger ID。

project_signing_workflow 当前不要复测旧 task。
项目 1a8589fb-8f3f-4900-a759-6d15438ffcc2 仍在旧 construction_main/designing
实例，旧 task aa6d93f8-f825-4f9a-bd04-f346ba3e2d5f 不要重复 complete。后端还未
执行受控 rebuild，因为 manual gate 里的 project_signing_rebuild.confirmed 仍为
false。rebuild 完成后，后端会重新回传新的 instance ID、task ID、当前节点和 payload。

Admin 可见性请和本次 payment_stage_2 smoke 一起回填：
- workflow state 或项目详情截图
- /finance/ledger 接口结果或财务台账截图
- payment ID、ledger ID、凭证 object key、complete 请求/响应
```
