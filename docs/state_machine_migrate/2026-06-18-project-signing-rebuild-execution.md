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

计划命令：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-rebuild.ts --apply --confirm-rebuild 1a8589fb-8f3f-4900-a759-6d15438ffcc2 --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b --subject-type project --subject-id 1a8589fb-8f3f-4900-a759-6d15438ffcc2 --workflow-key project_signing
```

执行 apply 前必须满足：

- `docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-manual-gates.json`
  中 `legacy_instance_apply_gates.project_signing_rebuild.confirmed = true`
- `confirmed_by`、`confirmed_at`、`evidence` 均已填写
- dry-run 结果为 `ok = true`

## Apply 后需要回传给 orange

- project/customer ID
- workflow instance ID
- pending task ID
- 当前节点
- `actions[].key`
- complete payload 要求
- 期望推进路径

orange 在收到新 instance/task/payload 前，不复测旧 task
`aa6d93f8-f825-4f9a-bd04-f346ba3e2d5f`。
