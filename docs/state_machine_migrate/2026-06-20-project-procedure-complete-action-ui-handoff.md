# 工序节点完成动作 UI 不展示核查回执

日期：2026-06-20

## 问题

员工 `5d2c906f-635d-4aa0-9a64-16d7edb380c8` 操作项目
`1a8589fb-8f3f-4900-a759-6d15438ffcc2` 时，小程序端看不到可以推进
当前工序节点的 UI 交互。

## 后端运行态核查

员工：

- employee ID：`5d2c906f-635d-4aa0-9a64-16d7edb380c8`
- 手机号：`18800003002`
- 姓名：欧阳克
- 租户：`3eebca47-961f-4899-b976-a3d3208d326b`

项目：

- project ID：`1a8589fb-8f3f-4900-a759-6d15438ffcc2`
- project status：`constructing`

当前 workflow：

- current node：`procedure_woodwork`
- current title：木工
- pending task：`187fc53d-5aed-4f78-be28-9ee0bf2c6de5`

`GET /projects/:id/employee-detail-bootstrap?log_page_size=3` 返回：

```json
{
  "log_entry": {
    "can_create": true,
    "writable_stage": {
      "stage_code": "woodwork",
      "stage_label": "木工"
    },
    "blocked_reason": null,
    "next_action": null
  },
  "workflow_state": {
    "current_node_key": "procedure_woodwork",
    "current_node_title": "木工",
    "actions": [
      {
        "key": "complete",
        "label": "木工",
        "business_domain": "workflow_project",
        "business_action": "complete_procedure",
        "task_id": "187fc53d-5aed-4f78-be28-9ee0bf2c6de5",
        "node_key": "procedure_woodwork",
        "node_type": "procedure",
        "disabled": false
      }
    ]
  }
}
```

`GET /workflow-subjects/project/:id/state` 返回同样的当前节点和动作。

`GET /workflow-tasks?page=1&pageSize=20&status=pending` 中也能查到该项目
对应的 pending task：

```json
{
  "id": "187fc53d-5aed-4f78-be28-9ee0bf2c6de5",
  "status": "pending",
  "node_key": "procedure_woodwork",
  "actions": [
    {
      "key": "complete",
      "business_action": "complete_procedure",
      "task_id": "187fc53d-5aed-4f78-be28-9ee0bf2c6de5",
      "disabled": false
    }
  ]
}
```

结论：后端已返回可执行的工序推进动作，不是后端缺 `actions[]`。

## 小程序侧只读核查

只读核查 orange 当前提交：

```text
716bcb1 fix(project): 施工日志创建解耦workflow推进
```

发现动作渲染链路存在缺口。

### 1. `complete_procedure` 未被识别为显式项目动作

文件：

```text
/Users/leefo/Public/work/orange/src/packageProjects/pages/detail/utils/status.ts
```

`PROJECT_WORKFLOW_ACTION_BY_NODE_KEY` 当前只映射：

- `confirm_proposal`
- `sign_contract`
- `finalize_design`
- `schedule_construction`
- `start_project`
- `start_construction`
- `start_acceptance`
- `resume_project`

没有 `complete_procedure`。

因此后端返回的动作：

```json
{
  "key": "complete",
  "business_action": "complete_procedure",
  "node_key": "procedure_woodwork"
}
```

会被 `workflowActionToProjectActionOption()` 降级为：

```text
action = workflow_action
```

### 2. 详情页下一步处理会过滤工序节点的 `workflow_action`

文件：

```text
/Users/leefo/Public/work/orange/src/packageProjects/pages/detail/utils/nextAction.ts
```

当前逻辑只有在：

```text
!isConstructionStageNode &&
isDirectProjectDetailWorkflowAction(currentNodeAction)
```

同时成立时，才把当前节点动作渲染成下一步按钮。

工序节点 `procedure_woodwork` 是施工阶段节点，并且动作已被降级为
`workflow_action`，所以不会显示按钮。

### 3. 节点抽屉同样过滤 `workflow_action`

文件：

```text
/Users/leefo/Public/work/orange/src/packageProjects/pages/detail/sections/WorkflowNodeCardsPanel.tsx
```

`isExplicitWorkflowNodeAction()` 当前定义为：

```text
option.action !== "workflow_action"
```

因此 `complete_procedure` 被降级后，节点卡片里也不会渲染推进按钮。

## 根因

后端 workflow v2 已返回：

- `timeline_nodes[].actions[]`
- `workflow_state.actions[]`
- `business_action = complete_procedure`
- `task_id`
- `disabled = false`

但 orange 当前只把部分项目动作和收款动作映射为可渲染动作，没有把
`complete_procedure` 作为工序节点的显式动作处理。

因此 UI 上表现为“当前节点有 pending task，但小程序没有推进按钮”。

## 小程序侧建议调整

orange 需要按 workflow node contract v2 补齐工序节点动作渲染：

1. 支持 `business_action = complete_procedure`。
2. 当工序节点 `attributes.acceptance_enabled = false` 时，展示“完成工序”或
   “完成当前节点”按钮。
3. 点击后统一调用：

```http
POST /workflow-tasks/:taskId/complete
Content-Type: application/json

{
  "action": "complete"
}
```

4. 不要从 `construction_stages`、阶段名或本地状态推导动作。
5. 只按后端返回的 `node.actions`、`workflow_state.actions` 或
   `/workflow-tasks` 的 `actions` 渲染和提交。

## 给小程序端的回复

```text
后端已核查，项目 1a8589fb-8f3f-4900-a759-6d15438ffcc2 当前木工节点已返回可执行 workflow action：

task_id = 187fc53d-5aed-4f78-be28-9ee0bf2c6de5
node_key = procedure_woodwork
business_action = complete_procedure
key = complete
disabled = false

小程序没有显示推进 UI 的原因是 orange 目前没有把 complete_procedure
识别为可渲染的项目工序推进动作，当前被降级为 workflow_action，
而详情页和节点抽屉都会过滤 workflow_action。

请 orange 按 workflow v2 契约补齐：
1. 支持 business_action=complete_procedure。
2. 工序节点 acceptance_enabled=false 时，展示“完成工序/完成当前节点”按钮。
3. 点击后统一 POST /workflow-tasks/:taskId/complete，body 传 action=complete。
4. 不要从 construction_stages 或本地阶段名推导，只按 node.actions /
   workflow_state.actions 渲染。
```

## 后端状态

本轮没有修改后端代码。

API 当前已能返回该工序节点动作。施工日志仍只负责落日志，不自动推进 workflow；
工序推进仍以 `POST /workflow-tasks/:taskId/complete` 为唯一入口。
