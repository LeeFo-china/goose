# Orange Workflow 对接文档

## 范围

本文用于小程序团队对接 gooes 当前 workflow-only 合约。当前可写仓库为
`/Users/leefo/Public/work/gooes`，orange 仓库
`/Users/leefo/Public/work/orange` 只读核查，本文不要求也不包含对 orange 源码
的直接修改。

## 只读核查来源

本次核查读取了 orange 的以下文档和源码：

| 类型 | 路径 |
| --- | --- |
| 计划 | `docs/superpowers/plans/2026-06-13-workflow-manual-gates-miniprogram-plan.md` |
| 历史接口文档 | `docs/2026-05-30-employee-project-detail-bootstrap-backend-spec.md` |
| 历史状态机文档 | `docs/2026-05-21-status-machine-miniprogram-handoff-summary.md` |
| 项目当前阶段核查 | `docs/2026-06-13-project-construction-current-stage-backend-check.md` |
| workflow task 服务 | `src/services/workflow_task.ts` |
| 项目 bootstrap 服务 | `src/services/projects/methods/employee.ts` |
| 项目 bootstrap 类型 | `src/services/projects/types/status.ts` |
| 项目详情 workflow action | `src/packageProjects/pages/detail/hooks/useProjectWorkflowActions.ts` |
| 项目详情 action 提交 | `src/packageProjects/pages/detail/hooks/useProjectWorkflowActionSubmit.ts` |
| 项目日志 workflow 完成 | `src/packageProjects/pages/logEdit/hooks/useProjectLogEditController.ts` |
| 待办中心 | `src/services/task_center.ts`、`src/packageTasks/pages/index/index.tsx` |
| action 工具 | `src/utils/workflow_payment_collection.ts`、`src/utils/workflow_project_log.ts` |

## 当前结论

orange 当前源码已经具备 workflow task 基础能力：

- `WorkflowTaskService` 已封装 `/workflow-tasks`、
  `/workflow-subjects/:subjectType/:subjectId/state`、
  `/workflow-subjects/:subjectType/:subjectId/timeline` 和
  `/workflow-tasks/:taskId/complete`。
- 项目详情已经优先读取 `payload.workflow_state.actions`，并把可执行 action
  转成项目详情按钮。
- 收款节点已识别 `payment_collection`，提交时会调用
  `/workflow-tasks/:taskId/complete` 并传 `payment_status = success`。
- 工序日志节点已识别 `project_log`，可以从项目详情或待办中心跳转日志编辑页，
  创建日志后再完成 workflow task。
- 待办中心已经改读 `/workflow-tasks`，列表分页使用 `page/pageSize`。

仍需 orange 团队完成或确认的点：

- orange 历史 docs 仍有 `status_actions`、`status-transitions`、
  `ProjectStatusActionItem` 相关说明，需要以本文和
  `miniprogram-integration.md` 为准更新或标记废弃。
- `src/services/customer.ts` 仍存在
  `/customers/:id/status-transitions` 读取路径。若只作为历史时间线 fallback，
  需要确认不会用于生成可操作按钮；最终清理阶段应切到
  `/workflow-subjects/customer/:id/timeline?page=1&pageSize=20`。
- 待办中心 `TASK_TABS` 的“项目”当前只筛选 `project_log`，但 service 已能区分
  `project_payment` 和 `project_workflow`。建议 orange 将项目 tab 覆盖
  `project_log`、`project_payment`、`project_workflow`，或拆成“施工日志 /
  收款 / 项目流程”三个入口，避免收款待办只在“全部”中可见。
- `src/packageProjects/pages/detail/README.md` 仍引用已不存在的
  `useProjectStatusTransitionWorkflow.ts`，需要同步为当前
  `useProjectWorkflowActions.ts` 和 `useProjectWorkflowActionSubmit.ts`。
- 施工阶段 `current_stage` 的展示和 workflow action 的执行必须分离。详细对接见
  [Orange 施工阶段 current_stage 对接文档](./orange-construction-current-stage-handoff.md)。

## 后端 API 合约

### 项目详情

```http
GET /projects/:id/employee-detail-bootstrap
Authorization: Bearer <token>
```

响应中项目推进按钮只从 `workflow_state.actions` 读取；`status_actions` 不再是
项目推进数据源。

关键字段：

