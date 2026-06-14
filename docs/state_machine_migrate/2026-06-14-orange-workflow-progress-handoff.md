# Orange Workflow Progress 对接文档

## 背景

项目 `2d710a84-1045-4750-8dfd-51a0f463a4db` 暴露了施工阶段显示与 workflow
运行态不一致的问题：后端历史 `construction_stages` 读模型会根据验收、日志、
收款事实推导当前阶段，导致小程序在 workflow 仍未通过中期收款节点时显示已经推进到
`tiling / 瓦工`。

本轮后端已将项目进度事实源收敛到 workflow runtime：

- 当前节点、当前工序、收款闸门、待办动作只能来自 workflow runtime 和
  workflow tasks。
- 验收单、施工日志、收款记录只能作为 workflow 节点校验所需的业务证据。
- `construction_stages.current_stage`、`next_stage` 等兼容字段只能作为
  runtime 投影或辅助展示字段，不能再作为端上推进依据。

orange 仓库 `/Users/leefo/Public/work/orange` 在本任务中只读审计，本文档写在
gooes 仓库，供小程序团队对接。

## 后端接口契约

员工侧项目详情聚合接口：

```http
GET /projects/:id/employee-detail-bootstrap
Authorization: Bearer <employee-token>
```

客户侧项目详情聚合接口：

```http
GET /customer/projects/:id/detail-bootstrap
Authorization: Bearer <customer-token>
```

两类 bootstrap 都会返回 `workflow_progress`。员工侧还继续返回
`workflow_state.actions`，作为 mutation 按钮的来源。

项目流程动作接口：

```http
GET /workflow-subjects/project/:projectId/state
GET /workflow-tasks?page=1&pageSize=20&subject_type=project&subject_id=:projectId
POST /workflow-tasks/:taskId/complete
```

施工阶段兼容接口：

```http
GET /projects/:id/construction-stages
GET /customer/projects/:id/construction-stages
```

这些接口仍可用于 timeline、验收卡片和阶段辅助信息，但不能决定当前流程节点、
当前收款闸门或可执行动作。

## `workflow_progress` 字段

员工侧返回结构：

```json
{
  "workflow_progress": {
    "source": "workflow_runtime",
    "instance_id": "uuid",
    "instance_status": "running",
    "current_node_key": "payment_stage_2",
    "current_node_title": "中期进度款",
    "current_node_type": "confirmation",
    "current_business_kind": "payment_collection",
    "current_stage_code": null,
    "current_gate": {
      "type": "payment_collection",
      "payment_type": "stage_2",
      "payment_label": "中期进度款",
      "blocked_stage_code": "tiling",
      "blocked_stage_label": "瓦工"
    },
    "pending_task_count": 1,
    "actions": [],
    "warnings": []
  }
}
```

客户侧返回同名对象，但不包含 `actions` 和 `warnings`。

字段含义：

| 字段 | 端上用法 |
| --- | --- |
| `source = workflow_runtime` | 可以按 workflow runtime 展示进度 |
| `source = missing_runtime` | 显示“流程同步中”，禁用推进、验收创建、收款确认等 mutation |
| `source = unavailable` | 显示加载失败/重试，禁用本地推导 |
| `current_node_title` | 当前流程 headline |
| `current_business_kind` | 识别 `payment_collection`、工序节点等业务类型 |
| `current_stage_code` | 仅当当前 runtime 节点是工序节点时高亮对应施工阶段 |
| `current_gate` | 当前处于收款闸门时展示闸门信息，并锁定后续工序 |
| `pending_task_count` | 只作为待办数量展示，不生成本地动作 |
| `actions` | 员工侧只读展示可用；提交仍以 `workflow_state.actions` 或 workflow task 为准 |
| `warnings` | 员工侧诊断提示；客户侧不会返回 |

## 展示规则

| 后端状态 | 小程序展示 |
| --- | --- |
| `current_gate.type = payment_collection` | headline 显示 `payment_label` 或 `current_node_title`；后续工序显示 locked，不高亮为当前 |
| `current_node_type = procedure` 且有 `current_stage_code` | timeline 高亮 `current_stage_code` 对应阶段 |
| `current_node_key = construction_start` | 显示开工节点；没有 `current_stage_code` 时不从日志/状态推导拆改 |
| `source = missing_runtime` | 显示“流程同步中”，禁用 mutation |
| `source = unavailable` | 显示重试/加载失败，禁用 mutation |

当处于 `payment_stage_2 / 中期进度款` 时，即使 `construction_stages.next_stage`
返回 `tiling / 瓦工`，小程序也只能把瓦工展示为“被收款节点锁定的后续阶段”，不能把它
当作当前阶段。

## 禁止的端上推导

以下逻辑需要从项目详情和客户项目详情中移除或降级为调试信息：

