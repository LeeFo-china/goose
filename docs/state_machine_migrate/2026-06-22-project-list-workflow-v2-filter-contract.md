# 项目列表 Workflow v2 筛选契约

日期：2026-06-22

## 背景

项目列表不再使用旧项目状态、旧施工阶段字段、本地节点名称或 node_key 前缀推导“签约阶段 / 施工阶段”。列表展示和筛选统一以 workflow runtime v2 为准。

## 后端返回

`GET /projects/status` 的每个列表项继续返回 `workflow_progress`，并补齐当前流程分组：

```json
{
  "workflow_progress": {
    "instance_status": "running",
    "current_group_key": "construction",
    "current_group_label": "施工阶段",
    "current_group_order": 20,
    "current_node_key": "procedure_plumbing_electrical",
    "current_node_title": "水电",
    "timeline_nodes": [
      {
        "node_key": "procedure_plumbing_electrical",
        "node_title": "水电",
        "group": {
          "key": "construction",
          "label": "施工阶段",
          "order": 20
        },
        "display": {
          "label": "水电",
          "status_label": "当前"
        },
        "attributes": {},
        "actions": []
      }
    ]
  }
}
```

`GET /workflow-subjects/project/:projectId/state` 的 `workflow_state` 也同步返回 `current_group_key`、`current_group_label`、`current_group_order`，用于详情页和列表保持同一口径。

## 筛选参数

`GET /projects/status` 新增后端分页前筛选参数：

- `workflow_group_key`：流程分组，例如 `signing`、`construction`
- `workflow_node_key`：流程节点 key，例如 `procedure_plumbing_electrical`
- `workflow_instance_status`：流程实例状态，例如 `running`、`completed`

筛选在后端执行，返回的 `pagination.total` 是筛选后的真实总数。小程序端不要对当前页结果做本地过滤来计算总数。

## 筛选项接口

`GET /projects/workflow-filters`

认证：员工登录态，使用租户上下文。接口会按当前员工的 `project.read` 可见范围聚合，不返回无权限项目的筛选计数。

Query：

- `ownership=self | all`：可选，和项目列表归属筛选口径一致

响应：

```json
{
  "groups": [
    {
      "key": "construction",
      "label": "施工阶段",
      "order": 20,
      "count": 5
    }
  ],
  "nodes": [
    {
      "key": "procedure_plumbing_electrical",
      "label": "水电",
      "group_key": "construction",
      "group_label": "施工阶段",
      "group_order": 20,
      "order": 0,
      "count": 2
    }
  ],
  "instance_statuses": [
    {
      "key": "running",
      "label": "进行中",
      "order": 10,
      "count": 4
    }
  ]
}
```

小程序列表筛选建议：

- 一级筛选渲染 `groups[]`，提交 `workflow_group_key`
- 二级筛选渲染对应 `nodes[]`，提交 `workflow_node_key`
- 实例状态筛选渲染 `instance_statuses[]`，提交 `workflow_instance_status`
- `nodes[].count` 是当前员工可见范围内处于该节点的项目数量
- `nodes[].order` 是后端提供的组内稳定顺序，前端不要用节点名或 key 自行排序

## 小程序对接口径

- 第一层筛选使用 `workflow_group_key`。
- 第二层筛选使用 `workflow_node_key`。
- 列表展示使用 `workflow_progress.current_group_label` 和 `workflow_progress.current_node_title`。
- 节点展示继续使用 `timeline_nodes[].display`。
- 节点能力继续使用 `timeline_nodes[].attributes`。
- 交互继续使用 `timeline_nodes[].actions`、`workflow_state.actions` 或 `/workflow-tasks` 返回的 `actions`。
- 不再读取或兼容旧字段：`current_stage`、`current_stage_label`、`stage_code`、`stage_label`、`current_construction_stage`。

## 当前范围

本次已完成：

- `timeline_nodes[]` 返回 `group`
- `workflow_progress` 返回当前 group 摘要
- `workflow_state` 返回当前 group 摘要
- `/projects/status` 支持 `workflow_group_key`、`workflow_node_key`、`workflow_instance_status` 后端筛选
- `/projects/workflow-filters` 返回 groups、nodes、instance_statuses 及可见范围 count

## 后端只读 Smoke

日期：2026-06-22

账号上下文：`18800000001 / 风清扬` 对应员工 `d8ecc522-e6a1-49d6-b7b7-aaa0f3084826`，租户 `3eebca47-961f-4899-b976-a3d3208d326b`。

执行：

```bash
bun --env-file=../../.env.local -e '... projectSer.listProjectWorkflowFilters({ authContext, query: {} }) ...'
```

结果摘要：

- `groups`: `signing / 签约阶段 / count=1`，`construction / 施工阶段 / count=5`
- `instance_statuses`: `running / count=4`，`completed / count=1`
- `nodes` 返回当前可见项目的 workflow 当前节点，包含 `key`、`label`、`group_key`、`order`、`count`
