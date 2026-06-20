# 施工日志 workflow 入口阻塞回执

日期：2026-06-20

## 问题

员工 `5d2c906f-635d-4aa0-9a64-16d7edb380c8` 给项目
`1a8589fb-8f3f-4900-a759-6d15438ffcc2` 添加施工日志时，小程序提示：

```text
施工日志需要从 workflow 节点发起
请从当前 workflow 节点发起施工日志。
```

## 后端核查结果

员工：

- employee ID：`5d2c906f-635d-4aa0-9a64-16d7edb380c8`
- 手机号：`18800003002`
- 姓名：欧阳克
- 租户：`3eebca47-961f-4899-b976-a3d3208d326b`

项目：

- project ID：`1a8589fb-8f3f-4900-a759-6d15438ffcc2`
- 项目状态：`constructing`
- 员工是项目成员，角色为 `construction_manager`

当前 workflow：

- instance ID：`a7d4bc13-f8c6-4afe-9376-a6284b96e5e3`
- current node：`procedure_woodwork`
- current title：木工
- pending task：`187fc53d-5aed-4f78-be28-9ee0bf2c6de5`

项目详情 bootstrap 当前返回：

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
    "current_node_title": "木工"
  }
}
```

## 后端修复

提交：

```text
a93b24f fix(workflow): 允许施工日志独立创建
```

后端已调整：

- `create_project_log` 不再被 workflow 当前阶段 guard 拦截。
- 施工日志创建仍保留项目状态、成员/权限、验收状态等真实业务边界。
- 施工日志创建不推进 workflow。
- 显式完成工序仍走 `POST /workflow-tasks/:taskId/complete`。

真实 smoke：

- 使用账号：`18800003002`
- 请求：`POST /project-logs`
- stage_code：`woodwork`
- 创建成功日志 ID：`8fb266e9-0c25-4f74-8409-2b246f06b326`
- 创建后 workflow 仍为 `procedure_woodwork / 木工`

## 小程序侧阻塞根因

只读核查 orange 发现提示来自：

```text
src/packageProjects/pages/logEdit/hooks/useProjectLogPermissionContext.ts
```

当前逻辑要求日志编辑页 URL 同时包含：

- `workflowTaskId`
- `workflowAction`
- `stageCode`

如果缺少 `workflowTaskId/workflowAction`，即使后端已经返回
`log_entry.can_create = true` 和 `writable_stage.stage_code`，小程序仍会本地展示：

```text
施工日志需要从 workflow 节点发起
```

这已经不符合 workflow node contract v2。

## 小程序需要调整

施工日志创建不再要求 `workflowTaskId/workflowAction`。

日志编辑页允许进入的条件应改为：

1. URL 或项目详情上下文中有 `projectId`。
2. 有可写阶段：
   - 优先使用 `log_entry.writable_stage.stage_code`；
   - 或使用当前 `timeline_nodes[].attributes.stage_code`。
3. 当前员工有项目日志创建权限。

`workflowTaskId/workflowAction` 只用于“显式完成工序”，不能作为创建施工日志的前置条件。

日志提交后的行为：

1. 调 `POST /project-logs` 创建施工日志。
2. 不自动调用 `POST /workflow-tasks/:taskId/complete`。
3. 刷新项目详情或 subject state。
4. 按刷新后的 `timeline_nodes/actions` 展示“完成工序”或验收入口。

## 禁止的兼容方案

后端不能为了绕过小程序本地 guard，在 `log_entry.writable_stage` 里伪造
`workflow_task_id/workflow_action`。

原因：当前 orange 旧逻辑一旦拿到这两个字段，会在施工日志创建后自动 complete
workflow task，导致“创建施工日志即推进工序”，这会再次破坏 v2 契约。

## 建议回复小程序

```text
后端已修复 create_project_log 被 workflow 当前节点拦截的问题，并已用
18800003002 / project 1a8589fb-8f3f-4900-a759-6d15438ffcc2
真实创建 woodwork 施工日志验证通过。

当前截图提示不是后端返回，是 orange 日志编辑页本地 guard：
useProjectLogPermissionContext 仍要求 workflowTaskId + workflowAction。

请按 workflow v2 契约调整：
- 创建施工日志不再要求 workflowTaskId/workflowAction；
- 有 log_entry.can_create=true + writable_stage.stage_code 即可进入日志编辑；
- 日志提交后只调 POST /project-logs 并刷新详情；
- 不要在日志提交后自动 complete workflow task；
- 完成工序只由用户点击后端返回的 complete/complete_procedure action 触发。
```
