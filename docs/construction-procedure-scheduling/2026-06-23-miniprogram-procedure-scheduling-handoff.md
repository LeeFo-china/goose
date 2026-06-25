# 施工工序派工排程小程序对接说明

日期：2026-06-23

## 背景

后端已把施工日志、工序开工、工序完成拆成独立契约：

- 施工日志只负责记录施工过程，提交 `POST /project-logs` 不推进 workflow。
- 工序开工由 workflow action `start_procedure` 处理，必须指定施工人员、开工日期和工期。
- 工序完成由 workflow action `complete_procedure` 处理，严格按当前 workflow 节点推进。
- 小程序继续只消费 workflow v2 的 `timeline_nodes[].display/attributes/actions`。

## workflow 节点属性

项目详情页和施工进度展示应读取当前节点的 `attributes`：

| 字段 | 说明 |
| --- | --- |
| `procedure_assignment_id` | 工序派工记录 ID |
| `procedure_assignment_status` | `planned`、`in_progress`、`completed`、`canceled` |
| `procedure_assignee_employee_id` | 当前工序施工人员 ID |
| `procedure_assignee_employee_name` | 当前工序施工人员姓名 |
| `planned_start_date` | 计划开工日期，`YYYY-MM-DD` |
| `planned_duration_days` | 计划工期天数 |
| `planned_end_date` | 计划完工日期，`YYYY-MM-DD` |
| `remaining_days` | 剩余工期天数 |
| `schedule_status` | `not_started`、`on_track`、`due_today`、`overdue`、`completed`、`canceled` |
| `require_log` | 是否要求施工日志 |
| `min_image_count` | 工序完成要求的最少图片数 |
| `acceptance_enabled` | 是否开启阶段验收 |

小程序不要再从旧施工阶段字段、节点名称、本地枚举或日志标题反推当前工序。

## workflow 动作

小程序按钮只来自 `node.actions`、`workflow_state.actions` 或
`/workflow-tasks?status=pending` 返回的 `actions`。

| action key | 说明 | 是否推进 workflow 节点 |
| --- | --- | --- |
| `start_procedure` | 开始工序并创建派工排期 | 否 |
| `adjust_procedure_schedule` | 调整施工人员、开工日期或工期 | 否 |
| `complete_procedure` | 完成当前工序 | 是，或在开启验收时由后端进入验收闭环 |
| `create_acceptance`、`edit_acceptance`、`view_acceptance` | 验收相关入口 | 由验收接口和后端 guard 控制 |

端上提交动作时统一使用：

```http
POST /workflow-tasks/:taskId/complete
```

提交的 `body.action` 必须使用后端返回的 `action.key`，不要使用
`business_action`、`action_label` 或本地默认 `complete` 反推。

## 开工和调整 payload

`start_procedure` 示例：

```json
{
  "action": "start_procedure",
  "reason": null,
  "output": {
    "assignee_employee_id": "employee-id",
    "planned_start_date": "2026-06-24",
    "planned_duration_days": 3
  }
}
```

`adjust_procedure_schedule` 使用同样的 `output` 字段；如果后端要求原因，
小程序按 `requires_reason=true` 展示原因输入。

`complete_procedure` 第一版不需要额外 output：

```json
{
  "action": "complete_procedure",
  "reason": null,
  "output": {}
}
```

## 施工人员候选接口

开工或调整派工前，小程序按当前 action 的 `output_fields` 渲染表单。
当字段包含：

```json
{
  "name": "assignee_employee_id",
  "type": "employee",
  "source": "procedure_candidate"
}
```

使用候选接口查询施工人员：

```http
GET /projects/:projectId/procedure-candidates
```

Query：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `task_id` | 是 | 当前 workflow task ID |
| `planned_start_date` | 是 | 计划开工日期，`YYYY-MM-DD` |
| `planned_duration_days` | 是 | 工期天数，1-365 |
| `stage_code` | 否 | 后端 output field 返回时透传 |
| `keyword` | 否 | 姓名/手机号搜索 |
| `page` | 是 | 默认 1 |
| `pageSize` | 是 | 建议 20 |

响应为分页列表。候选员工中：

- 后端会先按当前工序候选部门过滤，默认部门为工程部 `PROJECT`。
- 后端还会要求员工具备稳定权限 `project_procedure.assignee`，该权限通过员工绑定的
  active 角色授予；小程序不要传或写死租户自定义角色 code。
- `busy=false`：可选择。
- `busy=true`：不能选择，只展示占用信息。
- `busy_assignment.project_name`：员工正在施工的项目。
- `busy_assignment.remaining_days`：剩余工期天数。

UI 建议文案：

- 可选员工：显示姓名、部门、岗位。
- 忙碌员工：显示“正在 {project_name} 施工，剩余 {remaining_days} 天”，并禁用选择。

## 施工日志门禁

项目详情的日志入口继续读取后端 detail bootstrap 的 `log_entry`：

- `log_entry.can_create=true` 才展示写日志入口。
- `log_entry.writable_stage.stage_code` 作为日志 `stage_code`。
- 小程序提交日志只调用 `POST /project-logs`。
- 日志提交成功后只刷新项目详情和 workflow state，不自动 complete workflow task。

后端会在 `procedure_assignment_status=in_progress` 时允许创建当前工序正式日志。
`planned` 状态只能调整派工，不能创建正式施工日志。

## Smoke Checklist

1. 员工登录后进入项目详情。
2. 当前工序节点返回 `start_procedure` action。
3. 根据 action `output_fields` 展示施工人员、开工日期、工期输入。
4. 调用候选接口，忙碌员工禁用并展示占用项目和剩余工期。
5. 提交 `POST /workflow-tasks/:taskId/complete`，`action=start_procedure`。
6. 刷新详情，当前节点仍是同一工序，attributes 出现派工信息。
7. 到计划开工日或后端判定 `in_progress` 后，日志入口可用。
8. 创建施工日志后只刷新详情，不自动推进 workflow。
9. 点击 `complete_procedure` 后，后端按节点验收配置推进或进入验收闭环。

## 责任边界

- gooes 后端/Admin 负责返回稳定的 workflow v2 attributes/actions、候选接口和服务端校验。
- 小程序只负责按返回结构渲染和提交，不本地推导工序推进规则。
- orange 仓库由小程序团队修改，本仓库只保留对接说明。
