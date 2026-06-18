# Workflow 节点契约 v2 小程序对接说明

日期：2026-06-18

## 目标

本次不只补“发起验收”字段，而是把项目 workflow 对小程序的契约统一成：

```text
timeline_nodes[] = 节点顺序 + 节点展示 + 节点属性 + 节点动作
```

小程序以后只消费后端返回的 `timeline_nodes[].display`、
`timeline_nodes[].attributes`、`timeline_nodes[].actions` 和 workflow task
`actions[]`。不要再根据节点名称、旧 `construction_stages.current_stage`、
`next_stage`、阶段 `status`、本地枚举或 `action_label` 反推业务规则。

本文只写入 gooes 仓库。`/Users/leefo/Public/work/orange` 仍由小程序团队维护，
gooes 不修改 orange 源码。

## 后端已提供的契约

项目详情和 workflow state 已返回项目 timeline 节点契约：

```http
GET /projects/:projectId/employee-detail-bootstrap
GET /workflow-subjects/project/:projectId/state
GET /workflow-tasks?page=1&pageSize=20&status=pending&subject_type=project
```

其中：

| 字段 | 用途 |
| --- | --- |
| `workflow_progress.timeline_nodes[]` | 项目详情、流程抽屉、施工流程时间线的首选节点数据 |
| `workflow_state.timeline_nodes[]` | 当前 subject state 中的节点数据，可作为详情刷新或独立 state 入口 |
| `workflow_state.actions[]` | 当前员工可见的 pending task 快捷入口 |
| `/workflow-tasks[].actions[]` | 任务中心、待办列表和兜底操作入口 |
| `construction_stages` | 阶段明细、日志/验收详情兼容数据；不再作为 workflow 按钮来源 |

完成 workflow task 仍统一调用：

```http
POST /workflow-tasks/:taskId/complete
Content-Type: application/json

{
  "action": "<actions[].key>",
  "reason": null,
  "output": {}
}
```

`action` 必须取后端返回的 `actions[].key`，不能使用 `business_action`、
`action_label` 或本地枚举替代。

## timeline node 字段

节点结构示例：

```json
{
  "node_key": "procedure_plumbing_electrical",
  "node_title": "水电",
  "node_type": "procedure",
  "business_kind": "procedure_template",
  "status": "blocked",
  "display": {
    "label": "水电",
    "status_label": "待验收",
    "status_variant": "warning"
  },
  "attributes": {
    "stage_code": "plumbing_electrical",
    "require_log": true,
    "min_image_count": 3,
    "acceptance_enabled": true,
    "acceptance_required": true,
    "acceptance_id": null,
    "acceptance_status": null
  },
  "actions": [
    {
      "key": "create_acceptance",
      "label": "发起验收",
      "business_domain": "project_acceptance",
      "business_action": "create",
      "disabled": false,
      "stage_code": "plumbing_electrical",
      "acceptance_id": null,
      "acceptance_status": null
    }
  ]
}
```

### 展示规则

| 目的 | 小程序读取 |
| --- | --- |
| 节点顺序 | 只按 `timeline_nodes[]` 数组顺序 |
| 节点标题 | 优先 `node.display.label`，其次 `node.node_title` |
| 节点状态文案 | `node.display.status_label` |
| 节点状态样式 | `node.display.status_variant` |
| 节点是否当前/已完成/受阻 | `node.status`，不要从阶段状态反推 |
| 节点能力 | `node.attributes` |
| 节点按钮 | `node.actions[]` |

建议小程序流程抽屉和“下一步处理”都从 timeline 当前节点或第一个带 enabled action
的 blocked/current 节点读取，不要再用 `construction_stages.current_stage` 或
`next_stage` 决定当前 workflow 节点。

## 节点属性

工序节点常见 attributes：

