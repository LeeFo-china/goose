# 项目创建选择施工 Workflow 对接说明

日期：2026-06-21

## 目标

同一租户可以有多套施工 workflow，例如标准施工流程、精装施工流程、局改施工流程。项目创建时可以手动选择本项目要使用的施工流程；未选择时，后端使用 Admin 配置的默认施工流程。

## 核心契约

- 小程序/Admin 只选择 `workflow definition id`，不选择版本。
- 后端启动施工实例时使用该 definition 当前的 `active_version_id` 创建实例快照。
- 项目创建成功后，选择结果固化到 `projects.construction_workflow_definition_id`。
- 后续修改租户默认施工流程，不影响已经创建并绑定施工流程的项目。
- 本次 migration 会把尚未绑定的历史项目按当前默认施工流程回填绑定。
- 项目编辑接口不允许修改 `construction_workflow_definition_id`。

## 小程序项目创建接口

### 获取可选施工流程

```http
GET /projects/create/construction-workflows?page=1&pageSize=20
```

返回字段：

```json
{
  "list": [
    {
      "id": "workflow-definition-id",
      "name": "标准施工流程",
      "workflow_key": "construction_main",
      "description": null,
      "active_version_id": "workflow-version-id",
      "is_default": true,
      "updated_at": "2026-06-21T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### 创建项目

手动选择时传：

```json
{
  "name": "张三项目",
  "status": "designing",
  "customer_id": "customer-id",
  "property_id": "property-id",
  "construction_workflow_definition_id": "workflow-definition-id"
}
```

未选择时不要传 `construction_workflow_definition_id`，后端会按租户默认施工流程解析并固化。

## Admin 配置入口

Admin 流程列表中，已发布且分类为“施工阶段”的 workflow 可以设置为默认施工流程。

后端接口：

```http
POST /workflows/:id/project-construction-default
```

约束：

- 只能设置 `category=construction` 的流程。
- 只能设置 `status=active` 且存在 `active_version_id` 的流程。
- 每个租户同时只能有一个 `project/construction` 默认流程。

## 运行时行为

当项目签约 workflow 走到开工动作后，后端按以下顺序启动施工 workflow：

1. 优先使用 `projects.construction_workflow_definition_id`。
2. 如果项目未固化选择，则使用租户默认 `project/construction` workflow。
3. 如果默认也不存在，则拒绝创建/启动并提示先设置默认施工流程。

小程序后续仍然只消费 workflow v2：

- `workflow_state.timeline_nodes`
- `node.display`
- `node.attributes`
- `node.actions`
- `/workflow-tasks?status=pending`
- `POST /workflow-tasks/:taskId/complete`

不要根据 workflow 名称、`workflow_key` 前缀、旧施工阶段字段或本地枚举推导当前节点和动作。