```json
{
  "workflow_state": {
    "subject_type": "project",
    "subject_id": "project-id",
    "instance_id": "workflow-instance-id",
    "instance_status": "running",
    "current_node_key": "middle_payment",
    "current_node_title": "中期进度款",
    "current_business_kind": "payment_collection",
    "pending_task_count": 1,
    "actions": [
      {
        "key": "complete",
        "label": "中期进度款",
        "task_id": "workflow-task-id",
        "node_key": "middle_payment",
        "node_type": "confirmation",
        "business_domain": "payment_collection",
        "business_action": "confirm_payment",
        "requires_reason": false,
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
    ]
  }
}
```

### 当前对象 workflow 状态

```http
GET /workflow-subjects/:subjectType/:subjectId/state
Authorization: Bearer <token>
```

`subjectType` 当前使用 `customer`、`project`、`expense_request`、`procedure`。

### 当前对象 timeline

```http
GET /workflow-subjects/:subjectType/:subjectId/timeline?page=1&pageSize=20
Authorization: Bearer <token>
```

列表必须分页。端上不得无上限拉取全部历史。

### 我的待办

```http
GET /workflow-tasks?page=1&pageSize=20
GET /workflow-tasks?page=1&pageSize=20&subject_type=project
Authorization: Bearer <token>
```

响应包含 `list` 和 `pagination`。待办中心翻页只递增 `page`，`pageSize` 建议保持
`10` 或 `20`，不得超过后端最大值 `100`。

### 完成待办

```http
POST /workflow-tasks/:taskId/complete
Authorization: Bearer <token>
Content-Type: application/json
```

通用请求体：

```json
{
  "action": "complete",
  "reason": null,
  "output": {}
}
```

端上必须使用 action metadata 里的 `key` 作为请求体 `action`，不能本地硬编码旧
`ProjectStatusAction`。

## 字段映射

| 后端字段 | orange 当前推荐落点 |
| --- | --- |
| `workflow_state.actions[]` | 项目详情按钮、工地页操作、待办中心卡片 |
| `actions[].key` | `WorkflowTaskService.complete(..., { action })` |
| `actions[].task_id` | complete 路径中的 `:taskId` |
| `actions[].label` | 按钮/待办文案 |
| `actions[].business_domain = workflow_project` | 普通项目流程动作 |
| `actions[].business_domain = payment_collection` | 收款闸门动作 |
| `output_fields[].type = payment_collection` | 收款确认弹窗，提交 `payment_status = success` |
| `output_fields[].type = project_log` | 跳施工日志编辑页，创建日志后提交 `project_log_id` |
| `output_fields[].type = number` | 数字输入，例如 `signed_amount` |
| `output_fields[].type = date` | 日期选择，例如 `start_date` |
| `output_fields[].type = employee` | 员工选择，例如 `construction_manager_employee_id` |

## 项目流程节点

普通项目节点按 `node_key` 识别业务动作：

| `node_key` | 端上动作 | `output` |
| --- | --- | --- |
| `designing` | 确认方案 | `{}` |
| `proposal_confirmed` | 项目签约 | `{ "signed_amount": 300000 }` |
| `signed` | 设计定稿 | `{}` |
| `design_finalized` | 排期开工 | `{ "start_date": "2026-06-30", "construction_manager_employee_id": "uuid" }` |
| `pending_start` | 项目开工 | `{}` |
| `started` | 开始施工 | `{}` |
| `constructing` | 发起验收 | `{}` |
| `on_hold` | 恢复项目 | `{}` |

如果 `actions[].disabled = true` 或缺少 `task_id`，端上不能显示可提交按钮，也不能
fallback 到旧状态机接口。

## 收款节点

识别条件：

```json
{
  "business_domain": "payment_collection",
  "business_action": "confirm_payment"
}
```

提交：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "payment_status": "success"
  }
}
```

后端校验项目下对应 `payment_type + confirmed` 收款记录。未满足时返回 `409`，
错误码 `WORKFLOW_PAYMENT_COLLECTION_BLOCKED`。端上应展示后端 message，保持
节点未完成，并允许用户在收款入账后重试。

## 工序施工日志节点

识别条件：

```json
{
  "type": "project_log",
  "name": "project_log_id",
  "stage_code": "plumbing_electrical",
  "min_image_count": 2
}
```

调用顺序：

1. 使用 `stage_code` 打开施工日志编辑页。
2. 按 `min_image_count` 校验图片数量。
3. 调用 `POST /project-logs` 创建日志。
4. 创建成功后调用 `POST /workflow-tasks/:taskId/complete`。

完成待办请求体：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "project_log_id": "created-project-log-id",
    "image_count": 2,
    "images": ["project-log/object-key-a", "project-log/object-key-b"]
  }
}
```

