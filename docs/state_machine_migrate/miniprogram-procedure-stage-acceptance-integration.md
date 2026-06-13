# 小程序工序完成后触发阶段验收对接说明

## 目标

工程施工 workflow 中，工序节点完成后，小程序端需要让用户进入对应阶段验收。
端上必须按 workflow-only 合约对接：

1. 工序节点完成走 `POST /workflow-tasks/:taskId/complete`。
2. 阶段验收入口从刷新后的 `construction_stages.stages[].acceptance_action`
   读取。
3. 小程序端不得在完成工序时本地直接推断下一阶段，也不得 fallback 到旧项目状态机动作。

本文面向 orange 小程序团队。gooes 仓库为可写仓库，orange 仓库只读核查，
不要求也不包含对 orange 源码的直接修改。

## 只读核查来源

本次核查读取了 orange 的以下文件，未修改 orange 仓库：

| 类型 | 路径 |
| --- | --- |
| workflow task 服务 | `/Users/leefo/Public/work/orange/src/services/workflow_task.ts` |
| 验收服务 | `/Users/leefo/Public/work/orange/src/services/project_acceptance.ts` |
| workflow 日志工具 | `/Users/leefo/Public/work/orange/src/utils/workflow_project_log.ts` |
| 项目详情动作 | `/Users/leefo/Public/work/orange/src/packageProjects/pages/detail/hooks/useProjectNavigationActions.ts` |
| 项目详情 bootstrap | `/Users/leefo/Public/work/orange/src/packageProjects/pages/detail/hooks/useProjectDetailBootstrap.ts` |
| 日志编辑提交 | `/Users/leefo/Public/work/orange/src/packageProjects/pages/logEdit/hooks/useProjectLogEditController.ts` |
| 既有阶段文档 | `/Users/leefo/Public/work/orange/docs/2026-05-26-project-stage-acceptance-card-backend-contract.md` |
| 当前阶段核查文档 | `/Users/leefo/Public/work/orange/docs/2026-06-13-project-construction-current-stage-backend-check.md` |

## 后端接口总览

| 场景 | 接口 |
| --- | --- |
| 项目详情首屏 | `GET /projects/:projectId/employee-detail-bootstrap` |
| 我的 workflow 待办 | `GET /workflow-tasks?page=1&pageSize=20&subject_type=project` |
| 完成工序节点 | `POST /workflow-tasks/:taskId/complete` |
| 创建施工日志 | `POST /project-logs` |
| 查询施工阶段 | `GET /projects/:projectId/construction-stages` |
| 创建阶段验收 | `POST /project-acceptances` |
| 保存验收草稿 | `PATCH /project-acceptances/:id` |
| 提交验收 | `POST /project-acceptances/:id/submit` |
| 主管复核 | `POST /project-acceptances/:id/approve` |
| 客户确认 | `POST /project-acceptances/:id/customer-confirm` |

所有员工端写接口都需要 `Authorization: Bearer <token>`。列表接口必须分页，
端上不得无上限拉取全部任务或验收记录。

## 核心规则

工序完成后触发阶段验收，不是指 `POST /workflow-tasks/:taskId/complete`
自动创建验收单。正确语义是：

1. 用户完成工序节点。
2. 后端推进 workflow runtime。
3. 小程序刷新项目详情或施工阶段接口。
4. 后端在对应阶段返回 `acceptance_action.type = create`。
5. 小程序展示“发起验收”，进入验收详情页创建验收单。

因此，小程序端不能在 complete 成功后直接构造 `POST /project-acceptances`。
是否能发起验收，必须以后端刷新后的 `acceptance_action` 为准。

## 工序节点 action 元数据

小程序从项目详情的 `workflow_state.actions` 或 `/workflow-tasks` 读取当前
workflow action。工序节点如果要求施工日志，会返回 `project_log` 输出字段：

```json
{
  "key": "complete",
  "label": "瓦工施工",
  "task_id": "workflow-task-id",
  "node_key": "tiling",
  "node_type": "procedure",
  "business_domain": null,
  "business_action": null,
  "requires_reason": false,
  "disabled": false,
  "output_fields": [
    {
      "name": "project_log_id",
      "label": "施工日志",
      "type": "project_log",
      "required": true,
      "stage_code": "tiling",
      "min_image_count": 2
    }
  ]
}
```

字段映射：

| 后端字段 | 小程序用途 |
| --- | --- |
| `task_id` | 调用 `POST /workflow-tasks/:taskId/complete` 的路径参数 |
| `key` | complete 请求体里的 `action` |
| `label` | 按钮、节点标题或日志页 `node_name` |
| `output_fields[].type = project_log` | 进入施工日志编辑流程 |
| `output_fields[].stage_code` | 创建施工日志和后续阶段验收的施工阶段 |
| `output_fields[].min_image_count` | 前端图片最少数量校验 |
| `output_fields[].name` | complete 请求体 `output` 的字段名；默认是 `project_log_id` |