| 字段 | 说明 |
| --- | --- |
| `stage_code` | 创建施工日志、验收单时使用的阶段编码 |
| `require_log` | 是否要求先创建施工日志 |
| `min_image_count` | 施工日志最少图片数；没有返回时按 `0` |
| `acceptance_enabled` | 该工序是否开启阶段验收 |
| `acceptance_required` | 该工序是否要求验收闭环后才算业务完成 |
| `acceptance_id` | 已有关联验收单 ID，没有则为 `null` |
| `acceptance_status` | 验收状态，没有则为 `null` |
| `assignee_employee_id` | 节点负责人 ID，如果后端分配了负责人 |
| `assignee_employee_name` | 节点负责人姓名 |

收款节点常见 attributes：

| 字段 | 说明 |
| --- | --- |
| `payment_type` | 收款类型，如 `stage_2` |
| `assignee_employee_id` | 财务负责人 ID |
| `assignee_employee_name` | 财务负责人姓名 |

## 节点动作

所有按钮和交互只按 actions 渲染。

| action | 场景 | 小程序处理 |
| --- | --- | --- |
| `complete` | 工序、签约、开工等 workflow task | 调 `POST /workflow-tasks/:taskId/complete` |
| `create_acceptance` | 发起阶段验收 | 调验收创建页或 `POST /project-acceptances` |
| `edit_acceptance` | 继续编辑验收单 | 打开验收详情编辑 |
| `view_acceptance` | 查看验收单 | 打开验收详情只读或按状态展示后续动作 |
| `confirm_payment` | 收款确认动作的业务语义 | 仍以返回的 `key` 调 complete，凭证/金额按 `output_fields` 提交 |

如果 `action.disabled = true`，端上可以展示置灰状态，并使用
`disabled_reason` 作为提示；不得绕过禁用状态本地发起提交。

如果节点和顶层都没有可用 actions，页面保持只读或提示刷新，不要 fallback 到旧
状态按钮。

## 阶段验收语义

`acceptance_enabled` 来自 workflow 工序节点配置。

### `acceptance_enabled=false`

小程序不展示“发起验收”。工序日志 complete 成功后，节点变为 `done` 并进入下一
节点是正确结果。

即使旧 `construction_stages.stages[].acceptance_action` 有兼容数据，也不能据此在
workflow 抽屉或下一步处理里合成本地验收动作。

### `acceptance_enabled=true`

工序日志 complete 不等于验收闭环。

后端会在 timeline 节点上返回验收状态和验收动作：

- 未创建验收单：`display.status_label = 待验收`，`actions[].key =
  create_acceptance`。
- 已提交待复核：`display.status_label = 待复核`，可按返回 action 查看或编辑。
- 主管已复核：`display.status_label = 待业主确认`。
- 被驳回：`display.status_label = 需整改`。
- 客户确认后：`acceptance_status = customer_confirmed`，节点可展示为已完成。

因此小程序完成工序日志后必须刷新项目详情或 subject state，再按刷新后的
`timeline_nodes[].actions` 展示验收入口。

## 小程序改造要求

| 模块 | 要求 |
| --- | --- |
| 项目详情 bootstrap | 保存并透传 `workflow_progress.timeline_nodes` 和 `workflow_state.timeline_nodes` |
| 流程抽屉/时间线 | 节点顺序、文案、状态全部按 `timeline_nodes[].display/status` |
| 下一步处理 | 优先取当前或受阻节点的 enabled action，不再读旧阶段 current/next 推动作 |
| 施工日志入口 | 从节点 `attributes.require_log/min_image_count/stage_code` 和 action `output_fields` 判断 |
| 阶段验收入口 | 从节点 `attributes.acceptance_enabled` 和 `actions[]` 判断 |
| 收款入口 | 从 `payment_collection` action 的 `output_fields` 判断金额、凭证、收款类型 |
| 任务中心 | 继续走 `/workflow-tasks?status=pending`，按 `actions[].key` complete |
| 兼容任务中心 | 如继续走 `/task-center/todos`，只能读 `metadata.workflow_actions[].key` |

