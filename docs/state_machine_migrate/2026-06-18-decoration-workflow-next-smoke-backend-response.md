# 装修 Workflow 后续联调后端回执

日期：2026-06-18

来源：orange 只读对接文档
`/Users/leefo/Public/work/orange/docs/state_machine_migrate/2026-06-18-decoration-workflow-next-smoke-backend-handoff.md`

本回执只确认当前可用于联调的后端样本和取证口径，不执行 workflow
complete，不执行 legacy rebuild apply，也不修改 orange 仓库。

## 1. `payment_stage_2` 收款节点

orange 已完成本节点 smoke。后端首次回传核对时间：
`2026-06-18T15:10:33+08:00`；完成后只读复核时间：
`2026-06-18T15:21:19+08:00`。

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

### orange 回填结果

本次 smoke 结果：通过。

| 字段 | 值 |
| --- | --- |
| payment ID | `b5356f22-ed67-4e29-9afc-94ecccba146d` |
| ledger ID | `9fc924b7-b5db-4356-a91e-d83dacecbbce` |
| complete task status | `completed` |
| workflow current node | `procedure_tiling` / `瓦工` |
| new pending task ID | `f3f75f56-4180-40c1-b953-459a832ef146` |
| new pending node | `procedure_tiling` |

凭证 object key：

```text
tenants/3eebca47-961f-4899-b976-a3d3208d326b/project-payment/projects/54f11aa5-09a8-4410-a9c5-604a7fe9e09c/2026/06/18/f67e886c-2648-434f-89cf-7397a650f0d4.jpg
```

后端只读复核：

- payment `b5356f22-ed67-4e29-9afc-94ecccba146d`：
  `status=confirmed`，`type=stage_2`，`amount=10000`，
  `workflow_task_id=8cb1b3ac-69e5-42e5-8496-787e3897878c`
- ledger `9fc924b7-b5db-4356-a91e-d83dacecbbce`：
  `entry_type=project_payment`，`direction=in`，`amount=10000`，
  `payment_id=b5356f22-ed67-4e29-9afc-94ecccba146d`
- workflow transition log：
  `payment_stage_2 -> procedure_tiling`，`action=complete`，
  actor 为 `bbab0193-43ae-4b7a-a7f3-24314e0f2e0d`

orange 请求日志：

- `/tmp/orange-payment-stage2-smoke-1781767305119-sanitized.json`
- `/tmp/orange-payment-stage2-admin-visibility-1781767376188-sanitized.json`

orange 后续回执：

- orange 已记录后端只读复核结果，确认本次 `payment_stage_2` smoke 与后端复核一致。
- Admin 可见性接口证据已记录：`/finance/ledger` 可见 `project_payment`
  入账流水，workflow state 已推进到 `procedure_tiling`。
- 如最终 manual gates 要求 UI 截图，orange 再补 Admin 项目详情 workflow
  状态和财务台账页面截图。
- `project_signing_workflow` 已按 rebuild 后的新实例复测通过，旧 task
  `aa6d93f8-f825-4f9a-bd04-f346ba3e2d5f` 不再复测。

## 2. `project_signing_workflow`

当前不要执行旧 task，也不要让 orange 重试旧 complete。后端已完成受控
rebuild，orange 已使用新实例完成 `project_signing_workflow` 复测。

旧实例核对结果：

| 字段 | 当前值 |
| --- | --- |
| project/customer ID | `1a8589fb-8f3f-4900-a759-6d15438ffcc2` |
| legacy instance ID | `b58acf8e-4f18-4b40-b5c7-919600e5e636` |
| legacy workflow | `construction_main` / `项目施工主流程` |
| legacy node | `designing` / `设计中` |
| legacy instance status | `canceled` |
| old pending task ID | `aa6d93f8-f825-4f9a-bd04-f346ba3e2d5f` |
| old task action key | `complete` |

受控 rebuild 执行记录：

- 文档：`docs/state_machine_migrate/2026-06-18-project-signing-rebuild-execution.md`
- apply 时间：`2026-06-18T15:38:33+08:00`
- apply 结果：`ok = true`
- canceled instance count：`1`
- deleted instance count：`0`

受控 rebuild 后的初始新实例和新 task：

| 字段 | 值 |
| --- | --- |
| target workflow key | `project_signing` |
| target workflow name | `项目签约主流程` |
| target definition ID | `dd559d20-58b2-4d38-996e-34d82cbe68ea` |
| target active version ID | `ea45f1fb-45f0-4ea0-8d22-a0149aabe903` |
| workflow instance ID | `651184a9-095d-42a9-8669-476c1d125a37` |
| rebuild initial node | `designing` / `设计中` |
| rebuild initial pending task ID | `bb156359-8c31-4ee8-9ba7-140ca0f54e23` |
| task status | `pending` |
| task assignee | `assignee_permission_code = project.update` |
| actions[].key | `complete` |
| business domain | `workflow_project` |
| business action | `designing` |
| output fields | `[]` |