## 小程序调用顺序

### 1. 打开项目详情

```http
GET /projects/:projectId/employee-detail-bootstrap
Authorization: Bearer <token>
```

端上读取：

- `workflow_state.actions[]`
- `construction_stages.stages[]`
- `next_action`
- `log_entry.writable_stage`

如果 `workflow_state.actions[]` 中存在 `output_fields[].type = project_log`，
说明当前 workflow 卡在工序节点，入口应进入施工日志编辑页，而不是验收页。

### 2. 创建施工日志

```http
POST /project-logs
Authorization: Bearer <token>
Content-Type: application/json
```

请求体示例：

```json
{
  "project_id": "project-id",
  "stage_code": "tiling",
  "node_name": "瓦工施工",
  "content": "瓦工节点已完成，现场照片已上传。",
  "images": [
    "project-log/object-key-a",
    "project-log/object-key-b"
  ]
}
```

约束：

| 字段 | 要求 |
| --- | --- |
| `project_id` | 必填，当前项目 ID |
| `stage_code` | 必填，使用 action 返回的 `stage_code` |
| `node_name` | 建议传 action `label` 或 workflow 节点标题 |
| `content` | 必填，不能为空 |
| `images` | 如 action 返回 `min_image_count`，端上必须先校验数量 |

施工日志创建失败时，不允许继续调用 workflow complete。

### 3. 完成 workflow 工序节点

```http
POST /workflow-tasks/:taskId/complete
Authorization: Bearer <token>
Content-Type: application/json
```

