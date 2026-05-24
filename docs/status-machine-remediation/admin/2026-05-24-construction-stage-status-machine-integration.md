# Admin 施工阶段子状态机对接

日期：2026-05-24

## 对接目标

Admin 项目详情里的施工日志和工序验收不能再把 `stage_code` 当作任意分类选择。阶段选择必须服从施工阶段子状态机：前置阶段未验收通过，不允许进入下一阶段；必需施工阶段未全部完成，不允许项目进入竣工验收。

## 阶段顺序

必需施工阶段：

```text
拆改 demolition
  -> 水电 plumbing_electrical
  -> 瓦工 tiling
  -> 木工 woodwork
  -> 油工 painting
  -> 安装 installation
```

辅助阶段：

- `measure` 量房复核：不参与施工阶段顺序门禁。
- `completion` 竣工验收：项目主状态进入 `acceptance` 后才允许发起。

## 当前第一阶段后端规则

第一阶段先落后端硬门禁。Admin 即使暂未改 UI，也不能绕过规则。

- `POST /project-logs`：创建施工日志时校验前置阶段是否已完成。
- `POST /project-acceptances`：发起工序验收时校验前置阶段是否已完成。
- `POST /projects/:id/status-transition` 执行 `start_acceptance`：校验必需施工阶段是否全部完成。

完成口径：

```text
project_acceptances.status = customer_confirmed
```

## Admin UI 对接要求

当前第一版已完成项目概览和施工日志 Tab 的施工阶段进度展示、工序验收创建入口的阶段禁用，以及项目状态卡 `start_acceptance` 的前置阻塞提示。Admin 当前没有新增施工日志入口，因此施工日志 Tab 先展示可写阶段和阻塞原因，不新增写入口。

阶段 3 完整对接要求：

1. 项目详情增加施工阶段进度区，展示每个阶段的状态。
2. 新增施工日志时，阶段选择只展示后端允许进入的阶段。
3. 发起工序验收时，默认选中当前可验收阶段。
4. 被阻塞阶段展示阻塞原因，例如“拆改验收未通过，不能进入水电”。
5. 项目状态按钮 `start_acceptance` 前先读取 `GET /projects/:id/construction-stages`；`required_completed=false` 时禁用按钮，并展示 `missing_required_stages`。
6. 状态变更、验收提交、客户确认后刷新项目详情、验收列表、施工阶段进度和项目状态动作。

## 项目竣工验收按钮

项目处于 `constructing` 且 `GET /projects/:id/status-actions` 返回 `start_acceptance` 时，Admin 仍必须同时检查施工阶段状态：

- `required_completed=true`：允许点击 `start_acceptance`。
- `required_completed=false`：按钮置灰，Tooltip 和卡片提示展示缺失阶段，例如“进入竣工验收前，还需完成：水电、瓦工”。
- 读取施工阶段失败时，不在前端伪造放行判断；最终仍以后端 `POST /projects/:id/status-transition` 的硬校验为准。

## 错误处理

后端会返回中文错误。Admin 不需要自行翻译。

典型错误：

- `请先完成拆改验收后再进入水电`
- `项目进入竣工验收前，必须先完成拆改、水电、瓦工、木工、油工、安装验收`
- `项目进入竣工验收后才能发起竣工验收`

## 施工阶段状态接口

已新增施工阶段状态查询接口，Admin 应以该接口作为 UI 的唯一阶段状态来源，不再根据验收列表自行推导。

接口：

```http
GET /projects/:id/construction-stages
```

返回示例：

```json
{
  "project_status": "constructing",
  "required_completed": false,
  "current_stage": "plumbing_electrical",
  "next_stage": {
    "stage_code": "plumbing_electrical",
    "stage_label": "水电",
    "status": "in_progress",
    "can_create_log": true,
    "can_create_acceptance": true,
    "blocked_reason": null
  },
  "missing_required_stages": [
    {
      "stage_code": "plumbing_electrical",
      "stage_label": "水电"
    }
  ],
  "stages": [
    {
      "stage_code": "demolition",
      "stage_label": "拆改",
      "status": "accepted",
      "is_required": true,
      "is_completion": false,
      "can_create_log": false,
      "can_create_acceptance": false,
      "acceptance_id": "uuid",
      "acceptance_status": "customer_confirmed",
      "latest_log": {
        "id": "uuid",
        "node_name": "墙体拆改",
        "content": "现场拆改完成",
        "created_at": "2026-05-24T10:00:00.000Z"
      },
      "blocked_reason": null
    },
    {
      "stage_code": "plumbing_electrical",
      "stage_label": "水电",
      "status": "in_progress",
      "is_required": true,
      "is_completion": false,
      "can_create_log": true,
      "can_create_acceptance": true,
      "acceptance_id": null,
      "acceptance_status": null,
      "latest_log": null,
      "blocked_reason": null
    }
  ]
}
```

## 一致性检查

上线或回填历史数据后，Admin 不直接修数据，后端通过脚本输出待处理清单：

```bash
bun run api:construction-stage-check
```

输出 JSON 包含：

- `project_log_stage_prerequisite_missing`
- `project_acceptance_stage_prerequisite_missing`
- `project_acceptance_status_missing_required_stage`
