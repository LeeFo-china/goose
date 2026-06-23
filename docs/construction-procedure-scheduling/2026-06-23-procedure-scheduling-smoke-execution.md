# 施工工序派工排程 Smoke 执行记录

日期：2026-06-23

## 范围

本轮验证施工 workflow 的新派工排程契约：

- `start_procedure` 只创建工序派工，不推进 workflow。
- `POST /project-logs` 只创建施工日志，不推进 workflow。
- `complete_procedure` 才推进当前工序节点。
- `acceptance_enabled=false` 时，完成工序后直接进入下一 workflow 节点，不创建验收入口。
- 当前工序派工人员可读取项目详情并创建当前工序日志。

## 测试样本

| 字段 | 值 |
| --- | --- |
| project ID | `d382cd45-9141-476e-a7a5-5bf88d0a3255` |
| project name | 收款联调 Smoke 2026-06-18 01:43:34 |
| workflow instance ID | `294dc6de-189f-4ecd-a54e-9488cccbddfd` |
| workflow definition ID | `8ccf9047-aa88-48ee-abe7-5a79b46845ba` |
| workflow version ID | `3254f945-a0a9-4a3d-b690-5db629b74ed5` |
| start task ID | `234af5ce-f66e-451c-bdcc-89bc9be5ce0a` |
| current procedure before start | `procedure_tiling` / 瓦工 |
| assignee employee | 欧阳克 |
| assignee employee ID | `5d2c906f-635d-4aa0-9a64-16d7edb380c8` |
| assignee account | `18800003002` |
| planned start date | `2026-06-23` |
| planned duration days | `1` |

## 执行结果

### 1. 服务和 migration

- API 使用 launchctl 重启后健康检查返回 `200`。
- Admin 服务已保持可访问。
- `supabase migration list` 已确认 Local/Remote 对齐到 `20260623143000`。

### 2. `start_procedure`

请求：

```json
{
  "action": "start_procedure",
  "reason": null,
  "output": {
    "assignee_employee_id": "5d2c906f-635d-4aa0-9a64-16d7edb380c8",
    "planned_start_date": "2026-06-23",
    "planned_duration_days": 1
  }
}
```

结果：

- `POST /workflow-tasks/234af5ce-f66e-451c-bdcc-89bc9be5ce0a/complete` 返回 `200`。
- 创建派工记录：`37b1d7cf-3412-4b6d-be82-af95a789fd73`。
- workflow 当前节点仍为 `procedure_tiling` / 瓦工。
- 顶层 `workflow_state.actions` 和当前 timeline node actions 均变为：
  - `adjust_procedure_schedule`
  - `complete_procedure`

当前节点 attributes 已返回：

```json
{
  "procedure_assignment_id": "37b1d7cf-3412-4b6d-be82-af95a789fd73",
  "procedure_assignment_status": "in_progress",
  "procedure_assignee_employee_id": "5d2c906f-635d-4aa0-9a64-16d7edb380c8",
  "procedure_assignee_employee_name": "欧阳克",
  "planned_start_date": "2026-06-23",
  "planned_duration_days": 1,
  "planned_end_date": "2026-06-23",
  "remaining_days": 0,
  "schedule_status": "due_today"
}
```

### 3. 派工人员项目详情和日志入口

使用欧阳克账号 `18800003002` 请求：

```http
GET /projects/d382cd45-9141-476e-a7a5-5bf88d0a3255/employee-detail-bootstrap
```

结果：

- 返回 `200`。
- `log_entry.can_create=true`。
- `log_entry.writable_stage.stage_code=tiling`。
- `log_entry.writable_stage.stage_label=瓦工`。
- 当前节点仍为 `procedure_tiling`。

本轮同时修复了后端读取权限口径：当前有效工序派工人员即使不是旧项目成员，也可以读取项目详情 bootstrap 并创建当前工序日志。

### 4. 创建施工日志

请求：

```json
{
  "project_id": "d382cd45-9141-476e-a7a5-5bf88d0a3255",
  "stage_code": "tiling",
  "node_name": "瓦工",
  "content": "施工派工 smoke：瓦工阶段日志，验证日志创建不自动推进 workflow。",
  "images": ["smoke/project-d382cd45/tiling-log-20260623-1.jpg"]
}
```