请求体示例：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "project_log_id": "created-project-log-id",
    "image_count": 2,
    "images": [
      "project-log/object-key-a",
      "project-log/object-key-b"
    ]
  }
}
```

如果 action 返回的 `output_fields[].name` 不是 `project_log_id`，端上需要额外
写入该字段：

```json
{
  "output": {
    "project_log_id": "created-project-log-id",
    "custom_output_name": "created-project-log-id"
  }
}
```

提交规则：

- complete 成功前禁用提交按钮，避免重复创建日志或重复完成 task。
- complete 失败时，保留日志记录，提示后端错误，并刷新项目详情确认当前 task
  是否仍 pending。
- 如果返回 `409`，端上展示后端 `message`，不要当作系统异常。
- 如果 action 缺少 `task_id`，端上不能 fallback 到旧状态机接口推进。

### 4. 刷新项目详情或施工阶段

complete 成功后必须刷新，至少调用一个：

```http
GET /projects/:projectId/employee-detail-bootstrap
GET /projects/:projectId/construction-stages
```

推荐刷新 `employee-detail-bootstrap`，因为它同时返回项目基础信息、workflow
状态、施工阶段和下一步动作。

### 5. 展示阶段验收入口

刷新后，小程序按 `construction_stages.stages[]` 中对应阶段的
`acceptance_action` 决定按钮。

示例：

```json
{
  "stage_code": "tiling",
  "stage_label": "瓦工",
  "status": "in_progress",
  "can_create_acceptance": true,
  "acceptance_id": null,
  "acceptance_status": null,
  "acceptance_action": {
    "type": "create",
    "label": "发起验收",
    "enabled": true,
    "reason": null
  }
}
```

映射规则：

| `acceptance_action.type` | 小程序行为 |
| --- | --- |
| `create` | 展示“发起验收”，进入验收详情创建页 |
| `edit` | 展示“处理验收”，进入已有验收单编辑页 |
| `view` | 展示“查看验收”或“复核验收”，进入已有验收单详情页 |
| `none` | 不展示可点击验收入口，可展示 `reason` |

端上必须同时检查：

- `acceptance_action.enabled === true`
- `acceptance_action.reason === null` 或为空

### 6. 创建阶段验收

如果是 `create`：

```http
POST /project-acceptances
Authorization: Bearer <token>
Content-Type: application/json
```

请求体：

```json
{
  "project_id": "project-id",
  "acceptance_type": "stage",
  "stage_code": "tiling",
  "reviewer_id": "reviewer-employee-id",
  "summary": "瓦工节点完成，发起阶段验收。"
}
```

已有 orange 页面也可以继续通过路由进入验收详情页自动创建：

```text
/packageProjects/pages/acceptanceDetail/index?projectId=<projectId>&stageCode=<stageCode>&mode=edit&create=1
```

如果是竣工阶段 `completion`，需要带：

```text
&acceptanceType=final
```

## 验收状态流转

阶段验收创建后，仍走现有验收业务流：

| 状态 | 端上操作 | 接口 |
| --- | --- | --- |
| `draft` | 保存草稿 | `PATCH /project-acceptances/:id` |
| `draft` / `rejected` | 提交验收 | `POST /project-acceptances/:id/submit` |
| `submitted` | 主管复核通过 | `POST /project-acceptances/:id/approve` |
| `submitted` | 主管驳回 | `POST /project-acceptances/:id/reject` |
| `leader_approved` | 客户确认 | `POST /project-acceptances/:id/customer-confirm` |
| `leader_approved` | 客户异议 | `POST /project-acceptances/:id/customer-dispute` |
| `customer_confirmed` | 阶段完成 | 刷新后该阶段 `status = accepted` |

只有 `project_acceptances.status = customer_confirmed` 后，该施工阶段才被后端视为
`accepted`，后续阶段才会解锁。

## 错误和幂等处理

| 场景 | 小程序处理 |
| --- | --- |
| 施工日志创建失败 | 不调用 workflow complete，停留在日志编辑页 |
| workflow complete 返回 409 | 展示后端 message，刷新 bootstrap，看 task 是否仍 pending |
| workflow complete 返回“待办已处理” | 刷新 bootstrap；如果阶段验收入口已出现，继续验收流程 |
| 创建验收返回已有进行中验收 | 刷新 construction stages，使用返回的 `acceptance_id` 进入已有单 |
| 用户重复点击提交 | 前端加提交锁，后端失败时释放锁 |
| 弱网或接口超时 | 不本地推进 UI 状态，重新拉 bootstrap 校准 |

## orange 端建议改造点

| 模块 | 建议 |
| --- | --- |
| `src/services/workflow_task.ts` | 现有 `complete` 可继续使用，确认 `list` 支持传 `subject_id` 时同步加上 |
| `src/utils/workflow_project_log.ts` | 继续用 `type = project_log` 识别工序日志 action |
| `src/packageProjects/pages/logEdit/hooks/useProjectLogEditController.ts` | 保存日志后 complete workflow，成功后返回项目详情并触发刷新 |
| `src/packageProjects/pages/detail/hooks/useProjectDetailBootstrap.ts` | complete 后必须刷新 `employee-detail-bootstrap`，不要复用旧 `construction_stages` |
| `src/packageProjects/pages/detail/hooks/useProjectNavigationActions.ts` | 验收入口只按 `acceptance_action` / `acceptance_id` 跳转 |
| `src/services/project_acceptance.ts` | 继续复用 create/save/submit/approve/customerConfirm 等现有封装 |
| 待办中心 | 工序待办点击后进入日志页，日志页完成 task 后刷新或回到项目详情 |

## 不再使用的做法

小程序端不要再做以下事情：

- 不要调用旧项目状态机动作推进工序。
- 不要根据 `current_stage` / `next_stage` 本地推断并自动创建验收单。
- 不要在 `POST /workflow-tasks/:taskId/complete` 成功前展示下一阶段已完成。
- 不要跳过刷新直接使用旧的 `construction_stages` 判断验收入口。
- 不要无 `task_id` 时自行构造 complete 请求。

## Smoke 验收清单

| 场景 | 期望 |
| --- | --- |
| 工序节点返回 `project_log` action | 小程序展示施工日志入口 |
| 图片少于 `min_image_count` | 前端阻止提交；后端强校验失败时展示错误 |
| 创建日志成功但 complete 失败 | 日志存在，workflow 节点不推进，端上提示并刷新 |
| complete 成功后刷新 bootstrap | 当前工序 task 消失，施工阶段出现验收 action |
| `acceptance_action.type = create` | 点击进入验收创建页，stageCode 与工序 stageCode 一致 |
| 创建并提交验收 | 阶段状态变为 `pending_acceptance` 或对应验收状态 |
| 主管复核通过 | 阶段验收状态变为 `leader_approved`，等待客户确认 |
| 客户确认 | 阶段状态变为 `accepted`，下一工序解锁 |
| 已有验收单 | 入口进入已有 `acceptance_id`，不重复创建 |
| 弱网重复点击 | 不产生重复 workflow complete；UI 以刷新后的后端状态为准 |

## 与现有文档关系

本文补充工序完成后进入阶段验收的端侧串联规则。相关文档：

- [小程序工序节点施工日志对接说明](./miniprogram-procedure-construction-log-integration.md)
- [小程序收款节点对接说明](./miniprogram-payment-collection-node-integration.md)
- [Orange Workflow 对接文档](./orange-workflow-handoff.md)
- [Orange 施工阶段 current_stage 对接文档](./orange-construction-current-stage-handoff.md)