- 不使用最新 `project_logs.stage_code` 推导当前进度。
- 不使用 `project.status` 推导当前工序。
- 不使用 `construction_stages.next_stage` 作为 active/current 阶段。
- 不使用 `construction_stages.stages[].status` 推导 workflow 当前节点。
- 不在没有 `workflow_state.actions` 或 workflow task 的情况下合成本地 task id。
- 不按本地 stage position 创建验收、推进流程或乐观跳转下一个节点。
- `POST /workflow-tasks/:taskId/complete` 成功后必须刷新 bootstrap 或 subject state，
  不在本地直接切换到下一个节点。

## orange 只读审计结果

本次只读核查发现 orange 当前还存在需要小程序团队处理的落点：

| 文件 | 需要调整 |
| --- | --- |
| `src/services/projects/types/status.ts` | 增加员工侧 `WorkflowProgress` 类型，并在 `ProjectEmployeeDetailBootstrapPayload` 添加 `workflow_progress` |
| `src/services/projects/types/customer.ts` | 增加客户侧 `workflow_progress`，不包含 `actions/warnings` |
| `src/packageProjects/pages/detail/hooks/useProjectDetailBootstrap.ts` | 保存 `payload.workflow_progress`；详情刷新后同步更新展示状态 |
| `src/packageProjects/pages/detail/hooks/useProjectStatusViewModel.ts` | headline 和阶段 active 状态优先用 `workflow_progress`；动作仍来自 `workflow_state.actions` |
| `src/packageProjects/pages/detail/sections/ConstructionStagePanel.tsx` | `current_gate` 存在时展示收款闸门/locked 状态，不用 `next_stage` 高亮瓦工 |
| `src/packageProjects/pages/detail/hooks/useProjectWorkflowActions.ts` | 保持 workflow actions 为唯一 mutation 来源，不补本地 fallback |
| `src/packageProjects/pages/logEdit/hooks/useProjectLogEditController.ts` | 施工日志创建后继续 complete workflow task；complete 失败不得本地推进 |
| `src/packageCustomerPortal/pages/customer-project-detail/hooks/useCustomerProjectDetailData.ts` | 保存客户侧 `workflow_progress`；刷新施工阶段时不得覆盖 workflow 进度 |
| `src/packageCustomerPortal/pages/customer-project-detail/model.ts` | 移除从日志、项目状态、active stage 推导当前进度的 fallback |
| `src/packageTasks/pages/index/index.tsx` | 任务中心打开工序/收款任务时，需要进入可执行 workflow action 的页面 |

当前高风险代码点：

- 员工详情 `ConstructionStagePanel.tsx` 在没有 `current_stage` 时会把 `next_stage`
  当作 active 展示，需要由 `workflow_progress.current_gate` 分支覆盖。
- 客户详情 `model.ts` 会从日志和项目状态推导当前阶段，需要改为只读
  `workflow_progress.current_stage_code` 或 `current_gate`。

## 兼容字段使用边界

`construction_stages` 仍可展示：

- 阶段列表、阶段 label、验收状态；
- 后续阶段是否 locked；
- 验收卡片、辅助说明、只读 timeline 装饰信息。

`construction_stages` 不再允许决定：

- 当前 workflow 节点；
- 当前流程 headline；
- 是否展示收款按钮、工序完成按钮、验收创建按钮；
- 是否可以推进到下一工序。

如果 `workflow_progress` 和 `construction_stages` 看起来冲突，端上必须以
`workflow_progress` 为准，并把冲突记录为后端一致性/数据修复问题。

## 针对问题项目的验收

项目：

```text
2d710a84-1045-4750-8dfd-51a0f463a4db
```

后端数据修复 migration 应用后，期望：

1. 员工侧 bootstrap 返回 `workflow_progress.current_node_key = payment_stage_2`。
2. 员工侧 headline 显示 `中期进度款`。
3. 客户侧详情显示同一个 workflow-derived 进度，但没有员工动作字段。
4. 未存在 `stage_2 + confirmed` 收款时，complete 收款任务返回
   `WORKFLOW_PAYMENT_COLLECTION_BLOCKED`，端上停留在中期进度款。
5. 存在 `stage_2 + confirmed` 收款且 complete 成功后，刷新详情才显示
   `tiling / 瓦工`。
6. 创建施工日志、确认验收或刷新阶段列表都不能让端上本地越过收款节点。

注意：截至本文档生成时，gooes 仓库已有数据修复 migration，但远端应用被既有
local-only migration drift 阻塞。需要先处理 `20260612133000` 和
`20260612143000` 的迁移状态，再应用新的历史数据修复。

## 后端交付状态

已在 gooes 后端落地：

- `workflow_progress` 投影服务；
- 员工侧项目详情 bootstrap 返回 `workflow_progress`；
- 客户侧项目详情 bootstrap 返回客户安全版 `workflow_progress`；
- `construction_stages` 默认按 workflow runtime 投影，不再从验收/日志直接跳阶段；
- 施工日志、验收创建、客户验收确认增加 workflow runtime guard；
- 历史项目运行态修复 migration 和报告。

小程序团队完成本文档对接后，端上进度显示、按钮动作、任务中心入口都应严格跟随
workflow runtime，不再通过历史施工阶段读模型自行推导。
