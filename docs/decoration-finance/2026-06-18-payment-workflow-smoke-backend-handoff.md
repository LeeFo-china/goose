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

小程序团队完成真实点击验收后，请把结果回填到 orange handoff 文档，并同步给后端：

| 字段 | 回填值 |
| --- | --- |
| project ID | `d382cd45-9141-476e-a7a5-5bf88d0a3255` |
| task ID | `03f6bce9-8d48-4753-8c15-dd36e8aa65a9` |
| payment ID | 待回填 |
| ledger ID | 待回填 |
| 凭证 object key | 待回填 |
| complete 请求日志 | 待回填 |
| complete 响应日志 | 待回填 |
| 项目详情/任务中心截图 | 待回填 |

验收通过标准：

- 财务账号能在小程序 workflow 待办入口看到 `project_payment/payment_collection`。
- 进入项目详情后能识别 `workflowTaskId` 和 `action=confirm_payment`。
- 上传凭证时 direct-init 带 `scene=project_payment` 与上述 `project_id`。
- complete task 返回成功。
- task 从 pending 列表消失。
- 后端生成 `payments.status = confirmed`。
- 后端生成 `finance_ledger_entries.entry_type = project_payment`。
- workflow 推进到 `procedure_tiling`。