结果：

- `POST /project-logs?debug_timing=true` 返回 `200`。
- project log ID：`e2670c23-252d-44ba-ab35-27a5d45f37f4`。
- `stage_code=tiling`，`stage_label=瓦工`，`images.length=1`。
- 日志创建后刷新 workflow state，当前节点仍为 `procedure_tiling`。
- 结论：施工日志提交不会自动推进 workflow。

### 5. `complete_procedure`

请求：

```json
{
  "action": "complete_procedure",
  "reason": null,
  "output": {
    "project_log_id": "e2670c23-252d-44ba-ab35-27a5d45f37f4",
    "image_count": 1,
    "images": ["smoke/project-d382cd45/tiling-log-20260623-1.jpg"]
  }
}
```

结果：

- `POST /workflow-tasks/234af5ce-f66e-451c-bdcc-89bc9be5ce0a/complete` 返回 `200`。
- workflow 推进到 `procedure_woodwork` / 木工。
- 新 pending task ID：`48caa6b0-cdc3-40ed-8570-a8743adbd418`。
- 瓦工节点状态为 `done`，派工状态为 `completed`。
- 木工节点状态为 `current`，当前 actions 只有 `start_procedure`。
- 瓦工和木工节点 `acceptance_enabled=false`，未出现验收 action。

最终关键状态：

```json
{
  "current_node_key": "procedure_woodwork",
  "current_node_title": "木工",
  "actions": [
    {
      "key": "start_procedure",
      "label": "开始木工",
      "task_id": "48caa6b0-cdc3-40ed-8570-a8743adbd418"
    }
  ],
  "tiling": {
    "status": "done",
    "procedure_assignment_status": "completed",
    "acceptance_enabled": false
  }
}
```

## 后端修复点

本轮 smoke 过程中发现并修复：

1. `workflow-subjects` 顶层 `workflow_state.actions` 未使用派工后的 timeline node actions，导致顶层仍显示旧 `start_procedure`。
2. 项目 timeline state 未加载工序派工记录，导致 attributes 缺少施工人员、开工日期和工期。
3. 派工人员创建施工日志时仍被老项目成员权限拦截。
4. 派工人员可写日志但无法读取项目详情 bootstrap。

当前后端口径：

- 当前有效派工人员必须有 `project_log.create` 权限，且只能写自己被派工的当前工序日志。
- `project_log.create` scope 为 `all` 的账号仍可写当前工序日志。
- 当前有效派工人员必须有 `project.read` 权限，才可通过派工关系读取项目详情 bootstrap。
- completed 派工不再授予项目详情读取。

## 验证命令

```bash
pnpm --dir apps/api exec bun test src/services/project-procedure-assignments/project-access.test.ts src/services/project-procedure-assignments/service.test.ts src/services/project-logs.test.ts src/services/employee-project-detail-bootstrap/legacy/workflow-gate.test.ts src/services/workflow-subjects.test.ts src/services/project-workflow-progress-contract.test.ts src/services/workflow-task-action-metadata.test.ts
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
bun scripts/check-api-file-size.ts
git diff --check
```

结果：

- 35 tests passed。
- TypeScript no emit passed。
- API file size check passed。
- `git diff --check` passed。

## 小程序端对接回执建议

可以回复小程序团队：

> 后端已完成施工工序派工排程 smoke。当前契约验证通过：`start_procedure` 只创建派工不推进；派工人员可读取项目详情并创建当前工序日志；`POST /project-logs` 只落日志不推进；`complete_procedure` 才推进 workflow。测试项目 `d382cd45-9141-476e-a7a5-5bf88d0a3255` 已从瓦工推进到木工，新 pending task 为 `48caa6b0-cdc3-40ed-8570-a8743adbd418`。小程序端继续按 workflow v2 消费 `timeline_nodes[].display/attributes/actions`，日志入口只读 `log_entry`，不要从旧施工阶段字段或日志标题推导。下一轮如果要验证木工，请从当前 `procedure_woodwork` 的 `start_procedure` 开始，重新选择施工人员、开工日期和工期。
