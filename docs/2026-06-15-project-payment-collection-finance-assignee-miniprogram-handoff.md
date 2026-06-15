# 小程序项目收款节点指定财务对接说明

## 背景

后端已支持项目 workflow 的 `payment_collection` 收款节点按指定财务员工处理。
当 runtime 进入收款节点时，后端会把节点配置里的
`finance_reviewer_employee_id` 投影到：

```text
workflow_tasks.assignee_employee_id
```

同时，`GET /workflow-tasks` 和项目 `workflow_state.actions` 都会按同一套
assignee 规则过滤。小程序端不需要、也不应该根据角色名、岗位名或本地员工列表
判断谁是财务。

## 后端契约

### 项目详情 / workflow state

小程序继续从以下接口读取项目详情和 workflow actions：

```http
GET /projects/:projectId/employee-detail-bootstrap
GET /workflow-subjects/project/:projectId/state
```

当当前登录员工是指定财务员工时，`workflow_state.actions` 会包含收款 action：

```json
{
  "key": "complete",
  "label": "中期进度款",
  "task_id": "workflow-task-id",
  "node_key": "payment_stage_2",
  "node_type": "confirmation",
  "business_domain": "payment_collection",
  "business_action": "confirm_payment",
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

当当前登录员工不是指定财务员工时，仍然可以看到 workflow timeline 当前节点是
`payment_stage_2 / 中期进度款`，但后端不会返回可执行的“确认收款” action。

### 任务中心

任务中心继续调用：

```http
GET /workflow-tasks?page=1&pageSize=20
```

后端已经按 assignee 过滤：

- `assignee_employee_id` 命中当前员工：返回任务。
- 未指定员工、但命中 `assignee_permission_code`：返回任务。
- 未指定员工、但命中 `assignee_role_code`：返回任务。
- 已指定其他员工：即使当前员工有权限码或角色，也不返回任务。

### 完成收款任务

小程序点击“确认收款”时继续提交：

```http
POST /workflow-tasks/:taskId/complete
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

`action` 必须使用后端 action metadata 的 `key`，不要硬编码成
`confirm_payment`。

后端 complete 时会再次校验：

- task 存在且 `status = pending`。
- 当前员工有权处理该 task。
- 当前 runtime node 仍是该 task 对应节点。
- 当前项目存在满足节点配置的 confirmed 收款记录。

中期进度款典型校验条件：

```text
payments.project_id = 当前项目
payments.type = "stage_2"
payments.status = "confirmed"
```

未满足时返回：

```http
409
```

```json
{
  "code": "WORKFLOW_PAYMENT_COLLECTION_BLOCKED",
  "message": "中期进度款尚未确认入账"
}
```

小程序展示后端 `message`，保持当前节点不变，不做本地推进。

## 小程序需要检查的文件

以下文件在 orange 仓库中检查，gooes 不修改 orange：

```text
/Users/leefo/Public/work/orange/src/packageProjects/pages/detail/hooks/useProjectDetailBootstrap.ts
/Users/leefo/Public/work/orange/src/packageProjects/pages/detail/hooks/useProjectWorkflowActions.ts
/Users/leefo/Public/work/orange/src/packageProjects/pages/detail/hooks/useProjectWorkflowActionSubmit.ts
/Users/leefo/Public/work/orange/src/packageProjects/pages/detail/utils/status.ts
/Users/leefo/Public/work/orange/src/utils/workflow_payment_collection.ts
/Users/leefo/Public/work/orange/src/services/workflow_task.ts
/Users/leefo/Public/work/orange/src/services/task_center.ts
/Users/leefo/Public/work/orange/src/types/api/workflow_task.d.ts
```

## 小程序实现要求

### 1. 操作按钮只来自后端 actions

项目详情按钮必须只由 `workflow_state.actions` 生成：

```text
payload.workflow_state.actions
```

不要根据当前节点、员工角色、岗位名称、`construction_stages`、
`next_stage` 或本地状态自行补出“确认收款”按钮。

### 2. 收款 action 识别

继续用以下任一条件识别收款 action：

```text
business_domain = "payment_collection"
business_action = "confirm_payment"
output_fields[].type = "payment_collection"
```

### 3. 提交时使用后端 action.key

提交 `WorkflowTaskService.complete` 时：

```ts
WorkflowTaskService.complete(option.workflowTaskId, {
  action: option.workflowAction,
  reason: reason || null,
  output: {
    payment_status: 'success',
  },
});
```

其中：

- `option.workflowTaskId` 来自后端 `action.task_id`。
- `option.workflowAction` 来自后端 `action.key`。

### 4. 不在前端判断财务身份

前端不需要判断：

- 当前员工是否财务部门。
- 当前员工是否财务角色。
- 当前员工是否有财务权限。
- 当前员工是否等于某个本地选择的财务人员。

这些都由后端通过 task assignee 和 action 过滤完成。

### 5. 注意 canManageProject 本地拦截

当前项目详情提交逻辑里存在本地判断：

```text
if (!projectId || !project || !canManageProject) return;
```

如果指定财务员工没有项目管理权限，但后端已经返回了
`payment_collection` action，这个判断可能会挡住“确认收款”提交。

建议小程序调整为：

- 对后端返回的 workflow action，只要存在 `workflowTaskId` 和
  `workflowAction`，允许提交。
- 项目旧状态动作、排期开工、签约等仍按原项目管理权限判断。

换句话说：`payment_collection` 的可执行性以
`workflow_state.actions` 是否返回为准。

## 不需要小程序做的事

- 不选择财务人员。
- 不判断员工是否财务。
- 不登记或创建收款记录。
- 不跳过 `payment_collection` 节点。
- 不用 `construction_stages.current_stage`、`next_stage` 或项目旧 status
  推导收款节点。
- 不在 complete 成功前本地推进 workflow timeline。

## 验收清单

准备一个当前 workflow 节点为：

```text
payment_stage_2 / 中期进度款
```

的项目。

### 指定财务员工登录

- 任务中心显示项目收款任务。
- 点击任务进入项目详情。
- 项目详情 timeline 当前节点显示“中期进度款”。
- 项目详情显示“确认收款”按钮。

### 非指定员工登录

- 项目详情 timeline 当前节点仍显示“中期进度款”。
- 项目详情不显示“确认收款”按钮。
- 任务中心不出现该收款 task。

### 未确认入账时点击确认

- `POST /workflow-tasks/:taskId/complete` 返回
  `WORKFLOW_PAYMENT_COLLECTION_BLOCKED`。
- 小程序展示后端 `message`。
- workflow 仍停留在“中期进度款”。

### 已确认入账后点击确认

- 后端已有 `stage_2 + confirmed` 收款记录。
- 指定财务员工点击“确认收款”。
- complete 成功。
- 小程序刷新项目详情和任务中心。
- “中期进度款”变为 done，下一节点变为 current。

## 后端当前状态

gooes 已完成：

- `workflow_tasks.assignee_employee_id` 投影指定财务员工。
- `/workflow-tasks` 按 assignee 过滤。
- `workflow_state.actions` 复用 `/workflow-tasks` 的可见任务。
- complete 时继续校验 confirmed 收款记录，不满足返回
  `WORKFLOW_PAYMENT_COLLECTION_BLOCKED`。
- migration `20260615090000_project_payment_task_finance_assignee.sql` 已应用到远端。

注意：如果 admin 工作流节点里的 `finance_reviewer_employee_id` 是占位 UUID
或不存在的员工，后端不会投影为指定员工。需要在 admin 选择真实同租户财务员工
并发布工作流，或让 runtime 重新进入该收款节点后再联调。
