# Workflow 迁移 Admin 端对接说明

## 目的

Admin 端项目推进不能再依赖旧项目状态动作接口或旧
`business_domain = project_status` 动作。项目、客户、费用审批的可操作入口
统一来自 `workflow_state.actions` 或 `/workflow-tasks`，执行统一走
`POST /workflow-tasks/:taskId/complete`。

## 当前后端项目合约

项目详情、项目 workflow 状态面板和任务中心应使用：

```http
GET /workflow-subjects/project/:projectId/state
GET /workflow-subjects/project/:projectId/timeline?page=1&pageSize=20
POST /workflow-tasks/:taskId/complete
```

项目详情业务接口仍可用于读取项目基本信息和工序状态：

```http
GET /projects/:id
GET /projects/:id/construction-stages
```

但项目推进不再通过：

```http
POST /projects/:id/status-transition
GET /projects/:id/status-transitions
PATCH /projects/:id { "status": "..." }
```

`PATCH /projects/:id` 如果包含 `status`，后端会返回：

```text
项目状态必须通过 workflow 节点推进
```

## Workflow Action 字段

Admin 端应以 action metadata 直接驱动按钮和表单：

```json
{
  "key": "complete",
  "label": "项目签约",
  "task_id": "uuid",
  "node_key": "proposal_confirmed",
  "node_type": "task",
  "business_domain": "workflow_project",
  "business_action": "proposal_confirmed",
  "requires_reason": false,
  "disabled": false,
  "output_fields": [
    {
      "name": "signed_amount",
      "label": "签约金额",
      "type": "number",
      "required": true
    }
  ]
}
```

字段含义与小程序一致：

| 字段 | 说明 |
| --- | --- |
| `key` | 提交 complete 接口时的 `action` |
| `task_id` | workflow 待办 ID |
| `node_key` | 当前 workflow 节点 |
| `node_type` | 当前节点类型 |
| `business_domain` | 项目业务节点为 `workflow_project`，收款节点为 `payment_collection` |
| `business_action` | 项目业务节点使用当前 `node_key`；收款节点使用 `confirm_payment` |
| `output_fields` | Admin 弹窗需要收集并提交的 output 字段 |

## 项目业务节点映射

Admin 项目状态面板仍可以在 UI 上展示“项目签约”“排期开工”等业务文案，
但映射来源必须是 workflow 节点，而不是旧状态动作接口。

项目签约 workflow 主线：

| workflow `node_key` | complete 后端 effect | Admin 表单 |
| --- | --- | --- |
| `designing` | `confirm_proposal` | 直接确认 |
| `proposal_confirmed` | `sign_contract` | `signed_amount` |
| `signed` | `finalize_design` | 直接确认 |
| `design_finalized` | `schedule_construction` | `start_date`、`construction_manager_employee_id` |
| `pending_start` | `start_project` | 直接确认 |

施工 workflow 主线：

| workflow `node_key` | complete 后端 effect | Admin 表单 |
| --- | --- | --- |
| `started` | `start_construction` | 直接确认 |
| `procedure_*` | workflow runtime complete | 施工日志/图片字段，见 action `output_fields` |
| `final_acceptance` | `start_acceptance` | 受工序完成情况阻塞 |
| `handover` | workflow runtime complete | 交房确认字段，见 action `output_fields` |

`pause_project`、`resume_project`、`mark_invalid` 是异常动作，不属于标准模板主线。
Admin 模板设计器不得把 `on_hold`、`invalid` 当成主流程节点发布；异常入口应独立于
模板主线处理并记录原因、操作者和恢复来源。

提交示例：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "signed_amount": 300000
  }
}
```

## 收款节点

收款节点返回：

```json
{
  "business_domain": "payment_collection",
  "business_action": "confirm_payment",
  "output_fields": [
    {
      "name": "payment_status",
      "type": "payment_collection",
      "payment_type": "stage_2",
      "payment_label": "中期进度款",
      "requirement_mode": "any_confirmed"
    }
  ]
}
```

Admin 端点击确认时提交：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "payment_status": "success"
  }
}
```

如果项目下没有对应 `payment_type + confirmed` 收款记录，后端返回 `409`
和错误码 `WORKFLOW_PAYMENT_COLLECTION_BLOCKED`。Admin 端应展示后端 message，
保持 workflow 节点未完成。

## 当前 Admin 改造点

本次 gooes admin 已调整：

| 文件 | 改造内容 |
| --- | --- |
| `apps/admin/components/workflows/workflow-subject-state-panel.tsx` | workflow action 类型支持 `workflow_project`、`payment_collection` 和收款字段 |
| `apps/admin/components/projects/project-status-panel-state.ts` | 项目 action 从 `workflow_project`/`payment_collection` 生成，不再要求 `project_status` |
| `apps/admin/components/projects/project-status-action-dialog.tsx` | 收款节点使用 workflow 操作文案，不再显示旧状态流转描述 |
| `apps/admin/components/projects/project-mutation-types.ts` | 项目动作类型补充 workflow task、business domain、output field 元数据 |

## 仍需注意的边界

- Admin 项目状态面板当前支持项目业务节点和收款节点。
- 工序节点如果要求 `project_log`，Admin 端暂未实现“先创建施工日志再完成
  workflow task”的专用表单；该场景目前由小程序工地/施工端承接。
- Workflow 设计器的运行调试面板可以继续使用 runtime complete-node 能力做
  设计/测试，但项目正常业务推进不应绕过 `/workflow-tasks/:taskId/complete`。
- `ProjectStatusActionItem` 等历史类型名在 admin 内部仍可能存在，但不能再
  代表旧接口数据源；后续可单独重命名为 `ProjectWorkflowActionItem`。

## 验收清单

| 场景 | 期望 |
| --- | --- |
| 项目当前节点为 `proposal_confirmed` | Admin 显示“项目签约”，要求填写签约金额，提交 `/workflow-tasks/:taskId/complete` |
| 项目当前节点为 `design_finalized` | Admin 显示“排期开工”，要求选择开工日期和工程负责人 |
| 项目当前节点为收款节点 | Admin 显示收款确认动作，提交 `payment_status = success` |
| 收款未满足 | 后端返回 `WORKFLOW_PAYMENT_COLLECTION_BLOCKED`，Admin 展示阻塞原因 |
| 完成 workflow task 后 | Admin 刷新项目详情和 workflow state，不本地推断下一节点 |
| 无 `workflow_state.actions` | Admin 只展示状态，不显示项目推进按钮 |

## 验证命令

```bash
pnpm --dir apps/admin check
```
