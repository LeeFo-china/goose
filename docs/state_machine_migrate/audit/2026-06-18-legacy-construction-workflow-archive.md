# 旧施工 workflow 测试实例推进与归档记录

## 背景

- 旧流程定义：`2c0e27d5-f296-41de-9653-16c5a4f961d8`
- workflow key：`construction_custom_mq7hqqgl_1_d0c5a149`
- 名称：`工程施工`
- 分类：`construction`
- 本次处理范围：仅处理两个已确认的测试项目旧实例，不处理正式项目数据。

## 只读盘点

归档前旧定义有 2 个 running 实例：

| project ID | instance ID | 处理前 current | 处理前状态 |
| --- | --- | --- | --- |
| `54f11aa5-09a8-4410-a9c5-604a7fe9e09c` | `0b2a033f-504a-49d6-b196-fe9200761adf` | `procedure_tiling` | `running` |
| `2d710a84-1045-4750-8dfd-51a0f463a4db` | `67b1daaa-b90d-49d9-9194-e67d7cd49bca` | `final_acceptance` | `running` |

## 根因修复

推进 `54f11aa5-09a8-4410-a9c5-604a7fe9e09c` 时发现
`payment_deposit` 节点存在条件出边：

```json
{
  "field": "payment_status",
  "operator": "eq",
  "value": "success"
}
```

旧 RPC `complete_workflow_instance_node` 的执行顺序是先把当前
`workflow_instance_nodes` 和 `workflow_tasks` 标记为 completed，再计算条件出边。
当 output 不满足 `payment_status = success` 时，RPC 返回 `no_matching_edge`，但当前
node/task 已被改为 completed，instance 仍停留在原 current node，导致后续重试返回
`node_run_not_found`。

已通过 migration 修复：

- `supabase/migrations/20260618230000_fix_workflow_runtime_condition_atomicity.sql`
- 调整 RPC 顺序：先校验条件出边和目标节点，再完成当前 node/task。
- 仅针对本次测试实例恢复误完成的 `payment_deposit` node/task 为 running/pending。

## 执行方式

本次为旧测试 runtime 清理，使用 Admin runtime 接口按模板顺序推进：

```http
POST /workflows/:definitionId/runtime/instances/:instanceId/complete-node
```

说明：

- 没有直接手工 DML 修远端库；数据修复通过 migration 纳入版本控制。
- `payment_deposit` 使用测试 output 推进 runtime：
  `payment_status=success`、`amount=1`、测试凭证 URL、归档备注。
- 该节点为 runtime 清理，不创建新的财务台账流水。

## 推进结果

### `0b2a033f-504a-49d6-b196-fe9200761adf`

项目：`54f11aa5-09a8-4410-a9c5-604a7fe9e09c`

推进链路：

1. `procedure_tiling` -> `payment_deposit`
2. `payment_deposit` -> `procedure_woodwork`
3. `procedure_woodwork` -> `procedure_painting`
4. `procedure_painting` -> `procedure_installation`
5. `procedure_installation` -> `final_acceptance`
6. `final_acceptance` -> `end`

完成结果：

- instance status：`completed`
- current node：`end`
- completed at：`2026-06-18T15:02:16.922143+00:00`

### `67b1daaa-b90d-49d9-9194-e67d7cd49bca`

项目：`2d710a84-1045-4750-8dfd-51a0f463a4db`

推进链路：

1. `final_acceptance` -> `end`

完成结果：

- instance status：`completed`
- current node：`end`
- completed at：`2026-06-18T14:50:59.310162+00:00`

## 归档结果

归档接口：

```http
POST /workflows/2c0e27d5-f296-41de-9653-16c5a4f961d8/archive
```

归档后：

| definition ID | workflow key | name | status |
| --- | --- | --- | --- |
| `2c0e27d5-f296-41de-9653-16c5a4f961d8` | `construction_custom_mq7hqqgl_1_d0c5a149` | `工程施工` | `archived` |

当前 active construction 定义：

| definition ID | workflow key | name |
| --- | --- | --- |
| `8ccf9047-aa88-48ee-abe7-5a79b46845ba` | `construction_main` | `项目施工主流程` |
| `dd559d20-58b2-4d38-996e-34d82cbe68ea` | `project_signing` | `项目签约主流程` |

## 核验

已执行：

```bash
supabase db push --db-url "$DB_URL" --dry-run
supabase db push --db-url "$DB_URL" --yes
supabase migration list --db-url "$DB_URL"
git diff --check
```

核验结果：

- migration `20260618230000` Local/Remote 已对齐。
- 旧定义 running instances：`0`
- 旧定义 completed instances：`2`
- 旧定义 pending tasks：`0`
- 两个项目的 `/workflow-subjects/project/:id/state` 均刷新为无 running workflow：
  `instance_id=null`、`current_node_key=null`、`pending_task_count=0`
- 旧流程定义状态为 `archived`

补充说明：

- `apps/api/src/scripts/workflow-runtime-consistency-check.ts` 当前会把 completed/canceled
  实例也纳入 subject_state 对比，而运行时代码只投影 latest running instance；因此全局脚本仍会报
  subject_state mismatch。该问题不影响本次旧定义归档阻塞条件。