明确禁止：

- 用节点名称判断是否水电、瓦工、收款或验收。
- 用 `construction_stages.current_stage`、`next_stage` 或阶段 `status` 推导当前
  workflow 节点。
- 用本地枚举或 `action_label` 合成按钮。
- 在缺少 `task_id` 时本地拼 complete 请求。
- 在 complete 成功后不刷新就使用旧响应继续判断下一步。

## 推荐调用顺序

打开项目详情：

```text
1. GET /projects/:projectId/employee-detail-bootstrap
2. 渲染 workflow_progress.timeline_nodes
3. 渲染 workflow_state.actions 和 timeline node actions
```

处理工序日志：

```text
1. 从当前 timeline node 找到 complete action
2. 如果 output_fields 含 project_log，先 POST /project-logs
3. POST /workflow-tasks/:taskId/complete
4. 刷新 employee-detail-bootstrap 或 /workflow-subjects/project/:id/state
5. 按刷新后的 node.actions 判断是否出现 create_acceptance/edit_acceptance/view_acceptance
```

处理阶段验收：

```text
1. 从 node.actions 找到 create_acceptance/edit_acceptance/view_acceptance
2. 按 action.stage_code、action.acceptance_id 打开验收流程
3. submit / leader approve / customer confirm 后刷新项目详情
4. 以刷新后的 node.display 和 attributes.acceptance_status 为准
```

处理收款节点：

```text
1. 从 workflow task 或 timeline node 找到 payment_collection action
2. 按 output_fields 渲染金额、凭证、结算方式等输入
3. project_payment 凭证上传继续带 scene=project_payment 和 project_id
4. POST /workflow-tasks/:taskId/complete
5. 刷新 timeline，确认收款节点 done、下一节点 current
```

## Smoke 验收清单

| 场景 | 期望 |
| --- | --- |
| `acceptance_enabled=false` 工序 | 不展示发起验收；日志 complete 后节点 `done` 并进入下一节点 |
| `acceptance_enabled=true` 未验收 | 节点不展示为纯已完成；返回待验收状态和验收 action |
| 工序节点要求日志 | action 或 attributes 带 `stage_code/min_image_count`，日志创建成功后才 complete |
| 收款节点 | 金额和凭证按 `output_fields` 提交，complete 后 workflow 进入下一节点 |
| 无 actions | 页面只读或提示刷新，不展示旧状态按钮 |
| `/workflow-tasks` 待办 | `actions[].key/task_id/node_key` 正常可用 |
| 兼容 `/task-center/todos` | 只读 `metadata.workflow_actions[].key`，不读 `action_label` 推动作 |

## 给小程序端的回复

```text
后端已把项目 workflow 契约统一成 v2：节点顺序、展示、能力和交互都通过
timeline_nodes 返回。

小程序后续请按以下口径改造：
1. 流程顺序只按 workflow_progress.timeline_nodes 或 workflow_state.timeline_nodes。
2. 节点文案和状态只按 node.display/status。
3. 节点能力只按 node.attributes，例如 require_log、min_image_count、
   acceptance_enabled、acceptance_required、payment_type、assignee。
4. 所有按钮只按 node.actions、workflow_state.actions 或 /workflow-tasks[].actions。
5. 不再根据节点名称、construction_stages.current_stage/next_stage/status、本地枚举
   或 action_label 反推业务规则。

阶段验收规则也已统一：
- acceptance_enabled=false：不展示发起验收；日志 complete 后节点 done 并进入下一节点。
- acceptance_enabled=true：日志 complete 不等于验收闭环；刷新后按后端返回的
  create_acceptance/edit_acceptance/view_acceptance 处理验收。

对接文档在 gooes：
docs/state_machine_migrate/2026-06-18-workflow-node-contract-v2-miniprogram-handoff.md
```