日志创建失败时不允许完成 workflow task。complete 返回
`WORKFLOW_PROCEDURE_REQUIREMENT_BLOCKED` 时，端上应保持节点未完成并提示补齐日志
或图片。

## 施工阶段 current_stage

`construction_stages.current_stage` 只用于施工阶段 timeline 和阶段卡片高亮。
`workflow_state.actions` 才是项目推进、收款、工序节点完成的按钮来源。

如果后端返回：

```json
{
  "construction_stages": {
    "current_stage": "woodwork",
    "next_stage": {
      "stage_code": "woodwork"
    }
  },
  "workflow_state": {
    "current_business_kind": "payment_collection"
  }
}
```

小程序应同时做到：

- 施工阶段 timeline 按 `current_stage = woodwork` 展示。
- 仍展示并提交 `payment_collection` 的 workflow action。
- 不用 `next_stage` 覆盖 `current_stage`。
- 不因为施工阶段已到木工而跳过 workflow 收款节点。

详细规则见
[Orange 施工阶段 current_stage 对接文档](./orange-construction-current-stage-handoff.md)。

## 废弃入口

orange 新版本不得再用以下内容生成或完成项目推进按钮：

| 废弃内容 | 替代 |
| --- | --- |
| `payload.status_actions` | `payload.workflow_state.actions` |
| `GET /projects/:id/status-transitions` | `GET /workflow-subjects/project/:id/timeline?page=1&pageSize=20` |
| `PATCH /projects/:id { "status": "..." }` | `POST /workflow-tasks/:taskId/complete` |
| 旧 `ProjectStatusActionItem` 白名单 | 后端 action metadata |
| `business_domain = project_status` | `workflow_project` 或 `payment_collection` |

## 双击和失败处理

- 点击 complete 后立即禁用按钮，直到请求结束并刷新详情。
- 请求成功后刷新 `employee-detail-bootstrap` 或 subject state，不本地推断下一节点。
- `409` 业务阻塞错误展示后端 message，不当作系统异常吞掉。
- complete 请求失败时不得本地修改流程状态。
- 施工日志场景中，日志创建成功但 workflow complete 失败时，应提示用户重试当前
  workflow task；不要重复创建日志，除非用户明确重新提交。

## 小程序验收清单

| 场景 | 期望 |
| --- | --- |
| 项目详情当前节点为 `proposal_confirmed` | 显示签约动作，提交 `signed_amount` 后进入下一节点 |
| 项目详情当前节点为 `design_finalized` | 显示排期开工，提交开工日期和工程负责人 |
| 水电工序完成后 | 进入中期收款节点，不直接跳到木工/验收 |
| 施工阶段 `current_stage` 与 workflow 节点不同 | 阶段 timeline 以后端 `current_stage` 为准，操作按钮以 `workflow_state.actions` 为准 |
| 中期收款未入账 | complete 返回 `WORKFLOW_PAYMENT_COLLECTION_BLOCKED`，节点保持不变 |
| 中期收款已入账 | complete 成功，刷新后进入下一工序 |
| 工序节点要求日志 | 先创建日志，再 complete workflow task |
| 待办中心“全部” | 显示项目流程、收款、施工日志任务 |
| 待办中心“项目” | 应覆盖 `project_workflow`、`project_payment`、`project_log`，或拆分清晰入口 |
| 无 `workflow_state.actions` | 只读展示，不显示旧状态机按钮 |
| 客户/费用流程 | 可执行按钮来自 `workflow_state.actions` 或 `/workflow-tasks` |

## 交付物

orange 团队需要交付：

- 最低小程序版本号，例如 `2.8.0`。
- 小程序发版或灰度说明。
- 上述验收清单的 smoke 记录。
- 确认人和确认时间。

这些证据需要回填到 gooes：

- `docs/state_machine_migrate/audit/2026-06-13-miniprogram-manual-gates.md`
- `docs/state_machine_migrate/audit/manual-gates.json`

破坏性清理 migration 只能在 manual gate 通过后执行。