rebuild 初始节点 complete payload：

```json
{
  "action": "complete",
  "reason": null,
  "output": {}
}
```

复测推进路径为：

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

orange 已使用新 task `bb156359-8c31-4ee8-9ba7-140ca0f54e23`
完成复测，不应重复提交旧 task `aa6d93f8-f825-4f9a-bd04-f346ba3e2d5f`。

### orange 回填结果

本次 smoke 结果：通过。

| 字段 | 值 |
| --- | --- |
| 执行账号 | `18800003001` / 欧阳锋 |
| project ID | `1a8589fb-8f3f-4900-a759-6d15438ffcc2` |
| project signing instance ID | `651184a9-095d-42a9-8669-476c1d125a37` |
| final project status | `started` |
| construction workflow instance ID | `a7d4bc13-f8c6-4afe-9376-a6284b96e5e3` |
| construction current node | `started` / `确认开工` |
| construction pending task ID | `f68e9aaa-6020-4bdc-85a5-8c889f31cb1e` |

执行链路：

| 节点 | task ID | action | output | 后端结果 |
| --- | --- | --- | --- | --- |
| `designing` | `bb156359-8c31-4ee8-9ba7-140ca0f54e23` | `confirm_proposal` | `{}` | `proposal_confirmed` |
| `proposal_confirmed` | `ac5bda62-925e-4626-865a-892530edb2f2` | `sign_contract` | `{ "signed_amount": 100000 }` | `signed` |
| `signed` | `efb9fec5-46cd-4ceb-9a17-6b9708cf3098` | `finalize_design` | `{}` | `design_finalized` |
| `design_finalized` | `8c03662d-2b23-49f7-b8ae-bbedc9c1ffc2` | `schedule_construction` | `{ "start_date": "2026-06-19", "construction_manager_employee_id": "5d2c906f-635d-4aa0-9a64-16d7edb380c8" }` | `pending_start` |
| `pending_start` | `56e92dba-ae0b-47b9-bd9e-6c8662f7bd1e` | `start_project` | `{}` | `started` |

后端只读复核：

- project `1a8589fb-8f3f-4900-a759-6d15438ffcc2`：
  `status=started`，`signed_amount=100000`，
  `start_date=2026-06-19T00:00:00+00:00`
- project signing instance `651184a9-095d-42a9-8669-476c1d125a37`：
  `status=completed`，`current_node_key=end`
- 新施工 workflow instance
  `a7d4bc13-f8c6-4afe-9376-a6284b96e5e3`：
  `status=running`，`current_node_key=started`
- 当前施工 pending task `f68e9aaa-6020-4bdc-85a5-8c889f31cb1e`：
  `actions[].key=complete`，`business_domain=workflow_project`，
  `business_action=started`

orange 请求日志：

- `/tmp/orange-project-signing-workflow-smoke-1781769027232-sanitized.json`

后续如果继续施工 workflow smoke，请先确认验收范围，再从 task
`f68e9aaa-6020-4bdc-85a5-8c889f31cb1e` 开始。

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
收到，后端已只读复核 payment_stage_2 smoke 结果，和 orange 回填一致。

本次 payment_stage_2 已通过：
- project ID: 54f11aa5-09a8-4410-a9c5-604a7fe9e09c
- workflow instance ID: 0b2a033f-504a-49d6-b196-fe9200761adf
- completed task ID: 8cb1b3ac-69e5-42e5-8496-787e3897878c
- payment ID: b5356f22-ed67-4e29-9afc-94ecccba146d
- ledger ID: 9fc924b7-b5db-4356-a91e-d83dacecbbce
- workflow current: procedure_tiling
- new pending task: f3f75f56-4180-40c1-b953-459a832ef146

Admin 可见性接口证据也已收到：
/finance/ledger 可见 project_payment 入账流水，workflow state 已推进到 procedure_tiling。
如果最终门禁需要 UI 截图，可以再补 Admin 项目详情和财务台账页面截图。

project_signing_workflow 也已只读复核通过：
- project ID: 1a8589fb-8f3f-4900-a759-6d15438ffcc2
- project signing instance ID: 651184a9-095d-42a9-8669-476c1d125a37
- completed task chain:
  bb156359 -> ac5bda62 -> efb9fec5 -> 8c03662d -> 56e92dba
- signed_amount: 100000
- start_date: 2026-06-19
- construction_manager_employee_id: 5d2c906f-635d-4aa0-9a64-16d7edb380c8
- final project status: started
- new construction workflow instance: a7d4bc13-f8c6-4afe-9376-a6284b96e5e3
- construction current node: started / 确认开工
- current pending task: f68e9aaa-6020-4bdc-85a5-8c889f31cb1e

旧 task aa6d93f8-f825-4f9a-bd04-f346ba3e2d5f 不需要、也不应该再复测。
如果继续施工 workflow smoke，请先确认本轮范围，再从新的施工 task
f68e9aaa-6020-4bdc-85a5-8c889f31cb1e 开始。
```
