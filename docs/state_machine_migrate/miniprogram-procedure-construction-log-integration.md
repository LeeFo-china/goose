# 小程序工序节点施工日志对接说明

## 目标

工序节点要求施工日志时，小程序必须先创建施工日志，再完成 workflow
待办。端上不能再使用 snake_case 旧路径，施工日志相关接口统一使用
`/project-logs`。

## 后端动作元数据

小程序从项目详情的 `workflow_state.actions` 或
`GET /workflow-tasks?page=1&pageSize=20` 读取可操作动作。工序节点如果配置了
`config.require_log = true`，对应 action 会返回 `project_log` 类型字段：

```json
{
  "key": "complete",
  "label": "水电施工",
  "task_id": "uuid",
  "node_key": "plumbing",
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
      "stage_code": "plumbing_electrical",
      "min_image_count": 2
    }
  ]
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `type = project_log` | 端上渲染“添加施工日志”表单，不是普通文本输入 |
| `stage_code` | 创建施工日志时必须写入的施工阶段 |
| `min_image_count` | 工序要求的最少施工图片数；没有返回时按 `0` 处理 |
| `project_log_id` | 创建施工日志成功后，放入 workflow complete 的 `output.project_log_id` |

## 施工日志接口

### 创建日志

```http
POST /project-logs
Authorization: Bearer <token>
Content-Type: application/json
```

请求体：

```json
{
  "project_id": "uuid",
  "stage_code": "plumbing_electrical",
  "node_name": "水电施工",
  "content": "完成厨房和卫生间水电放线，现场已确认插座点位。",
  "images": [
    "project-log/tenant/project/2026/06/13/a.jpg"
  ]
}
```

约束：

| 字段 | 要求 |
| --- | --- |
| `project_id` | 必填，当前项目 ID |
| `stage_code` | 必填，只能是 `measure`、`demolition`、`plumbing_electrical`、`tiling`、`woodwork`、`painting`、`installation`、`completion` |
| `node_name` | 可选，建议传 workflow 节点标题或工序名 |
| `content` | 必填，不能为空 |
| `images` | 可选；如 action 返回 `min_image_count`，端上必须至少上传对应数量 |
| `employee_id` | 不传，后端根据当前登录员工写入 |
| `created_at` | 不传，后端生成 |

### 查询日志

```http
GET /project-logs/projects?project_id=<project_id>&page=1&pageSize=20
GET /project-logs/projects/calendar?project_id=<project_id>
```

日志列表必须分页，`pageSize` 最大 `100`。小程序不要请求无上限全量日志。

## 小程序提交流程

1. 从 `workflow_state.actions` 或 `/workflow-tasks` 找到 `node_type =
   procedure` 且 `output_fields` 包含 `type = project_log` 的 action。
2. 使用 `stage_code` 锁定施工阶段，展示“添加施工日志”表单。
3. 如需要图片，先走现有图片上传流程，创建日志时提交稳定 object key。
4. 调用 `POST /project-logs` 创建施工日志。
5. 创建成功后取返回的 `data.id`。
6. 调用 `POST /workflow-tasks/:taskId/complete` 完成工序节点。

完成待办请求体：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "project_log_id": "created-project-log-id",
    "image_count": 2,
    "images": [
      "project-log/tenant/project/2026/06/13/a.jpg",
      "project-log/tenant/project/2026/06/13/b.jpg"
    ]
  }
}
```

提交规则：

- 施工日志创建失败时，不允许调用 workflow complete。
- workflow complete 返回 `WORKFLOW_PROCEDURE_REQUIREMENT_BLOCKED` 时，保持节点
  未完成，并提示用户补齐施工日志或图片。
- 创建日志和完成节点期间禁用提交按钮，避免重复创建日志。
- 如果 action 没有 `task_id`，端上不能 fallback 到旧状态机接口推进节点。
- snake_case 旧路径已废弃，小程序不得继续调用。

## 小程序端改造任务

| 模块 | 改造要求 |
| --- | --- |
| 项目详情/工地详情 | 读取 `workflow_state.actions`，识别 `type = project_log` 并展示施工日志表单 |
| 首页待办/任务中心 | `/workflow-tasks` 返回同样 action 时按相同逻辑处理 |
| 施工日志服务 | 创建、列表、日历接口统一切到 `/project-logs` |
| 图片上传 | 继续复用现有施工日志图片上传能力，提交日志时传稳定 object key |
| 错误处理 | 日志创建失败不推进 workflow；节点完成失败时展示后端错误 |

## 验收清单

| 场景 | 期望 |
| --- | --- |
| 工序 action 返回 `project_log` 字段 | 小程序显示“添加施工日志”入口 |
| 日志内容为空 | 前端阻止提交；强行提交时后端返回校验错误 |
| 图片数少于 `min_image_count` | 不允许完成节点 |
| `POST /project-logs` 成功，workflow complete 成功 | 项目日志列表出现新日志，workflow 节点推进 |
| `POST /project-logs` 失败 | workflow 节点保持未完成 |
| 调用 snake_case 旧路径 | 视为错误调用，端上必须移除 |
