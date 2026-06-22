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

筛选项元数据接口（例如 groups/nodes/count）可后续单独增加，当前小程序可先用固定请求参数或现有页面配置联调筛选行为。
