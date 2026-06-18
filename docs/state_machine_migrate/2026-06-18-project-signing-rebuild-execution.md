# 项目签约 Workflow 受控重建执行记录

日期：2026-06-18

## 业务确认

用户已在 2026-06-18 确认按顺序执行下一步计划：

```text
确认允许将项目 1a8589fb-8f3f-4900-a759-6d15438ffcc2 的旧 construction_main running 实例取消，并重建到 project_signing designing 节点。
```

本记录只覆盖项目 `1a8589fb-8f3f-4900-a759-6d15438ffcc2` 的
`project_signing_workflow` 受控 rebuild，不处理 invalid customer cancellation
或 manual restore project。

## 目标

| 字段 | 值 |
| --- | --- |
| tenant ID | `3eebca47-961f-4899-b976-a3d3208d326b` |
| project ID | `1a8589fb-8f3f-4900-a759-6d15438ffcc2` |
| legacy instance ID | `b58acf8e-4f18-4b40-b5c7-919600e5e636` |
| legacy workflow | `construction_main` |
| legacy current node | `designing` |
| target workflow | `project_signing` |
| target node | `designing` |
| target definition ID | `dd559d20-58b2-4d38-996e-34d82cbe68ea` |

## Dry Run

命令：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-rebuild.ts --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b --subject-type project --subject-id 1a8589fb-8f3f-4900-a759-6d15438ffcc2 --workflow-key project_signing
```

结果：通过。

关键结果：

- `ok = true`
- `mode = dry-run`
- `classification = rebuild_candidate`
- `result.ok = true`
- `result.dry_run = true`
- `result.canceled_instance_count = 1`
- `result.existing_instance_count = 1`
- `current_node.node_key = designing`

## Apply

命令：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-rebuild.ts --apply --confirm-rebuild 1a8589fb-8f3f-4900-a759-6d15438ffcc2 --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b --subject-type project --subject-id 1a8589fb-8f3f-4900-a759-6d15438ffcc2 --workflow-key project_signing
```

执行时间：`2026-06-18T15:38:33+08:00`

结果：通过。

关键结果：

- `ok = true`
- `mode = apply`
- legacy instance `b58acf8e-4f18-4b40-b5c7-919600e5e636` 已取消
- new instance ID：`651184a9-095d-42a9-8669-476c1d125a37`
- new pending task ID：`bb156359-8c31-4ee8-9ba7-140ca0f54e23`
- current node：`designing` / `设计中`
- `subject_state.current_node_key = designing`
- `subject_state.pending_task_count = 1`
- `canceled_instance_count = 1`
- `deleted_instance_count = 0`

后端只读核验：

- 旧实例 `b58acf8e-4f18-4b40-b5c7-919600e5e636`：
  `status = canceled`
- 新实例 `651184a9-095d-42a9-8669-476c1d125a37`：
  `status = running`，`workflow_key = project_signing`，
  `current_node_key = designing`
- 新 task `bb156359-8c31-4ee8-9ba7-140ca0f54e23`：
  `status = pending`，`node_key = designing`，
  `assignee_permission_code = project.update`
- action metadata：
  `actions[].key = complete`，`business_domain = workflow_project`，
  `business_action = designing`，`output_fields = []`

## Apply 后需要回传给 orange

- project/customer ID：`1a8589fb-8f3f-4900-a759-6d15438ffcc2`
- workflow instance ID：`651184a9-095d-42a9-8669-476c1d125a37`
- pending task ID：`bb156359-8c31-4ee8-9ba7-140ca0f54e23`
- 当前节点：`designing` / `设计中`
- `actions[].key`：`complete`
- 当前 complete payload：

```json
{
  "action": "complete",
  "reason": null,
  "output": {}
}
```

- 期望推进路径：

```text
designing -> proposal_confirmed -> signed -> design_finalized -> pending_start -> end
```

后续节点 payload 规则：

- `designing`：`output = {}`
- `proposal_confirmed`：`output.signed_amount` 必填
- `signed`：`output = {}`
- `design_finalized`：`output.start_date` 与
  `output.construction_manager_employee_id` 必填
- `pending_start`：`output = {}`

orange 后续使用新 task `bb156359-8c31-4ee8-9ba7-140ca0f54e23`
继续复测；旧 task `aa6d93f8-f825-4f9a-bd04-f346ba3e2d5f`
不再提交。
