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

## Apply 后已回传给 orange 的初始信息

- project/customer ID：`1a8589fb-8f3f-4900-a759-6d15438ffcc2`
- workflow instance ID：`651184a9-095d-42a9-8669-476c1d125a37`
- rebuild 初始 pending task ID：`bb156359-8c31-4ee8-9ba7-140ca0f54e23`
- rebuild 初始节点：`designing` / `设计中`
- `actions[].key`：`complete`
- rebuild 初始 complete payload：

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

orange 已使用新 task `bb156359-8c31-4ee8-9ba7-140ca0f54e23`
完成复测；旧 task `aa6d93f8-f825-4f9a-bd04-f346ba3e2d5f`
不再提交。

## Orange 复测与后端只读复核

orange 已在 2026-06-18 使用 rebuild 后的新实例完成
`project_signing_workflow` 复测，未复用旧 task
`aa6d93f8-f825-4f9a-bd04-f346ba3e2d5f`。

外部记录：

- `/Users/leefo/Public/work/orange/docs/state_machine_migrate/2026-06-18-decoration-workflow-miniprogram-e2e-execution.md`
- `/Users/leefo/Public/work/orange/docs/state_machine_migrate/2026-06-18-decoration-workflow-next-smoke-backend-handoff.md`
- 请求日志：`/tmp/orange-project-signing-workflow-smoke-1781769027232-sanitized.json`

执行账号：`18800003001` / 欧阳锋。

orange 回填的执行链路：

| 节点 | task ID | output | 后端结果 |
| --- | --- | --- | --- |
| `designing` | `bb156359-8c31-4ee8-9ba7-140ca0f54e23` | `{}` | `proposal_confirmed` |
| `proposal_confirmed` | `ac5bda62-925e-4626-865a-892530edb2f2` | `{ "signed_amount": 100000 }` | `signed` |
| `signed` | `efb9fec5-46cd-4ceb-9a17-6b9708cf3098` | `{}` | `design_finalized` |
| `design_finalized` | `8c03662d-2b23-49f7-b8ae-bbedc9c1ffc2` | `{ "start_date": "2026-06-19", "construction_manager_employee_id": "5d2c906f-635d-4aa0-9a64-16d7edb380c8" }` | `pending_start` |
| `pending_start` | `56e92dba-ae0b-47b9-bd9e-6c8662f7bd1e` | `{}` | `started` |

后端只读复核结果：

- project `1a8589fb-8f3f-4900-a759-6d15438ffcc2`：
  `status = started`，`signed_amount = 100000`，
  `start_date = 2026-06-19T00:00:00+00:00`
- project signing instance `651184a9-095d-42a9-8669-476c1d125a37`：
  `status = completed`，`current_node_key = end`
- 上述 5 个 project signing task 均为 `status = completed`
- 后端 transition log 顺序为：
  `designing -> proposal_confirmed -> signed -> design_finalized -> pending_start -> end`
- 完成 `pending_start` 后，后端自动创建新的施工 workflow instance：
  `a7d4bc13-f8c6-4afe-9376-a6284b96e5e3`
- 当前施工 workflow：
  `current_node_key = started` / `确认开工`
- 当前施工 workflow pending task：
  `f68e9aaa-6020-4bdc-85a5-8c889f31cb1e`
- 当前 task action：
  `actions[].key = complete`，`business_domain = workflow_project`，
  `business_action = started`，`output_fields = []`

结论：`project_signing_workflow` 已通过；后续如果继续施工 workflow
smoke，必须从施工实例 `a7d4bc13-f8c6-4afe-9376-a6284b96e5e3` 的
task `f68e9aaa-6020-4bdc-85a5-8c889f31cb1e` 开始，并先确认本轮验收范围。

## Orange 关闭回执

orange 已确认 `project_signing_workflow` 按后端只读复核结果关闭，通过证据已落
orange 文档并提交。

回执要点：

- 不再复测旧 task `aa6d93f8-f825-4f9a-bd04-f346ba3e2d5f`
- 不重复执行本次已完成的 signing task chain：
  `bb156359 -> ac5bda62 -> efb9fec5 -> 8c03662d -> 56e92dba`
- 后续如继续施工 workflow smoke，先确认本轮验收范围
- 施工 workflow 后续以当前 pending task
  `f68e9aaa-6020-4bdc-85a5-8c889f31cb1e` 为准
- 后续起点为 `started` / `确认开工`

剩余重点：

- Admin 可见性如需 UI 截图再补
- 后续施工 workflow smoke 范围确认
