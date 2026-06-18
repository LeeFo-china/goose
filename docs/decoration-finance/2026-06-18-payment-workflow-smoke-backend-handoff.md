# 装修财务收款 workflow smoke 后端回传

日期：2026-06-18

来源：只读对齐 orange
`/Users/leefo/Public/work/orange/docs/2026-06-18-decoration-finance-payment-workflow-smoke-handoff.md`。

## 1. 后端已准备的测试项目

本次在 gooes 当前后端环境准备了一个专用 smoke 项目，并通过现有 workflow runtime
RPC 按活动施工模版顺序推进到第一个收款节点。

| 字段 | 值 |
| --- | --- |
| tenant ID | `3eebca47-961f-4899-b976-a3d3208d326b` |
| workflow key | `construction_main` |
| workflow definition ID | `8ccf9047-aa88-48ee-abe7-5a79b46845ba` |
| workflow instance ID | `294dc6de-189f-4ecd-a54e-9488cccbddfd` |
| project ID | `d382cd45-9141-476e-a7a5-5bf88d0a3255` |
| project name | `收款联调 Smoke 2026-06-18 01:43:34` |
| current node key | `payment_stage_2` |
| current business kind | `payment_collection` |
| payment type | `stage_2` |
| task ID | `03f6bce9-8d48-4753-8c15-dd36e8aa65a9` |
| task status | `pending` |
| task assignee | `assignee_permission_code = finance.payment.confirm` |
| target finance employee | `bbab0193-43ae-4b7a-a7f3-24314e0f2e0d` / 小龙女 / `18800005001` |

推进顺序：

1. `started`
2. `procedure_demolition`
3. `procedure_plumbing_electrical`
4. 当前停留在 `payment_stage_2`

没有跳过 workflow 模版顺序，也没有手动把实例 current node 改到收款节点。

## 2. 小程序侧验收入口

财务账号登录后以 workflow task 为准获取收款待办：

```http
GET /workflow-tasks?page=1&pageSize=20&subject_type=project&status=pending
```

可以按项目进一步缩小范围：

```http
GET /workflow-tasks?page=1&pageSize=20&subject_type=project&subject_id=d382cd45-9141-476e-a7a5-5bf88d0a3255&status=pending
```

该 task 对财务账号可见，因为小龙女的 `finance_base` 角色已具备：

- `finance.payment.confirm`，scope = `all`
- `project.read`，scope = `all`
- `project.update`，scope = `all`
- `task_center.read`，scope = `self`

当前本仓库的 `/task-center/todos` 仍是旧聚合待办口径，未纳入通用
`workflow_tasks`。本次收款 smoke 不应以 `/task-center/todos` 的数量作为阻塞条件；
小程序任务中心应按 orange 当前实现使用 `/workflow-tasks?status=pending`。

## 3. 预期 action contract

该 task 返回的 action 应包含：

```json
{
  "key": "complete",
  "business_domain": "payment_collection",
  "business_action": "confirm_payment",
  "output_fields": [
    { "type": "payment_collection", "required": true },
    { "type": "number", "required": true },
    { "type": "datetime", "required": false },
    { "type": "image_list", "required": true },
    { "type": "string", "required": false }
  ]
}
```

小程序确认收款仍走：

```http
POST /workflow-tasks/03f6bce9-8d48-4753-8c15-dd36e8aa65a9/complete
```

请求体：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "payment_status": "success",
    "amount": 10000,
    "paid_at": "2026-06-18T10:00:00.000Z",
    "evidence_images": [
      "<direct-upload-returned-object-key>"
    ],
    "remark": "小程序 smoke 收款"
  }
}
```

凭证上传仍使用 direct upload：

- `scene = project_payment`
- `project_id = d382cd45-9141-476e-a7a5-5bf88d0a3255`

## 4. 后端验证结果

已用后端 service 上下文核对：

- `WorkflowTaskService.list()` 对财务账号返回该 pending task。
- `subject_id = d382cd45-9141-476e-a7a5-5bf88d0a3255`
- `current_node_key = payment_stage_2`
- `business_kind = payment_collection`
- `payment_type = stage_2`
- `assignee_permission_code = finance.payment.confirm`
- action 数量为 1，业务动作为 `confirm_payment`

## 5. orange 验收回填

小程序团队已完成本次收款 workflow smoke，并把结果回填到 orange handoff 文档：
`/Users/leefo/Public/work/orange/docs/2026-06-18-decoration-finance-payment-workflow-smoke-handoff.md`。

| 字段 | 回填值 |
| --- | --- |
| project ID | `d382cd45-9141-476e-a7a5-5bf88d0a3255` |
| task ID | `03f6bce9-8d48-4753-8c15-dd36e8aa65a9` |
| payment ID | `5859aec7-a8a8-474b-83d8-ba420bf1555d` |
| ledger ID | `aeaa8344-b5aa-4494-868d-1268520ae58f` |
| payment type | `stage_2` |
| amount | `10000` |
| payment status | `confirmed` |
| ledger entry type | `project_payment` |
| ledger direction | `in` |
| handled by | `bbab0193-43ae-4b7a-a7f3-24314e0f2e0d` / 小龙女 |
| 凭证 object key | `tenants/3eebca47-961f-4899-b976-a3d3208d326b/project-payment/projects/d382cd45-9141-476e-a7a5-5bf88d0a3255/2026/06/18/3fb915cf-13d5-4ef2-928d-3806c9d3fa6c.jpg` |
| complete status | `200` |
| 原 task 状态 | `completed` |
| workflow 当前节点 | `procedure_tiling` |
| workflow 当前业务类型 | `procedure_template` |
| 新 pending task | `234af5ce-f66e-451c-bdcc-89bc9be5ce0a` / 瓦工 |

后端只读核验结果：

- `workflow_tasks.status = completed`
- `payments.status = confirmed`
- `payments.workflow_task_id = 03f6bce9-8d48-4753-8c15-dd36e8aa65a9`
- `finance_ledger_entries.entry_type = project_payment`
- `finance_ledger_entries.direction = in`
- `finance_ledger_entries.payment_id = 5859aec7-a8a8-474b-83d8-ba420bf1555d`
- workflow 当前节点已推进到 `procedure_tiling`

本次未以 `/task-center/todos` count 作为阻塞条件，按后端说明只走
`/workflow-tasks?status=pending`。

## 6. 给小程序团队的回复口径

可以回复：

> 后端已收到并核验本次收款 workflow smoke 回填。`project_payment`
> direct upload 已携带 `scene=project_payment` 和 `project_id`，
> `POST /workflow-tasks/:taskId/complete` 返回 200，原收款 task 已完成，
> 后端已生成 confirmed payment 和 project_payment 入账流水，workflow 已推进到
> `procedure_tiling`。本次验收按 `/workflow-tasks?status=pending` 口径通过，
> 不再以旧 `/task-center/todos` count 作为阻塞项。

后续如果要把收款待办重新纳入小程序统一任务中心入口，需要后端先把
`/task-center/todos` 聚合扩展到通用 `workflow_tasks`，否则小程序继续以
`/workflow-tasks` 作为 workflow 待办源。
