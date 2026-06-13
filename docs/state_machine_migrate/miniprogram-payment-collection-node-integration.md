# 小程序收款节点对接说明

## 目标

项目 workflow 到达收款节点时，小程序必须展示并提交 workflow task，
而不是继续依赖旧项目状态动作。典型场景是水电工序完成后进入
`stage_2` 中期进度款节点，确认对应收款已入账后再推进到下一工序。

## 后端动作元数据

小程序从项目详情 `workflow_state.actions` 或
`GET /workflow-tasks?page=1&pageSize=20` 读取动作。收款节点会返回：

```json
{
  "key": "complete",
  "label": "中期进度款",
  "task_id": "uuid",
  "node_key": "middle_payment",
  "node_type": "confirmation",
  "business_domain": "payment_collection",
  "business_action": "confirm_payment",
  "requires_reason": false,
  "disabled": false,
  "output_fields": [
    {
      "name": "payment_status",
      "label": "中期进度款",
      "type": "payment_collection",
      "required": true,
      "payment_type": "stage_2",
      "payment_label": "中期进度款",
      "requirement_mode": "any_confirmed"
    }
  ]
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `business_domain = payment_collection` | 这是收款闸门节点，不是项目状态动作 |
| `business_action = confirm_payment` | 端上展示“确认收款/继续推进”类操作 |
| `payment_type` | 收款类型，`stage_2` 表示中期进度款 |
| `requirement_mode` | `any_confirmed` 表示存在对应已入账收款即可放行 |
| `required_percentage` | 当模式为 `signed_amount_percentage` 时返回，表示签约金额比例 |
| `min_amount` | 历史固定金额配置，存在时展示为最低已入账金额 |

## 小程序提交规则

用户点击收款节点动作时，调用：

```http
POST /workflow-tasks/:taskId/complete
Authorization: Bearer <token>
Content-Type: application/json
```

请求体：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "payment_status": "success"
  }
}
```

后端会检查项目下是否已有对应 `payments` 记录：

- `payments.project_id = 当前项目`
- `payments.type = output_fields[0].payment_type`
- `payments.status = confirmed`

不满足时返回 `409` 和错误码 `WORKFLOW_PAYMENT_COLLECTION_BLOCKED`，小程序
必须保持节点未完成，并提示后端返回的 message。

## 端上改造范围

| 模块 | 改造要求 |
| --- | --- |
| 项目详情/工地详情 | 识别 `business_domain = payment_collection` 的 action，展示收款节点操作 |
| 首页待办/任务中心 | `/workflow-tasks` 返回收款任务时，目标页不要只跳项目详情后丢失操作 |
| workflow 类型 | `WorkflowOutputFieldType` 增加 `payment_collection`，字段增加 `payment_type`、`payment_label`、`requirement_mode`、`required_percentage`、`min_amount` |
| 错误处理 | `WORKFLOW_PAYMENT_COLLECTION_BLOCKED` 展示为业务阻塞，不当作系统异常 |
| 旧项目状态动作 | 不再依赖 `business_domain = project_status` 或旧 `ProjectStatusAction` 生成项目按钮 |

## 验收清单

| 场景 | 期望 |
| --- | --- |
| 水电工序完成后进入中期收款节点 | 小程序显示“中期进度款”待办/操作 |
| 未存在 `stage_2 + confirmed` 收款 | complete 返回 409，端上提示阻塞原因，流程不推进 |
| 已存在 `stage_2 + confirmed` 收款 | complete 成功，流程进入下一工序 |
| 任务中心打开收款待办 | 能进入可处理页面，不只是跳转项目详情后无按钮 |
| 项目详情刷新 | `workflow_state.actions` 展示当前收款节点 action |

